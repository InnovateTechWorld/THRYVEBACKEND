import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { OpenRouterManager, OpenRouterError } from '../lib/openRouterManager';

// Extend FastifyRequest to include credit check data
declare module 'fastify' {
  interface FastifyRequest {
    creditCheck?: {
      sufficient: boolean;
      available: number;
      userApiKey: string | null;
      isFreeModel?: boolean;
    };
  }
}

interface CreditCheckMiddlewareOptions {
  supabase: SupabaseClient;
  openRouterProvisioningKey: string;
  requiredCredits?: number;
}

// Routes that require credit checking
const CREDIT_CHECK_ROUTES = [
  '/api/exported/context/',
  '/api/exported/session/',
  '/context/',
  '/session/',
  '/chat/message' // ✅ Add main chat route
];

// Routes that skip credit check (like models listing)
const SKIP_CREDIT_CHECK_ROUTES = [
  '/api/exported/v1/models',
  '/api/exported/context/v1/models',
  '/api/exported/session/v1/models',
  '/models',
  '/models/free'
];

export function createCreditCheckMiddleware(options: CreditCheckMiddlewareOptions) {
const { supabase, openRouterProvisioningKey, requiredCredits = 0.001 } = options;


  return async function creditCheckMiddleware(request: FastifyRequest, reply: FastifyReply) {
    // Skip credit check for specific routes
    if (SKIP_CREDIT_CHECK_ROUTES.some(route => request.url === route || request.url.endsWith(route))) {
      return;
    }

    // Skip if not a credit-check required route
    const needsCreditCheck = CREDIT_CHECK_ROUTES.some(route => request.url.includes(route));
    if (!needsCreditCheck) {
      return;
    }

    // Skip credit check for non-POST requests
    if (request.method !== 'POST') {
      return;
    }

    try {
      let userId: string;

      // Get userId from different sources depending on route type
      if (request.user?.id) {
        userId = request.user.id;
      } else if ((request as any).exportedApiData?.user_id) {
        userId = (request as any).exportedApiData.user_id;
      } else {
        return; // No user found, skip credit check (will be handled by route auth)
      }

      const openRouterManager = new OpenRouterManager(openRouterProvisioningKey);
      
      // ✅ FIX: Get model ID from request body to check if it's free
      const body = request.body as any;
      const modelId = body?.model;

      // ✅ FIX: Check if model is free FIRST - skip credit check for free models
      if (modelId && !openRouterManager.checkModelRequiresCredits(modelId)) {
        request.log.info({ 
          msg: 'Free model detected in middleware - skipping credit check', 
          userId, 
          modelId 
        });
        
        // Store that this is a free model for route handlers
        request.creditCheck = {
          sufficient: true,
          available: 0,
          userApiKey: null,
          isFreeModel: true
        };
        
        return; // Skip credit check for free models
      }

      // Only check credits for paid models
      request.log.info({ 
        msg: 'Paid model detected - performing credit check', 
        userId, 
        modelId: modelId || 'unknown' 
      });
      
      // Check user credits for paid models
      const creditCheckResponse = await openRouterManager.checkUserCredits(
        userId, 
        requiredCredits,
        supabase,
        request.log,
        modelId // ✅ Pass model ID to credit check
      );

      if (!creditCheckResponse.success) {
        if (creditCheckResponse.error?.code === OpenRouterError.KEY_NOT_FOUND) {
          request.log.error({ msg: 'User OpenRouter key not found during credit check', userId });
          return reply.code(404).send({
            error: {
              message: 'OpenRouter key not found. Please contact support.',
              type: 'authentication_error',
              code: 'user_key_not_found'
            }
          });
        } else if (creditCheckResponse.error?.code === OpenRouterError.INSUFFICIENT_CREDITS) {
          // ✅ Enhanced error with free model suggestions
          request.log.warn({ 
            msg: 'User has insufficient credits in middleware', 
            userId, 
            modelId,
            error: creditCheckResponse.error 
          });
          
          // Return appropriate error format based on route type
          const isExportedApi = request.url.includes('/api/exported/') || 
                               request.url.includes('/context/') || 
                               request.url.includes('/session/');

          if (isExportedApi) {
            return reply.code(402).send({
              error: {
                message: creditCheckResponse.error.message,
                type: 'insufficient_quota',
                code: 'credit_insufficient',
                details: {
                  available: creditCheckResponse.error.details?.available || 0,
                  freeModelsAvailable: creditCheckResponse.error.details?.freeModelsAvailable || [],
                  suggestion: creditCheckResponse.error.details?.suggestion || 'Consider using a free model',
                  freeModelPattern: 'Models ending with ":free" don\'t require credits'
                }
              }
            });
          } else {
            return reply.code(402).send({
              error: 'CREDIT_INSUFFICIENT',
              message: creditCheckResponse.error.message,
              details: {
                available: creditCheckResponse.error.details?.available || 0,
                required: creditCheckResponse.error.details?.required || requiredCredits,
                freeModelsAvailable: creditCheckResponse.error.details?.freeModelsAvailable || [],
                suggestion: creditCheckResponse.error.details?.suggestion || 'Consider using a free model',
                freeModelPattern: creditCheckResponse.error.details?.freeModelPattern || 'Models ending with ":free" don\'t require credits'
              }
            });
          }
        } else {
          request.log.error({ 
            msg: 'Credit check failed in middleware', 
            userId, 
            error: creditCheckResponse.error 
          });
          return reply.code(500).send({
            error: {
              message: creditCheckResponse.error?.message || 'Credit check failed',
              type: 'api_error',
              code: 'credit_check_failed'
            }
          });
        }
      }

      const { sufficient, available, isFreeModel } = creditCheckResponse.data!;

      // Check if user has sufficient credits for paid models
      if (!isFreeModel && (!sufficient || available <= 0)) {
        request.log.warn({ 
          msg: 'User has insufficient credits for paid model in middleware', 
          userId, 
          available, 
          sufficient,
          requiredCredits,
          modelId 
        });
        
        // Return appropriate error format based on route type
        const isExportedApi = request.url.includes('/api/exported/') || 
                             request.url.includes('/context/') || 
                             request.url.includes('/session/');

        if (isExportedApi) {
          return reply.code(402).send({
            error: {
              message: 'Your credit balance is insufficient for this paid model. Please top up or use a free model.',
              type: 'insufficient_quota',
              code: 'credit_insufficient',
              details: {
                available,
                modelType: 'paid',
                suggestion: 'Try a model ending with ":free" which doesn\'t require credits'
              }
            }
          });
        } else {
          return reply.code(402).send({
            error: 'CREDIT_INSUFFICIENT',
            message: 'Your credit balance is insufficient for this paid model. Please top up or use a free model.',
            details: { 
              available, 
              sufficient,
              modelType: 'paid',
              suggestion: 'Try a model ending with ":free" which doesn\'t require credits'
            }
          });
        }
      }

      // Get user's API key for later use
      const apiKeyResponse = await openRouterManager.getUserApiKey(userId, supabase, request.log);

      // Store credit check results and user API key in request for route handlers to use
      request.creditCheck = {
        sufficient,
        available,
        userApiKey: apiKeyResponse.success ? (apiKeyResponse.data || null) : null,
        isFreeModel: isFreeModel || false
      };

      request.log.info({
        msg: 'Credit check passed in middleware',
        userId,
        available,
        sufficient,
        modelType: isFreeModel ? 'free' : 'paid',
        hasUserKey: !!request.creditCheck?.userApiKey
      });

    } catch (error: any) {
      request.log.error({ 
        msg: 'Credit check middleware error', 
        err: error,
        url: request.url 
      });
      return reply.code(500).send({
        error: {
          message: 'Credit check failed',
          type: 'api_error',
          code: 'credit_check_error'
        }
      });
    }
  };
}

// Helper function to register the middleware with Fastify
export function registerCreditCheckMiddleware(
  fastify: FastifyInstance, 
  options: CreditCheckMiddlewareOptions
) {
  const middleware = createCreditCheckMiddleware(options);
  fastify.addHook('preHandler', middleware);
}