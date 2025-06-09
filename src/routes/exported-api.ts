import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyExportedApiKey, logApiUsage, ExportedApiData } from '../lib/apiUtils';
import { getUserContext, buildExportedContextAwareMessages, buildExportedSessionAwareMessages, processMessageContent, extractOpenAIParameters } from '../lib/context';
import { callOpenRouter, filterRelevantContext, getModelCapabilities } from '../lib/ai';
import { EncryptionUtils } from '../utils/encryption';
import { OpenRouterManager, OpenRouterError } from '../lib/openRouterManager';

// Define a type for the request user after API key verification
interface AuthenticatedRequest extends FastifyRequest {
  exportedApiData?: ExportedApiData;
}

// Error codes for OpenRouter integration
enum ExportedApiError {
  MODEL_NOT_ALLOWED_FOR_PLAN = 'MODEL_NOT_ALLOWED_FOR_PLAN',
  CREDIT_INSUFFICIENT = 'CREDIT_INSUFFICIENT',
  USER_KEY_DISABLED = 'USER_KEY_DISABLED',
  USER_KEY_NOT_FOUND = 'USER_KEY_NOT_FOUND'
}

// Enhanced chat completions body with full OpenAI compatibility
interface EnhancedChatCompletionsBody {
  model?: string;
  messages: any[];
  stream?: boolean;
  
  // Generation parameters
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  min_p?: number;
  stop?: string | string[];
  
  // Reasoning parameters (for R1 and similar models)
  reasoning?: boolean;
  include_reasoning?: boolean;
  
  // Tool parameters
  tools?: any[];
  tool_choice?: any;
  
  // Response format parameters
  response_format?: any;
  structured_outputs?: boolean;
  
  // Logit parameters
  logit_bias?: Record<string, number>;
  logprobs?: boolean;
  top_logprobs?: number;
  
  // Seed for deterministic outputs
  seed?: number;
  
  // Custom system prompt override (our enhancement)
  system_prompt?: string;
}

export async function exportedApiRoutes(
    fastify: FastifyInstance,
    options: {
        supabase: SupabaseClient,
        genAI: GoogleGenerativeAI,
        openRouterProvisioningKey: string
    }
) {
  const { supabase, genAI, openRouterProvisioningKey } = options;

  fastify.addHook('preHandler', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const apiKeyHeader = request.headers.authorization;
    if (!apiKeyHeader || !apiKeyHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ 
        error: { 
          message: 'Missing or invalid API key. Use Bearer token format.',
          type: 'invalid_request_error',
          code: 'invalid_api_key'
        } 
      });
    }
    const apiKey = apiKeyHeader.split(' ')[1];

    let expectedType: 'context' | 'session' = 'context';
    if (request.url.includes('/session/v1/')) {
      expectedType = 'session';
    }
    
    if (request.url.includes('/models')) {
        try {
            const hashedKey = EncryptionUtils.hashApiKey(apiKey);
            const { data, error } = await supabase
              .from('exported_apis')
              .select('*')
              .eq('api_key_hash', hashedKey)
              .eq('is_active', true)
              .single();
            if (error || !data) throw new Error('Invalid or inactive API key for models endpoint.');
            request.exportedApiData = data as ExportedApiData;
        } catch (error: any) {
            fastify.log.warn({ msg: 'API Key verification failed for /models endpoint', err: error.message });
            return reply.code(403).send({ 
              error: { 
                message: `API Key verification failed: ${error.message}`,
                type: 'authentication_error',
                code: 'invalid_api_key'
              } 
            });
        }
    } else {
        try {
            request.exportedApiData = await verifyExportedApiKey(apiKey, expectedType, supabase, fastify.log);
        } catch (error: any) {
            fastify.log.warn({ msg: 'API Key verification failed in exported-api preHandler', err: error.message });
            return reply.code(403).send({ 
              error: { 
                message: `API Key verification failed: ${error.message}`,
                type: 'authentication_error',
                code: 'invalid_api_key'
              } 
            });
        }
    }
  });

  // Enhanced context API endpoint
  fastify.post(
    '/api/exported/context/v1/chat/completions',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      const body = request.body as EnhancedChatCompletionsBody;
      const exportData = request.exportedApiData!;
      const apiKey = request.headers.authorization!.split(' ')[1];
      const startTime = Date.now();
      let promptTokens = 0;
      let completionTokens = 0;

      try {
        fastify.log.info({
          msg: '🔵 CONTEXT API - Request Started',
          apiKeyId: exportData.id,
          userId: exportData.user_id,
          model: body.model || exportData.base_model,
          includeMemories: exportData.include_memories,
          includeNotes: exportData.include_notes,
          thirdPartySystemPrompt: body.system_prompt ? 'PROVIDED' : 'NOT_PROVIDED'
        });

        // Validate required fields
        if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
          return reply.code(400).send({
            error: {
              message: 'messages is required and must be a non-empty array',
              type: 'invalid_request_error',
              code: 'invalid_messages'
            }
          });
        }

        // Extract and validate parameters
        const params = extractOpenAIParameters(body);
        const modelToUse = params.model || exportData.base_model;

        // Check model permissions
        if (!exportData.allowed_models || !exportData.allowed_models.includes(modelToUse)) {
          return reply.code(403).send({
            error: {
              message: `Model '${modelToUse}' not allowed for this API key. Allowed models: ${exportData.allowed_models?.join(', ')}`,
              type: 'invalid_request_error',
              code: 'model_not_allowed'
            }
          });
        }

        // Get model capabilities for optimization
        const modelCapabilities = getModelCapabilities(modelToUse);

        // STEP 1: Get user context
        fastify.log.info({
          msg: '🔵 CONTEXT API - Step 1: Getting User Context',
          userId: exportData.user_id
        });
        const userContext = await getUserContext(exportData.user_id, supabase, fastify.log);
        fastify.log.info({
          msg: '🔵 CONTEXT API - Step 1 Complete: User Context Retrieved',
          memoriesCount: userContext.memories.length,
          notesCount: userContext.notes.length,
          userSystemPrompt: userContext.systemPrompt
        });

        // STEP 2: Filter relevant context if memories/notes are enabled and we have content to filter
        let contentForFiltering = '';
        const lastMessage = body.messages[body.messages.length - 1];
        if (lastMessage?.content) {
          contentForFiltering = processMessageContent(lastMessage.content);
        }

        if (contentForFiltering.trim() && (exportData.include_memories || exportData.include_notes) && 
            (userContext.memories.length > 0 || userContext.notes.length > 0)) {
            
            fastify.log.info({
              msg: '🔵 CONTEXT API - Step 2: Starting Gemini Context Filtering',
              contentForFiltering: contentForFiltering,
              memoriesToFilter: exportData.include_memories ? userContext.memories.length : 0,
              notesToFilter: exportData.include_notes ? userContext.notes.length : 0
            });

            const memoriesToFilter = exportData.include_memories ? userContext.memories : [];
            const notesToFilter = exportData.include_notes ? userContext.notes : [];

            const { relevantMemories, relevantNotes } = await filterRelevantContext(
              contentForFiltering, memoriesToFilter, notesToFilter, genAI, fastify.log
            );
            userContext.relevantMemories = relevantMemories;
            userContext.relevantNotes = relevantNotes;

            fastify.log.info({
              msg: '🔵 CONTEXT API - Step 2 Complete: Gemini Context Filtering Done',
              relevantMemoriesCount: relevantMemories.length,
              relevantNotesCount: relevantNotes.length,
              relevantMemories: relevantMemories,
              relevantNotes: relevantNotes
            });
        } else {
            userContext.relevantMemories = [];
            userContext.relevantNotes = [];
            fastify.log.info({
              msg: '🔵 CONTEXT API - Step 2: Skipping Gemini Context Filtering',
              reason: !contentForFiltering.trim() ? 'No content to filter' : 
                      !(exportData.include_memories || exportData.include_notes) ? 'Memories/notes disabled' :
                      !(userContext.memories.length > 0 || userContext.notes.length > 0) ? 'No memories/notes available' : 'Unknown'
            });
        }

        // STEP 3: Build context-aware messages with enhanced system prompt
        fastify.log.info({
          msg: '🔵 CONTEXT API - Step 3: Building Enhanced System Prompt',
          baseSystemPrompt: body.system_prompt || userContext.systemPrompt,
          willIncludeMemories: exportData.include_memories && userContext.relevantMemories && userContext.relevantMemories.length > 0,
          willIncludeNotes: exportData.include_notes && userContext.relevantNotes && userContext.relevantNotes.length > 0
        });

        const contextAwareMessages = buildExportedContextAwareMessages(
          userContext, 
          [], // No session history for context API
          body.messages, 
          exportData,
          body.system_prompt // Allow third-party system prompt override
        );

        fastify.log.info({
          msg: '🔵 CONTEXT API - Step 3 Complete: Enhanced System Prompt Built',
          finalSystemPrompt: contextAwareMessages[0].content,
          totalMessagesCount: contextAwareMessages.length,
          messageTypes: contextAwareMessages.map(m => m.role)
        });

        // Prepare parameters for OpenRouter, excluding our custom fields
        const openRouterParams = { ...params };
        delete openRouterParams.model;
        delete (openRouterParams as any).system_prompt; // Remove our custom field

        // Validate max_tokens against model capabilities
        if (openRouterParams.max_tokens && openRouterParams.max_tokens > modelCapabilities.maxTokens) {
          openRouterParams.max_tokens = modelCapabilities.maxTokens;
        }

        // STEP 4: Check user credits and get user's OpenRouter key
        const openRouterManager = new OpenRouterManager(openRouterProvisioningKey);
        
        // Check user credits before making the call (estimate 1 credit for API call)
const creditCheckResponse = await openRouterManager.checkUserCredits(
  exportData.user_id, 
  0.001, 
  supabase, 
  fastify.log,
  modelToUse // ✅ Pass the model being used
);


if (!creditCheckResponse.success) {
  if (creditCheckResponse.error?.code === OpenRouterError.KEY_NOT_FOUND) {
    fastify.log.error({ msg: 'User OpenRouter key not found', userId: exportData.user_id });
    return reply.code(404).send({
      error: {
        message: 'OpenRouter key not found. Please contact support.',
        type: 'authentication_error',
        code: ExportedApiError.USER_KEY_NOT_FOUND
      }
    });
  } else if (creditCheckResponse.error?.code === OpenRouterError.INSUFFICIENT_CREDITS) {
    fastify.log.warn({ msg: 'User has insufficient credits', userId: exportData.user_id, model: modelToUse });
    return reply.code(402).send({
      error: {
        message: `${creditCheckResponse.error.message}`,
        type: 'insufficient_quota',
        code: ExportedApiError.CREDIT_INSUFFICIENT,
        details: {
          available: creditCheckResponse.error.details?.available || 0,
          freeModelsAvailable: creditCheckResponse.error.details?.freeModelsAvailable || [],
          suggestion: creditCheckResponse.error.details?.suggestion || 'Consider using a free model',
          freeModelPattern: 'Models ending with ":free" don\'t require credits'
        }
      }
    });
  } else {
    fastify.log.error({ msg: 'Failed to check user credits', userId: exportData.user_id, error: creditCheckResponse.error });
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

// Only check credits for paid models
if (!isFreeModel && (!sufficient || available <= 0)) {
  fastify.log.warn({ msg: 'User has insufficient credits for paid model', userId: exportData.user_id, available, sufficient, model: modelToUse });
  return reply.code(402).send({
    error: {
      message: 'Your credit balance is insufficient for this paid model. Please top up or use a free model.',
      type: 'insufficient_quota',
      code: ExportedApiError.CREDIT_INSUFFICIENT,
      details: {
        available,
        modelType: 'paid',
        suggestion: 'Try a model ending with ":free" which doesn\'t require credits'
      }
    }
  });
}

fastify.log.info({ 
  msg: 'Model access granted for exported API', 
  userId: exportData.user_id, 
  model: modelToUse, 
  modelType: isFreeModel ? 'free' : 'paid',
  creditsAvailable: available 
});
        // Get user's API key
        const apiKeyResponse = await openRouterManager.getUserApiKey(exportData.user_id, supabase, fastify.log);

        if (!apiKeyResponse.success) {
          fastify.log.error({ msg: 'Failed to get OpenRouter key for user', userId: exportData.user_id, error: apiKeyResponse.error });
          return reply.code(500).send({
            error: {
              message: 'Failed to retrieve your OpenRouter key. Please contact support.',
              type: 'api_error',
              code: ExportedApiError.USER_KEY_NOT_FOUND
            }
          });
        }

        const userApiKey = apiKeyResponse.data;

        // STEP 5: Call OpenRouter with enhanced parameters using user's key
        fastify.log.info({
          msg: '🔵 CONTEXT API - Step 5: Sending to OpenRouter with user key',
          model: modelToUse,
          messagesCount: contextAwareMessages.length,
          parameters: openRouterParams,
          keyType: 'user-openrouter-key'
        });

        const openRouterResponse = await callOpenRouter(
          modelToUse,
          contextAwareMessages,
          userApiKey!,
          params.stream || false,
          openRouterParams
        );

        // Handle streaming response
        if (params.stream) {
          reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          });
          
          const reader = openRouterResponse.body?.getReader();
          if (!reader) throw new Error("Failed to get stream reader");
          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              
              while (true) {
                const lineEnd = buffer.indexOf('\n');
                if (lineEnd === -1) break;
                
                const line = buffer.slice(0, lineEnd).trim();
                buffer = buffer.slice(lineEnd + 1);
                
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') {
                    reply.raw.write(line + '\n\n');
                    break;
                  }
                  
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.usage) {
                      promptTokens = parsed.usage.prompt_tokens || promptTokens;
                      completionTokens = parsed.usage.completion_tokens || completionTokens;
                    }
                  } catch (e) {
                    // Ignore parsing errors for individual chunks
                  }
                  
                  reply.raw.write(line + '\n\n');
                }
              }
            }
          } finally {
            reader.releaseLock();
            reply.raw.end();
          }
        } else {
          // Handle non-streaming response
          const responseData: any = await openRouterResponse.json();
          if (responseData.usage) {
            promptTokens = responseData.usage.prompt_tokens || 0;
            completionTokens = responseData.usage.completion_tokens || 0;
          }
          reply.code(200).send(responseData);
        }

        // Log API usage
        const responseTimeMs = Date.now() - startTime;
        await logApiUsage(
          apiKey, 
          exportData.user_id, 
          request.url, 
          modelToUse, 
          supabase, 
          fastify.log, 
          promptTokens, 
          completionTokens, 
          responseTimeMs
        );

        fastify.log.info({
          msg: '🔵 CONTEXT API - Request Complete',
          responseTimeMs,
          promptTokens,
          completionTokens
        });

      } catch (error: any) {
        fastify.log.error({ 
          msg: '🔵 CONTEXT API - Error', 
          err: error.message, 
          apiKeyId: exportData?.id 
        });
        
        if (!reply.sent) {
          // Return OpenAI-compatible error format
          reply.code(500).send({
            error: {
              message: error.message || 'Internal server error',
              type: 'api_error',
              code: 'internal_error'
            }
          });
        } else if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      }
    }
  );

  // Enhanced session API endpoint - ALWAYS includes session history + context filtering
  fastify.post(
    '/api/exported/session/v1/chat/completions',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      const body = request.body as EnhancedChatCompletionsBody;
      const exportData = request.exportedApiData!;
      const apiKey = request.headers.authorization!.split(' ')[1];
      const startTime = Date.now();
      let promptTokens = 0;
      let completionTokens = 0;

      try {
        fastify.log.info({
          msg: '🟡 SESSION API - Request Started',
          apiKeyId: exportData.id,
          userId: exportData.user_id,
          sessionId: exportData.session_id,
          model: body.model || exportData.base_model,
          includeMemories: exportData.include_memories,
          includeNotes: exportData.include_notes,
          thirdPartySystemPrompt: body.system_prompt ? 'PROVIDED' : 'NOT_PROVIDED'
        });

        // Validate session configuration
        if (!exportData.session_id) {
          return reply.code(400).send({
            error: {
              message: 'API key is not configured for a specific session.',
              type: 'invalid_request_error',
              code: 'session_not_configured'
            }
          });
        }

        // Validate required fields
        if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
          return reply.code(400).send({
            error: {
              message: 'messages is required and must be a non-empty array',
              type: 'invalid_request_error',
              code: 'invalid_messages'
            }
          });
        }

        // Extract and validate parameters
        const params = extractOpenAIParameters(body);
        const modelToUse = params.model || exportData.base_model;

        // Check model permissions
        if (!exportData.allowed_models || !exportData.allowed_models.includes(modelToUse)) {
          return reply.code(403).send({
            error: {
              message: `Model '${modelToUse}' not allowed for this API key. Allowed models: ${exportData.allowed_models?.join(', ')}`,
              type: 'invalid_request_error',
              code: 'model_not_allowed'
            }
          });
        }

        // Get model capabilities
        const modelCapabilities = getModelCapabilities(modelToUse);

        // STEP 1: ALWAYS get session history for session API - this is the key feature
        fastify.log.info({
          msg: '🟡 SESSION API - Step 1: Getting Session History',
          sessionId: exportData.session_id,
          userId: exportData.user_id
        });

        const { data: sessionHistoryData, error: historyError } = await supabase
          .from('chat_history')
          .select('content, role, created_at')
          .eq('session_id', exportData.session_id)
          .eq('user_id', exportData.user_id)
          .order('created_at', { ascending: true });
        
        if (historyError) {
          fastify.log.error({
            msg: '🟡 SESSION API - Step 1 Error: Failed to get session history',
            error: historyError,
            sessionId: exportData.session_id
          });
          throw historyError;
        }

        const sessionHistory = (sessionHistoryData || []).map((msg: any) => ({ 
          role: msg.role, 
          content: msg.content,
          created_at: msg.created_at
        }));

        fastify.log.info({
          msg: '🟡 SESSION API - Step 1 Complete: Session History Retrieved',
          sessionHistoryCount: sessionHistory.length,
          sessionHistory: sessionHistory.map((msg, idx) => ({
            index: idx + 1,
            role: msg.role,
            content: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
            created_at: msg.created_at
          }))
        });

        // STEP 2: Get user context
        fastify.log.info({
          msg: '🟡 SESSION API - Step 2: Getting User Context',
          userId: exportData.user_id
        });
        const userContext = await getUserContext(exportData.user_id, supabase, fastify.log);
        fastify.log.info({
          msg: '🟡 SESSION API - Step 2 Complete: User Context Retrieved',
          memoriesCount: userContext.memories.length,
          notesCount: userContext.notes.length,
          userSystemPrompt: userContext.systemPrompt
        });

        // STEP 3: Filter relevant context if enabled and there's content to filter
        let contentForFiltering = '';
        const lastMessage = body.messages[body.messages.length - 1];
        if (lastMessage?.content) {
          contentForFiltering = processMessageContent(lastMessage.content);
        }

        // ALWAYS apply filtering if memories/notes exist and are enabled
        if (contentForFiltering.trim() && (exportData.include_memories || exportData.include_notes) && 
            (userContext.memories.length > 0 || userContext.notes.length > 0)) {
            
            fastify.log.info({
              msg: '🟡 SESSION API - Step 3: Starting Gemini Context Filtering',
              contentForFiltering: contentForFiltering,
              memoriesToFilter: exportData.include_memories ? userContext.memories.length : 0,
              notesToFilter: exportData.include_notes ? userContext.notes.length : 0
            });

            const memoriesToFilter = exportData.include_memories ? userContext.memories : [];
            const notesToFilter = exportData.include_notes ? userContext.notes : [];

            const { relevantMemories, relevantNotes } = await filterRelevantContext(
              contentForFiltering, memoriesToFilter, notesToFilter, genAI, fastify.log
            );
            userContext.relevantMemories = relevantMemories;
            userContext.relevantNotes = relevantNotes;

            fastify.log.info({
              msg: '🟡 SESSION API - Step 3 Complete: Gemini Context Filtering Done',
              relevantMemoriesCount: relevantMemories.length,
              relevantNotesCount: relevantNotes.length,
              relevantMemories: relevantMemories,
              relevantNotes: relevantNotes
            });
        } else {
            userContext.relevantMemories = [];
            userContext.relevantNotes = [];
            fastify.log.info({
              msg: '🟡 SESSION API - Step 3: Skipping Gemini Context Filtering',
              reason: !contentForFiltering.trim() ? 'No content to filter' : 
                      !(exportData.include_memories || exportData.include_notes) ? 'Memories/notes disabled' :
                      !(userContext.memories.length > 0 || userContext.notes.length > 0) ? 'No memories/notes available' : 'Unknown'
            });
        }

        // STEP 4: Build session-aware messages with enhanced system prompt that includes session history and user context
        fastify.log.info({
          msg: '🟡 SESSION API - Step 4: Building Enhanced System Prompt with Session History',
          baseSystemPrompt: body.system_prompt || userContext.systemPrompt,
          sessionHistoryCount: sessionHistory.length,
          willIncludeMemories: exportData.include_memories && userContext.relevantMemories && userContext.relevantMemories.length > 0,
          willIncludeNotes: exportData.include_notes && userContext.relevantNotes && userContext.relevantNotes.length > 0
        });

        const sessionAwareMessages = buildExportedSessionAwareMessages(
          userContext, 
          sessionHistory, // ALWAYS include full session history
          body.messages, // Third-party app's new messages
          exportData,
          body.system_prompt // Allow third-party system prompt override
        );

        fastify.log.info({
          msg: '🟡 SESSION API - Step 4 Complete: Enhanced System Prompt with Session History Built',
          finalSystemPrompt: sessionAwareMessages[0].content,
          totalMessagesCount: sessionAwareMessages.length,
          messageTypes: sessionAwareMessages.map(m => m.role),
          sessionHistoryIncluded: sessionHistory.length
        });

        // Prepare parameters for OpenRouter
        const openRouterParams = { ...params };
        delete openRouterParams.model;
        delete (openRouterParams as any).system_prompt;

        // Validate max_tokens against model capabilities
        if (openRouterParams.max_tokens && openRouterParams.max_tokens > modelCapabilities.maxTokens) {
          openRouterParams.max_tokens = modelCapabilities.maxTokens;
        }

        // STEP 5: Check user credits and get user's OpenRouter key
        const openRouterManager = new OpenRouterManager(openRouterProvisioningKey);
        
        // Check user credits before making the call (estimate 1 credit for API call)
const creditCheckResponse = await openRouterManager.checkUserCredits(
  exportData.user_id, 
  0.001, 
  supabase, 
  fastify.log,
  modelToUse // ✅ Pass the model being used
);


if (!creditCheckResponse.success) {
  if (creditCheckResponse.error?.code === OpenRouterError.KEY_NOT_FOUND) {
    fastify.log.error({ msg: 'User OpenRouter key not found', userId: exportData.user_id });
    return reply.code(404).send({
      error: {
        message: 'OpenRouter key not found. Please contact support.',
        type: 'authentication_error',
        code: ExportedApiError.USER_KEY_NOT_FOUND
      }
    });
  } else if (creditCheckResponse.error?.code === OpenRouterError.INSUFFICIENT_CREDITS) {
    fastify.log.warn({ msg: 'User has insufficient credits', userId: exportData.user_id, model: modelToUse });
    return reply.code(402).send({
      error: {
        message: `${creditCheckResponse.error.message}`,
        type: 'insufficient_quota',
        code: ExportedApiError.CREDIT_INSUFFICIENT,
        details: {
          available: creditCheckResponse.error.details?.available || 0,
          freeModelsAvailable: creditCheckResponse.error.details?.freeModelsAvailable || [],
          suggestion: creditCheckResponse.error.details?.suggestion || 'Consider using a free model',
          freeModelPattern: 'Models ending with ":free" don\'t require credits'
        }
      }
    });
  } else {
    fastify.log.error({ msg: 'Failed to check user credits', userId: exportData.user_id, error: creditCheckResponse.error });
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

// Only check credits for paid models
if (!isFreeModel && (!sufficient || available <= 0)) {
  fastify.log.warn({ msg: 'User has insufficient credits for paid model', userId: exportData.user_id, available, sufficient, model: modelToUse });
  return reply.code(402).send({
    error: {
      message: 'Your credit balance is insufficient for this paid model. Please top up or use a free model.',
      type: 'insufficient_quota',
      code: ExportedApiError.CREDIT_INSUFFICIENT,
      details: {
        available,
        modelType: 'paid',
        suggestion: 'Try a model ending with ":free" which doesn\'t require credits'
      }
    }
  });
}

fastify.log.info({ 
  msg: 'Model access granted for exported API', 
  userId: exportData.user_id, 
  model: modelToUse, 
  modelType: isFreeModel ? 'free' : 'paid',
  creditsAvailable: available 
});
        // Get user's API key
        const apiKeyResponse = await openRouterManager.getUserApiKey(exportData.user_id, supabase, fastify.log);

        if (!apiKeyResponse.success) {
          fastify.log.error({ msg: 'Failed to get OpenRouter key for user', userId: exportData.user_id, error: apiKeyResponse.error });
          return reply.code(500).send({
            error: {
              message: 'Failed to retrieve your OpenRouter key. Please contact support.',
              type: 'api_error',
              code: ExportedApiError.USER_KEY_NOT_FOUND
            }
          });
        }

        const userApiKey = apiKeyResponse.data;

        // STEP 6: Call OpenRouter with user's key
        fastify.log.info({
          msg: '🟡 SESSION API - Step 6: Sending to OpenRouter with user key',
          model: modelToUse,
          messagesCount: sessionAwareMessages.length,
          parameters: openRouterParams,
          keyType: 'user-openrouter-key'
        });

        const openRouterResponse = await callOpenRouter(
          modelToUse,
          sessionAwareMessages,
          userApiKey!,
          params.stream || false,
          openRouterParams
        );

        // Handle streaming response
        if (params.stream) {
          reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          });
          
          const reader = openRouterResponse.body?.getReader();
          if (!reader) throw new Error("Failed to get stream reader");
          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              
              while (true) {
                const lineEnd = buffer.indexOf('\n');
                if (lineEnd === -1) break;
                
                const line = buffer.slice(0, lineEnd).trim();
                buffer = buffer.slice(lineEnd + 1);
                
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') {
                    reply.raw.write(line + '\n\n');
                    break;
                  }
                  
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.usage) {
                      promptTokens = parsed.usage.prompt_tokens || promptTokens;
                      completionTokens = parsed.usage.completion_tokens || completionTokens;
                    }
                  } catch (e) {
                    // Ignore parsing errors for individual chunks
                  }
                  
                  reply.raw.write(line + '\n\n');
                }
              }
            }
          } finally {
            reader.releaseLock();
            reply.raw.end();
          }
        } else {
          // Handle non-streaming response
          const responseData: any = await openRouterResponse.json();
          if (responseData.usage) {
            promptTokens = responseData.usage.prompt_tokens || 0;
            completionTokens = responseData.usage.completion_tokens || 0;
          }
          reply.code(200).send(responseData);
        }

        // Log API usage
        const responseTimeMs = Date.now() - startTime;
        await logApiUsage(
          apiKey, 
          exportData.user_id, 
          request.url, 
          modelToUse, 
          supabase, 
          fastify.log, 
          promptTokens, 
          completionTokens, 
          responseTimeMs
        );

        fastify.log.info({
          msg: '🟡 SESSION API - Request Complete',
          responseTimeMs,
          promptTokens,
          completionTokens,
          sessionId: exportData.session_id
        });

      } catch (error: any) {
        fastify.log.error({ 
          msg: '🟡 SESSION API - Error', 
          err: error.message, 
          apiKeyId: exportData?.id,
          sessionId: exportData?.session_id
        });
        
        if (!reply.sent) {
          reply.code(500).send({
            error: {
              message: error.message || 'Internal server error',
              type: 'api_error',
              code: 'internal_error'
            }
          });
        } else if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      }
    }
  );

  // Enhanced models endpoint with detailed model information
  fastify.get('/api/exported/v1/models', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const exportData = request.exportedApiData!;
    
    try {
        // Get user's OpenRouter key for models listing
        const openRouterManager = new OpenRouterManager(openRouterProvisioningKey);
        const apiKeyResponse = await openRouterManager.getUserApiKey(exportData.user_id, supabase, fastify.log);

        if (!apiKeyResponse.success) {
          fastify.log.error({ msg: 'Failed to get OpenRouter key for user', userId: exportData.user_id, error: apiKeyResponse.error });
          return reply.code(500).send({
            error: {
              message: 'Failed to retrieve your OpenRouter key. Please contact support.',
              type: 'api_error',
              code: 'user_key_not_found'
            }
          });
        }

        const userApiKey = apiKeyResponse.data;

        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { 'Authorization': `Bearer ${userApiKey}` },
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch models from OpenRouter: ${errorText}`);
        }
        
        const allModelsData: any = await response.json();
        let modelsToList = allModelsData.data;

        // Filter by allowed models if specified
        if (exportData.allowed_models && exportData.allowed_models.length > 0) {
            modelsToList = allModelsData.data.filter((m: any) => 
              exportData.allowed_models.includes(m.id)
            );
        }

        // Enhance model data with capabilities
        const enhancedModels = modelsToList.map((model: any) => {
          const capabilities = getModelCapabilities(model.id);
          return {
            ...model,
            capabilities: {
              supports_reasoning: capabilities.supportsReasoning,
              supports_tools: capabilities.supportsTools,
              supports_images: capabilities.supportsImages,
              is_reasoning_model: capabilities.isReasoningModel,
              max_tokens: capabilities.maxTokens,
              context_window: capabilities.contextWindow,
            }
          };
        });
        
        // Log this access
        const apiKey = request.headers.authorization!.split(' ')[1];
        await logApiUsage(
          apiKey, 
          exportData.user_id, 
          request.url, 
          'N/A (models_list)', 
          supabase, 
          fastify.log, 
          0, 
          0, 
          0
        );

        reply.send({ 
          object: 'list',
          data: enhancedModels 
        });
        
    } catch (error: any) {
        fastify.log.error({ 
          msg: 'Error fetching models for exported API', 
          err: error.message, 
          apiKeyId: exportData?.id 
        });
        reply.code(500).send({ 
          error: {
            message: 'Could not fetch models.',
            type: 'api_error',
            code: 'models_fetch_error'
          }
        });
    }
  });
}