import { FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { SubscriptionManager } from '../lib/subscriptionManager';
import { OpenRouterManager } from '../lib/openRouterManager';

export interface SubscriptionMiddlewareOptions {
  supabase: SupabaseClient;
  action: 'create_memory' | 'export_session' | 'export_context' | 'use_premium_model';
  logger: any;
}

/**
 * Middleware to check if user can perform subscription-limited actions
 */
export function createSubscriptionMiddleware(options: SubscriptionMiddlewareOptions) {
  return async (request: FastifyRequest, reply: FastifyReply, done: any) => {
    try {
      const { supabase, action, logger } = options;
      const userId = request.user?.id;

      if (!userId) {
        return reply.code(401).send({ error: 'User not authenticated' });
      }

      const openRouterManager = new OpenRouterManager(
        process.env.OPENROUTER_PROVISIONING_KEY!
      );

      const subscriptionManager = new SubscriptionManager(
        supabase,
        openRouterManager,
        logger
      );

      const canPerform = await subscriptionManager.canUserPerformAction(userId, action);

      if (!canPerform) {
        const limits = await subscriptionManager.getUserLimits(userId);
        const subscription = await subscriptionManager.getUserSubscription(userId);

        let errorMessage = 'Action not allowed with current subscription plan';
        let upgradeMessage = 'Please upgrade your plan to continue';

        switch (action) {
          case 'create_memory':
            errorMessage = `Memory limit reached. You can store up to ${limits?.memory_limit || 0} memories on your current plan.`;
            break;
          case 'export_session':
            errorMessage = `Session API export limit reached. You can export up to ${limits?.session_limit || 0} session APIs on your current plan.`;
            break;
          case 'export_context':
            errorMessage = `Context API export limit reached. You can export up to ${limits?.context_limit || 0} context APIs on your current plan.`;
            break;
          case 'use_premium_model':
            errorMessage = 'Premium models are not available on the free plan.';
            break;
        }

        return reply.code(403).send({
          error: 'Subscription limit exceeded',
          message: errorMessage,
          upgradeMessage,
          currentPlan: subscription?.name || 'Free',
          limits: limits || {},
          upgradeUrl: '/api/payment/plans'
        });
      }

      done();
    } catch (error: any) {
      options.logger.error({ msg: 'Error in subscription middleware', error: error.message });
      return reply.code(500).send({ error: 'Internal server error' });
    }
  };
}

/**
 * Middleware to check model access permissions
 */
export function createModelAccessMiddleware(supabase: SupabaseClient, logger: any) {
  return async (request: FastifyRequest, reply: FastifyReply, done: any) => {
    try {
      const userId = request.user?.id;
      const body = request.body as any;
      const modelId = body?.model;

      if (!userId || !modelId) {
        return done();
      }

      // List of free models (these should match your actual free model IDs)
      const freeModels = [
        'meta-llama/llama-3.2-3b-instruct:free',
        'meta-llama/llama-3.2-1b-instruct:free',
        'google/gemma-2-9b-it:free',
        'microsoft/phi-3-mini-128k-instruct:free',
        'qwen/qwen-2-7b-instruct:free',
        'openchat/openchat-7b:free',
        'gryphe/mythomist-7b:free',
        'undi95/toppy-m-7b:free'
      ];

      const isPremiumModel = !freeModels.includes(modelId) && !modelId.includes(':free');

      if (isPremiumModel) {
        const openRouterManager = new OpenRouterManager(
          process.env.OPENROUTER_PROVISIONING_KEY!
        );

        const subscriptionManager = new SubscriptionManager(
          supabase,
          openRouterManager,
          logger
        );

        const canUsePremium = await subscriptionManager.canUserPerformAction(userId, 'use_premium_model');

        if (!canUsePremium) {
          return reply.code(403).send({
            error: 'Premium model access denied',
            message: 'This model requires a paid subscription plan',
            modelId,
            freeModels,
            upgradeUrl: '/api/payment/plans'
          });
        }
      }

      done();
    } catch (error: any) {
      logger.error({ msg: 'Error in model access middleware', error: error.message });
      return reply.code(500).send({ error: 'Internal server error' });
    }
  };
}

/**
 * Middleware to enforce OpenRouter API key usage based on user's credit balance
 */
export function createApiKeyMiddleware(supabase: SupabaseClient, logger: any) {
  return async (request: FastifyRequest, reply: FastifyReply, done: any) => {
    try {
      const userId = request.user?.id;

      if (!userId) {
        return done();
      }

      // Get user's OpenRouter API key
      const openRouterManager = new OpenRouterManager(
        process.env.OPENROUTER_PROVISIONING_KEY!
      );

      const userApiKey = await openRouterManager.getUserApiKey(userId, supabase, logger);

      if (userApiKey) {
        // Replace the global OpenRouter key with user's personal key
        (request as any).userOpenRouterKey = userApiKey;
        logger.info({ msg: 'Using user-specific OpenRouter API key', userId });
      } else {
        // User doesn't have a personal key, will use global key
        logger.info({ msg: 'Using global OpenRouter API key', userId });
      }

      done();
    } catch (error: any) {
      logger.error({ msg: 'Error in API key middleware', error: error.message });
      // Don't fail the request, just use global key
      done();
    }
  };
}

/**
 * Helper function to get the appropriate OpenRouter API key for a request
 */
export function getOpenRouterKey(request: FastifyRequest, fallbackKey: string): string {
  return (request as any).userOpenRouterKey || fallbackKey;
}

/**
 * Middleware to track API usage and deduct from user credits
 */
export function createUsageTrackingMiddleware(supabase: SupabaseClient, logger: any) {
  return async (request: FastifyRequest, reply: FastifyReply, done: any) => {
    const originalSend = reply.send;
    
    reply.send = function(payload: any) {
      // Track usage after response is sent
      setImmediate(async () => {
        try {
          const userId = request.user?.id;
          if (!userId) return;

          // Extract usage information from the response
          // This would need to be customized based on OpenRouter's response format
          const usage = extractUsageFromResponse(payload);
          
          if (usage && usage.cost > 0) {
            // Deduct credits from user's balance
            await supabase.rpc('update_user_credits', {
              p_user_id: userId,
              p_credit_amount: -usage.cost, // Negative to deduct
              p_transaction_id: null,
              p_description: `API usage - ${usage.model} (${usage.tokens} tokens)`
            });

            logger.info({ 
              msg: 'API usage tracked', 
              userId, 
              cost: usage.cost, 
              model: usage.model,
              tokens: usage.tokens
            });
          }
        } catch (error: any) {
          logger.error({ msg: 'Error tracking API usage', error: error.message });
        }
      });

      return originalSend.call(this, payload);
    };

    done();
  };
}

/**
 * Extract usage information from OpenRouter response
 */
function extractUsageFromResponse(payload: any): { cost: number; model: string; tokens: number } | null {
  try {
    if (typeof payload === 'string') {
      payload = JSON.parse(payload);
    }

    // OpenRouter typically includes usage in the response
    const usage = payload?.usage;
    if (!usage) return null;

    // This is a simplified calculation - you'd need to implement proper cost calculation
    // based on OpenRouter's pricing model
    const totalTokens = usage.total_tokens || 0;
    const model = payload?.model || 'unknown';
    
    // Rough cost estimation (this should be based on actual model pricing)
    const costPerToken = 0.0001; // Example rate
    const cost = totalTokens * costPerToken;

    return {
      cost: parseFloat(cost.toFixed(4)),
      model,
      tokens: totalTokens
    };
  } catch (error) {
    return null;
  }
}