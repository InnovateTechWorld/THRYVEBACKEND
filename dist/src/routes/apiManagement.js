"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = apiManagementRoutes;
const encryption_1 = require("../utils/encryption");
const apiUtils_1 = require("../lib/apiUtils");
const context_1 = require("../lib/context");
const ai_1 = require("../lib/ai");
const openRouterManager_1 = require("../lib/openRouterManager");
// Error codes for OpenRouter integration
var LegacyApiError;
(function (LegacyApiError) {
    LegacyApiError["MODEL_NOT_ALLOWED_FOR_PLAN"] = "MODEL_NOT_ALLOWED_FOR_PLAN";
    LegacyApiError["CREDIT_INSUFFICIENT"] = "CREDIT_INSUFFICIENT";
    LegacyApiError["USER_KEY_DISABLED"] = "USER_KEY_DISABLED";
    LegacyApiError["USER_KEY_NOT_FOUND"] = "USER_KEY_NOT_FOUND";
})(LegacyApiError || (LegacyApiError = {}));
// Update the options interface to include openRouterProvisioningKey
async function apiManagementRoutes(fastify, options) {
    const { supabase, genAI, appBaseUrl, openRouterProvisioningKey } = options;
    // Create Context Export API
    fastify.post('/export/context', async (request, reply) => {
        const userId = request.user.id;
        const { modelsToExpose, include_memories = false, include_notes = false, name, description } = request.body;
        try {
            const apiKey = encryption_1.EncryptionUtils.generateApiKey();
            const hashedKey = encryption_1.EncryptionUtils.hashApiKey(apiKey);
            const { data: exportedApi, error } = await supabase
                .from('exported_apis')
                .insert({
                user_id: userId,
                name: name || `Context API - ${new Date().toISOString().split('T')[0]}`,
                description: description || 'Auto-generated context API',
                api_key_hash: hashedKey,
                export_type: 'context',
                base_model: modelsToExpose?.[0] || 'openai/gpt-4',
                allowed_models: modelsToExpose || ['openai/gpt-4'],
                rate_limit: 100,
                is_active: true,
                include_memories: include_memories,
                include_notes: include_notes
            })
                .select()
                .single();
            if (error)
                throw error;
            reply.code(201).send({
                apiKey: apiKey,
                message: "Context API created. Use this API key with the /api/exported/context/:apiKey/chat/completions endpoint.",
                type: 'context',
                id: exportedApi.id,
                name: exportedApi.name
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error creating context export API', err: error, userId });
            reply.code(500).send({ error: error.message });
        }
    });
    // Create Session Export API
    fastify.post('/export/session/current', async (request, reply) => {
        const userId = request.user.id;
        const { sessionId, modelsToExpose, include_memories = false, include_notes = false, name, description } = request.body;
        if (!sessionId) {
            return reply.status(400).send({ error: 'sessionId is required in request body' });
        }
        try {
            const { data: sessionData, error: sessionError } = await supabase
                .from('chat_sessions')
                .select('id')
                .eq('id', sessionId)
                .eq('user_id', userId)
                .maybeSingle();
            if (sessionError)
                throw sessionError;
            if (!sessionData) {
                return reply.status(404).send({ error: 'Session not found or not owned by user' });
            }
            const apiKey = encryption_1.EncryptionUtils.generateApiKey();
            const hashedKey = encryption_1.EncryptionUtils.hashApiKey(apiKey);
            const { data: exportedApi, error } = await supabase
                .from('exported_apis')
                .insert({
                user_id: userId,
                name: name || `Session API - ${sessionId.substring(0, 8)}`,
                description: description || `API for session ${sessionId}`,
                api_key_hash: hashedKey,
                export_type: 'session',
                session_id: sessionId,
                base_model: modelsToExpose?.[0] || 'openai/gpt-4',
                allowed_models: modelsToExpose || ['openai/gpt-4'],
                rate_limit: 100,
                is_active: true,
                include_memories: include_memories,
                include_notes: include_notes
            })
                .select()
                .single();
            if (error)
                throw error;
            reply.code(201).send({
                apiKey: apiKey,
                message: "Session API created. Use this API key with the /api/exported/session/:apiKey/chat/completions endpoint.",
                type: 'session',
                sessionId: sessionId,
                id: exportedApi.id,
                name: exportedApi.name,
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error creating session export API', err: error, userId, sessionId });
            reply.code(500).send({ error: error.message });
        }
    });
    fastify.get('/export/usage/:apiKey', async (request, reply) => {
        const { apiKey } = request.params;
        try {
            const hashedKey = encryption_1.EncryptionUtils.hashApiKey(apiKey);
            const { data: apiKeyData, error: apiKeyError } = await supabase
                .from('exported_apis')
                .select('user_id')
                .eq('api_key_hash', hashedKey)
                .single();
            if (apiKeyError || !apiKeyData) {
                return reply.status(404).send({ error: "API Key not found." });
            }
            const { data, error } = await supabase
                .from('api_usage')
                .select('*')
                .eq('api_key_hash', hashedKey);
            if (error)
                throw error;
            reply.code(200).send(data);
        }
        catch (error) {
            fastify.log.error({ msg: 'Error fetching API usage for key', err: error });
            reply.code(500).send({ error: error.message });
        }
    });
    // Enhanced legacy context API endpoint
    fastify.post('/api/exported/context/:apiKey/chat/completions', async (request, reply) => {
        const { apiKey } = request.params;
        const body = request.body;
        const startTime = Date.now();
        let promptTokens = 0;
        let completionTokens = 0;
        try {
            const exportData = await (0, apiUtils_1.verifyExportedApiKey)(apiKey, 'context', supabase, fastify.log);
            fastify.log.info({
                msg: '🔵 LEGACY CONTEXT API - Request Started',
                apiKeyId: exportData.id,
                userId: exportData.user_id,
                model: body.model || exportData.base_model,
                includeMemories: exportData.include_memories,
                includeNotes: exportData.include_notes,
                thirdPartySystemPrompt: body.system_prompt ? 'PROVIDED' : 'NOT_PROVIDED'
            });
            // Extract and validate parameters
            const params = (0, context_1.extractOpenAIParameters)(body);
            const modelToUse = params.model || exportData.base_model;
            if (!exportData.allowed_models || !exportData.allowed_models.includes(modelToUse)) {
                return reply.code(403).send({
                    error: {
                        message: `Model '${modelToUse}' not allowed for this API key`,
                        type: 'invalid_request_error',
                        code: 'model_not_allowed'
                    }
                });
            }
            // Get model capabilities
            const modelCapabilities = (0, ai_1.getModelCapabilities)(modelToUse);
            // STEP 1: Get user context
            fastify.log.info({
                msg: '🔵 LEGACY CONTEXT API - Step 1: Getting User Context',
                userId: exportData.user_id
            });
            const userContext = await (0, context_1.getUserContext)(exportData.user_id, supabase, fastify.log);
            fastify.log.info({
                msg: '🔵 LEGACY CONTEXT API - Step 1 Complete: User Context Retrieved',
                memoriesCount: userContext.memories.length,
                notesCount: userContext.notes.length,
                userSystemPrompt: userContext.systemPrompt
            });
            // STEP 2: Filter relevant context if there's content to filter
            let contentForFiltering = '';
            const lastMessage = body.messages[body.messages.length - 1];
            if (lastMessage?.content) {
                contentForFiltering = (0, context_1.processMessageContent)(lastMessage.content);
            }
            if (contentForFiltering.trim() && (exportData.include_memories || exportData.include_notes) &&
                (userContext.memories.length > 0 || userContext.notes.length > 0)) {
                fastify.log.info({
                    msg: '🔵 LEGACY CONTEXT API - Step 2: Starting Gemini Context Filtering',
                    contentForFiltering: contentForFiltering,
                    memoriesToFilter: exportData.include_memories ? userContext.memories.length : 0,
                    notesToFilter: exportData.include_notes ? userContext.notes.length : 0
                });
                const memoriesToFilter = exportData.include_memories ? userContext.memories : [];
                const notesToFilter = exportData.include_notes ? userContext.notes : [];
                const { relevantMemories, relevantNotes } = await (0, ai_1.filterRelevantContext)(contentForFiltering, memoriesToFilter, notesToFilter, genAI, fastify.log);
                userContext.relevantMemories = relevantMemories;
                userContext.relevantNotes = relevantNotes;
                fastify.log.info({
                    msg: '🔵 LEGACY CONTEXT API - Step 2 Complete: Gemini Context Filtering Done',
                    relevantMemoriesCount: relevantMemories.length,
                    relevantNotesCount: relevantNotes.length,
                    relevantMemories: relevantMemories,
                    relevantNotes: relevantNotes
                });
            }
            else {
                userContext.relevantMemories = [];
                userContext.relevantNotes = [];
                fastify.log.info({
                    msg: '🔵 LEGACY CONTEXT API - Step 2: Skipping Gemini Context Filtering',
                    reason: !contentForFiltering.trim() ? 'No content to filter' :
                        !(exportData.include_memories || exportData.include_notes) ? 'Memories/notes disabled' :
                            !(userContext.memories.length > 0 || userContext.notes.length > 0) ? 'No memories/notes available' : 'Unknown'
                });
            }
            // STEP 3: Build context-aware messages with enhanced system prompt
            fastify.log.info({
                msg: '🔵 LEGACY CONTEXT API - Step 3: Building Enhanced System Prompt',
                baseSystemPrompt: body.system_prompt || userContext.systemPrompt,
                willIncludeMemories: exportData.include_memories && userContext.relevantMemories && userContext.relevantMemories.length > 0,
                willIncludeNotes: exportData.include_notes && userContext.relevantNotes && userContext.relevantNotes.length > 0
            });
            const contextAwareMessages = (0, context_1.buildExportedContextAwareMessages)(userContext, [], // No session history for context API
            body.messages, exportData, body.system_prompt // Allow system prompt override
            );
            fastify.log.info({
                msg: '🔵 LEGACY CONTEXT API - Step 3 Complete: Enhanced System Prompt Built',
                finalSystemPrompt: contextAwareMessages[0].content,
                totalMessagesCount: contextAwareMessages.length,
                messageTypes: contextAwareMessages.map(m => m.role)
            });
            // Prepare OpenRouter parameters
            const openRouterParams = { ...params };
            delete openRouterParams.model;
            delete openRouterParams.system_prompt;
            // Validate max_tokens
            if (openRouterParams.max_tokens && openRouterParams.max_tokens > modelCapabilities.maxTokens) {
                openRouterParams.max_tokens = modelCapabilities.maxTokens;
            }
            // STEP 4: Check user credits and get user's OpenRouter key
            const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
            // Check user credits before making the call (estimate 1 credit for API call)
            const creditCheckResponse = await openRouterManager.checkUserCredits(exportData.user_id, 0.001, supabase, fastify.log, modelToUse // ✅ Pass the model being used
            );
            if (!creditCheckResponse.success) {
                if (creditCheckResponse.error?.code === openRouterManager_1.OpenRouterError.KEY_NOT_FOUND) {
                    fastify.log.error({ msg: 'User OpenRouter key not found', userId: exportData.user_id });
                    return reply.code(404).send({
                        error: {
                            message: 'OpenRouter key not found. Please contact support.',
                            type: 'authentication_error',
                            code: LegacyApiError.USER_KEY_NOT_FOUND
                        }
                    });
                }
                else if (creditCheckResponse.error?.code === openRouterManager_1.OpenRouterError.INSUFFICIENT_CREDITS) {
                    fastify.log.warn({ msg: 'User has insufficient credits', userId: exportData.user_id, model: modelToUse });
                    return reply.code(402).send({
                        error: {
                            message: `${creditCheckResponse.error.message}`,
                            type: 'insufficient_quota',
                            code: LegacyApiError.CREDIT_INSUFFICIENT,
                            details: {
                                available: creditCheckResponse.error.details?.available || 0,
                                freeModelsAvailable: creditCheckResponse.error.details?.freeModelsAvailable || [],
                                suggestion: creditCheckResponse.error.details?.suggestion || 'Consider using a free model',
                                freeModelPattern: 'Models ending with ":free" don\'t require credits'
                            }
                        }
                    });
                }
                else {
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
            const { sufficient, available, isFreeModel } = creditCheckResponse.data;
            // Only check credits for paid models
            if (!isFreeModel && (!sufficient || available <= 0)) {
                fastify.log.warn({ msg: 'User has insufficient credits for paid model', userId: exportData.user_id, available, sufficient, model: modelToUse });
                return reply.code(402).send({
                    error: {
                        message: 'Your credit balance is insufficient for this paid model. Please top up or use a free model.',
                        type: 'insufficient_quota',
                        code: LegacyApiError.CREDIT_INSUFFICIENT,
                        details: {
                            available,
                            modelType: 'paid',
                            suggestion: 'Try a model ending with ":free" which doesn\'t require credits'
                        }
                    }
                });
            }
            fastify.log.info({
                msg: 'Model access granted for API call',
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
                        code: LegacyApiError.USER_KEY_NOT_FOUND
                    }
                });
            }
            const userApiKey = apiKeyResponse.data;
            // STEP 5: Call OpenRouter with user's key
            fastify.log.info({
                msg: '🔵 LEGACY CONTEXT API - Step 5: Sending to OpenRouter with user key',
                model: modelToUse,
                messagesCount: contextAwareMessages.length,
                parameters: openRouterParams,
                keyType: 'user-openrouter-key'
            });
            const openRouterResponse = await (0, ai_1.callOpenRouter)(modelToUse, contextAwareMessages, userApiKey, params.stream || false, openRouterParams);
            if (params.stream) {
                reply.raw.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                });
                const reader = openRouterResponse.body?.getReader();
                if (!reader)
                    throw new Error("Failed to get stream reader");
                const decoder = new TextDecoder();
                let buffer = '';
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done)
                            break;
                        buffer += decoder.decode(value, { stream: true });
                        while (true) {
                            const lineEnd = buffer.indexOf('\n');
                            if (lineEnd === -1)
                                break;
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
                                }
                                catch (e) {
                                    // Ignore parsing errors for individual chunks
                                }
                                reply.raw.write(line + '\n\n');
                            }
                        }
                    }
                }
                finally {
                    reader.releaseLock();
                    reply.raw.end();
                }
            }
            else {
                const responseData = await openRouterResponse.json();
                if (responseData.usage) {
                    promptTokens = responseData.usage.prompt_tokens || 0;
                    completionTokens = responseData.usage.completion_tokens || 0;
                }
                reply.code(200).send(responseData);
            }
            const responseTimeMs = Date.now() - startTime;
            await (0, apiUtils_1.logApiUsage)(apiKey, exportData.user_id, '/api/exported/context/chat/completions', modelToUse, supabase, fastify.log, promptTokens, completionTokens, responseTimeMs);
            fastify.log.info({
                msg: '🔵 LEGACY CONTEXT API - Request Complete',
                responseTimeMs,
                promptTokens,
                completionTokens
            });
        }
        catch (error) {
            fastify.log.error({ msg: '🔵 LEGACY CONTEXT API - Error', err: error, apiKey });
            if (!reply.sent) {
                reply.code(500).send({
                    error: {
                        message: error.message || 'Internal server error',
                        type: 'api_error',
                        code: 'internal_error'
                    }
                });
            }
            else if (!reply.raw.writableEnded) {
                reply.raw.end();
            }
        }
    });
    // Enhanced legacy session API endpoint - ALWAYS includes session history + context filtering
    fastify.post('/api/exported/session/:apiKey/chat/completions', async (request, reply) => {
        const { apiKey } = request.params;
        const body = request.body;
        const startTime = Date.now();
        let promptTokens = 0;
        let completionTokens = 0;
        let exportData = null;
        try {
            exportData = await (0, apiUtils_1.verifyExportedApiKey)(apiKey, 'session', supabase, fastify.log);
            fastify.log.info({
                msg: '🟡 LEGACY SESSION API - Request Started',
                apiKeyId: exportData.id,
                userId: exportData.user_id,
                sessionId: exportData.session_id,
                model: body.model || exportData.base_model,
                includeMemories: exportData.include_memories,
                includeNotes: exportData.include_notes,
                thirdPartySystemPrompt: body.system_prompt ? 'PROVIDED' : 'NOT_PROVIDED'
            });
            if (!exportData.session_id) {
                return reply.code(400).send({
                    error: {
                        message: 'API key is not configured for a specific session.',
                        type: 'invalid_request_error',
                        code: 'session_not_configured'
                    }
                });
            }
            // Extract and validate parameters
            const params = (0, context_1.extractOpenAIParameters)(body);
            const modelToUse = params.model || exportData.base_model;
            if (!exportData.allowed_models || !exportData.allowed_models.includes(modelToUse)) {
                return reply.code(403).send({
                    error: {
                        message: `Model '${modelToUse}' not allowed for this API key`,
                        type: 'invalid_request_error',
                        code: 'model_not_allowed'
                    }
                });
            }
            // Get model capabilities
            const modelCapabilities = (0, ai_1.getModelCapabilities)(modelToUse);
            // STEP 1: ALWAYS get session history for session API - this is the core feature
            fastify.log.info({
                msg: '🟡 LEGACY SESSION API - Step 1: Getting Session History',
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
                    msg: '🟡 LEGACY SESSION API - Step 1 Error: Failed to get session history',
                    error: historyError,
                    sessionId: exportData.session_id
                });
                throw historyError;
            }
            const sessionHistory = (sessionHistoryData || []).map((msg) => ({
                role: msg.role,
                content: msg.content,
                created_at: msg.created_at
            }));
            fastify.log.info({
                msg: '🟡 LEGACY SESSION API - Step 1 Complete: Session History Retrieved',
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
                msg: '🟡 LEGACY SESSION API - Step 2: Getting User Context',
                userId: exportData.user_id
            });
            const userContext = await (0, context_1.getUserContext)(exportData.user_id, supabase, fastify.log);
            fastify.log.info({
                msg: '🟡 LEGACY SESSION API - Step 2 Complete: User Context Retrieved',
                memoriesCount: userContext.memories.length,
                notesCount: userContext.notes.length,
                userSystemPrompt: userContext.systemPrompt
            });
            // STEP 3: Filter relevant context if enabled and there's content to filter
            let contentForFiltering = '';
            const lastMessage = body.messages[body.messages.length - 1];
            if (lastMessage?.content) {
                contentForFiltering = (0, context_1.processMessageContent)(lastMessage.content);
            }
            // ALWAYS apply filtering if memories/notes exist and are enabled
            if (contentForFiltering.trim() && (exportData.include_memories || exportData.include_notes) &&
                (userContext.memories.length > 0 || userContext.notes.length > 0)) {
                fastify.log.info({
                    msg: '🟡 LEGACY SESSION API - Step 3: Starting Gemini Context Filtering',
                    contentForFiltering: contentForFiltering,
                    memoriesToFilter: exportData.include_memories ? userContext.memories.length : 0,
                    notesToFilter: exportData.include_notes ? userContext.notes.length : 0
                });
                const memoriesToFilter = exportData.include_memories ? userContext.memories : [];
                const notesToFilter = exportData.include_notes ? userContext.notes : [];
                const { relevantMemories, relevantNotes } = await (0, ai_1.filterRelevantContext)(contentForFiltering, memoriesToFilter, notesToFilter, genAI, fastify.log);
                userContext.relevantMemories = relevantMemories;
                userContext.relevantNotes = relevantNotes;
                fastify.log.info({
                    msg: '🟡 LEGACY SESSION API - Step 3 Complete: Gemini Context Filtering Done',
                    relevantMemoriesCount: relevantMemories.length,
                    relevantNotesCount: relevantNotes.length,
                    relevantMemories: relevantMemories,
                    relevantNotes: relevantNotes
                });
            }
            else {
                userContext.relevantMemories = [];
                userContext.relevantNotes = [];
                fastify.log.info({
                    msg: '🟡 LEGACY SESSION API - Step 3: Skipping Gemini Context Filtering',
                    reason: !contentForFiltering.trim() ? 'No content to filter' :
                        !(exportData.include_memories || exportData.include_notes) ? 'Memories/notes disabled' :
                            !(userContext.memories.length > 0 || userContext.notes.length > 0) ? 'No memories/notes available' : 'Unknown'
                });
            }
            // STEP 4: Build session-aware messages with enhanced system prompt that includes session history and user context
            fastify.log.info({
                msg: '🟡 LEGACY SESSION API - Step 4: Building Enhanced System Prompt with Session History',
                baseSystemPrompt: body.system_prompt || userContext.systemPrompt,
                sessionHistoryCount: sessionHistory.length,
                willIncludeMemories: exportData.include_memories && userContext.relevantMemories && userContext.relevantMemories.length > 0,
                willIncludeNotes: exportData.include_notes && userContext.relevantNotes && userContext.relevantNotes.length > 0
            });
            const sessionAwareMessages = (0, context_1.buildExportedSessionAwareMessages)(userContext, sessionHistory, // ALWAYS include full session history
            body.messages, // Third-party app's new messages
            exportData, body.system_prompt // Allow third-party system prompt override
            );
            fastify.log.info({
                msg: '🟡 LEGACY SESSION API - Step 4 Complete: Enhanced System Prompt with Session History Built',
                finalSystemPrompt: sessionAwareMessages[0].content,
                totalMessagesCount: sessionAwareMessages.length,
                messageTypes: sessionAwareMessages.map(m => m.role),
                sessionHistoryIncluded: sessionHistory.length
            });
            // Prepare parameters for OpenRouter
            const openRouterParams = { ...params };
            delete openRouterParams.model;
            delete openRouterParams.system_prompt;
            // Validate max_tokens against model capabilities
            if (openRouterParams.max_tokens && openRouterParams.max_tokens > modelCapabilities.maxTokens) {
                openRouterParams.max_tokens = modelCapabilities.maxTokens;
            }
            // STEP 5: Check user credits and get user's OpenRouter key
            const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
            // Check user credits before making the call (estimate 1 credit for API call)
            const creditCheckResponse = await openRouterManager.checkUserCredits(exportData.user_id, 0.001, supabase, fastify.log, modelToUse // ✅ Pass the model being used
            );
            if (!creditCheckResponse.success) {
                if (creditCheckResponse.error?.code === openRouterManager_1.OpenRouterError.KEY_NOT_FOUND) {
                    fastify.log.error({ msg: 'User OpenRouter key not found', userId: exportData.user_id });
                    return reply.code(404).send({
                        error: {
                            message: 'OpenRouter key not found. Please contact support.',
                            type: 'authentication_error',
                            code: LegacyApiError.USER_KEY_NOT_FOUND
                        }
                    });
                }
                else if (creditCheckResponse.error?.code === openRouterManager_1.OpenRouterError.INSUFFICIENT_CREDITS) {
                    fastify.log.warn({ msg: 'User has insufficient credits', userId: exportData.user_id, model: modelToUse });
                    return reply.code(402).send({
                        error: {
                            message: `${creditCheckResponse.error.message}`,
                            type: 'insufficient_quota',
                            code: LegacyApiError.CREDIT_INSUFFICIENT,
                            details: {
                                available: creditCheckResponse.error.details?.available || 0,
                                freeModelsAvailable: creditCheckResponse.error.details?.freeModelsAvailable || [],
                                suggestion: creditCheckResponse.error.details?.suggestion || 'Consider using a free model',
                                freeModelPattern: 'Models ending with ":free" don\'t require credits'
                            }
                        }
                    });
                }
                else {
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
            const { sufficient, available, isFreeModel } = creditCheckResponse.data;
            // Only check credits for paid models
            if (!isFreeModel && (!sufficient || available <= 0)) {
                fastify.log.warn({ msg: 'User has insufficient credits for paid model', userId: exportData.user_id, available, sufficient, model: modelToUse });
                return reply.code(402).send({
                    error: {
                        message: 'Your credit balance is insufficient for this paid model. Please top up or use a free model.',
                        type: 'insufficient_quota',
                        code: LegacyApiError.CREDIT_INSUFFICIENT,
                        details: {
                            available,
                            modelType: 'paid',
                            suggestion: 'Try a model ending with ":free" which doesn\'t require credits'
                        }
                    }
                });
            }
            fastify.log.info({
                msg: 'Model access granted for API call',
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
                        code: LegacyApiError.USER_KEY_NOT_FOUND
                    }
                });
            }
            const userApiKey = apiKeyResponse.data;
            // STEP 6: Call OpenRouter with user's key
            fastify.log.info({
                msg: '🟡 LEGACY SESSION API - Step 6: Sending to OpenRouter with user key',
                model: modelToUse,
                messagesCount: sessionAwareMessages.length,
                parameters: openRouterParams,
                keyType: 'user-openrouter-key'
            });
            const openRouterResponse = await (0, ai_1.callOpenRouter)(modelToUse, sessionAwareMessages, userApiKey, params.stream || false, openRouterParams);
            if (params.stream) {
                reply.raw.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                });
                const reader = openRouterResponse.body?.getReader();
                if (!reader)
                    throw new Error("Failed to get stream reader");
                const decoder = new TextDecoder();
                let buffer = '';
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done)
                            break;
                        buffer += decoder.decode(value, { stream: true });
                        while (true) {
                            const lineEnd = buffer.indexOf('\n');
                            if (lineEnd === -1)
                                break;
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
                                }
                                catch (e) {
                                    // Ignore parsing errors for individual chunks
                                }
                                reply.raw.write(line + '\n\n');
                            }
                        }
                    }
                }
                finally {
                    reader.releaseLock();
                    reply.raw.end();
                }
            }
            else {
                const responseData = await openRouterResponse.json();
                if (responseData.usage) {
                    promptTokens = responseData.usage.prompt_tokens || 0;
                    completionTokens = responseData.usage.completion_tokens || 0;
                }
                reply.code(200).send(responseData);
            }
            const responseTimeMs = Date.now() - startTime;
            await (0, apiUtils_1.logApiUsage)(apiKey, exportData.user_id, '/api/exported/session/chat/completions', modelToUse, supabase, fastify.log, promptTokens, completionTokens, responseTimeMs);
            fastify.log.info({
                msg: '🟡 LEGACY SESSION API - Request Complete',
                responseTimeMs,
                promptTokens,
                completionTokens,
                sessionId: exportData.session_id
            });
        }
        catch (error) {
            fastify.log.error({
                msg: '🟡 LEGACY SESSION API - Error',
                err: error,
                apiKey,
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
            }
            else if (!reply.raw.writableEnded) {
                reply.raw.end();
            }
        }
    });
    // Enhanced models endpoint with detailed model information
    // fastify.get('/api/exported/v1/models', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    //   const exportData = request.exportedApiData!;
    //   try {
    //       // Get user's OpenRouter key
    //       const openRouterManager = new OpenRouterManager(openRouterProvisioningKey);
    //       const apiKeyResponse = await openRouterManager.getUserApiKey(exportData.user_id, supabase, fastify.log);
    //       if (!apiKeyResponse.success) {
    //         fastify.log.error({ msg: 'Failed to get OpenRouter key for user', userId: exportData.user_id, error: apiKeyResponse.error });
    //         return reply.code(500).send({
    //           error: {
    //             message: 'Failed to retrieve your OpenRouter key. Please contact support.',
    //             type: 'api_error',
    //             code: 'user_key_not_found'
    //           }
    //         });
    //       }
    //       const userApiKey = apiKeyResponse.data;
    //       const response = await fetch('https://openrouter.ai/api/v1/models', {
    //           headers: { 'Authorization': `Bearer ${userApiKey}` },
    //       });
    //       if (!response.ok) {
    //           const errorText = await response.text();
    //           throw new Error(`Failed to fetch models from OpenRouter: ${errorText}`);
    //       }
    //       const allModelsData: any = await response.json();
    //       let modelsToList = allModelsData.data;
    //       // Filter by allowed models if specified
    //       if (exportData.allowed_models && exportData.allowed_models.length > 0) {
    //           modelsToList = allModelsData.data.filter((m: any) => 
    //             exportData.allowed_models.includes(m.id)
    //           );
    //       }
    //       // Enhance model data with capabilities
    //       const enhancedModels = modelsToList.map((model: any) => {
    //         const capabilities = getModelCapabilities(model.id);
    //         return {
    //           ...model,
    //           capabilities: {
    //             supports_reasoning: capabilities.supportsReasoning,
    //             supports_tools: capabilities.supportsTools,
    //             supports_images: capabilities.supportsImages,
    //             is_reasoning_model: capabilities.isReasoningModel,
    //             max_tokens: capabilities.maxTokens,
    //             context_window: capabilities.contextWindow,
    //           }
    //         };
    //       });
    //       // Log this access
    //       const apiKey = request.headers.authorization!.split(' ')[1];
    //       await logApiUsage(
    //         apiKey, 
    //         exportData.user_id, 
    //         request.url, 
    //         'N/A (models_list)', 
    //         supabase, 
    //         fastify.log, 
    //         0, 
    //         0, 
    //         0
    //       );
    //       reply.send({ 
    //         object: 'list',
    //         data: enhancedModels 
    //       });
    //   } catch (error: any) {
    //       fastify.log.error({ 
    //         msg: 'Error fetching models for exported API', 
    //         err: error.message, 
    //         apiKeyId: exportData?.id 
    //       });
    //       reply.code(500).send({ 
    //         error: {
    //           message: 'Could not fetch models.',
    //           type: 'api_error',
    //           code: 'models_fetch_error'
    //         }
    //       });
    //   }
    // });
}
