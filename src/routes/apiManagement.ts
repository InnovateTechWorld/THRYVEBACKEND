import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { EncryptionUtils } from '../utils/encryption';
import { verifyExportedApiKey, logApiUsage } from '../lib/apiUtils';
import { getUserContext, buildContextAwareMessages, UserContextData } from '../lib/context';
import { callOpenRouter, filterRelevantContext } from '../lib/ai';
import { GoogleGenerativeAI } from '@google/generative-ai';


interface ExportContextBody {
  modelsToExpose: string[];
  include_memories?: boolean;
  include_notes?: boolean;
  name?: string;
  description?: string;
}

interface ExportSessionBody extends ExportContextBody {
  sessionId?: string;
}

interface ExportSessionParams {
  sessionId: string;
}

interface ExportUsageParams {
  apiKey: string;
}

export default async function apiManagementRoutes(
  fastify: FastifyInstance,
  options: {
    supabase: SupabaseClient,
    genAI: GoogleGenerativeAI,
    openRouterApiKey: string,
    appBaseUrl: string
  }
) {
  const { supabase, genAI, openRouterApiKey, appBaseUrl } = options;

  // Create Context Export API
  fastify.post(
    '/export/context',
    async (request: FastifyRequest<{ Body: ExportContextBody }>, reply: FastifyReply) => {
      const userId = request.user.id;
      const { modelsToExpose, include_memories = false, include_notes = false, name, description } = request.body;

      try {
        const apiKey = EncryptionUtils.generateApiKey();
        const hashedKey = EncryptionUtils.hashApiKey(apiKey);

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

        if (error) throw error;

        reply.code(201).send({
          apiKey: apiKey,
          message: "Context API created. Use this API key with the /api/exported/context/:apiKey/chat/completions endpoint.",
          type: 'context',
          id: exportedApi.id,
          name: exportedApi.name
        });
      } catch (error: any) {
        fastify.log.error({ msg: 'Error creating context export API', err: error, userId });
        reply.code(500).send({ error: error.message });
      }
    }
  );

  // Create Session Export API
  fastify.post(
    '/export/session/current',
    async (request: FastifyRequest<{ Body: ExportSessionBody }>, reply: FastifyReply) => {
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

        if (sessionError) throw sessionError;
        if (!sessionData) {
          return reply.status(404).send({ error: 'Session not found or not owned by user' });
        }

        const apiKey = EncryptionUtils.generateApiKey();
        const hashedKey = EncryptionUtils.hashApiKey(apiKey);

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

        if (error) throw error;

        reply.code(201).send({
          apiKey: apiKey,
          message: "Session API created. Use this API key with the /api/exported/session/:apiKey/chat/completions endpoint.",
          type: 'session',
          sessionId: sessionId,
          id: exportedApi.id,
          name: exportedApi.name,
        });
      } catch (error: any) {
        fastify.log.error({ msg: 'Error creating session export API', err: error, userId, sessionId });
        reply.code(500).send({ error: error.message });
      }
    }
  );

  fastify.get(
    '/export/usage/:apiKey',
    async (request: FastifyRequest<{ Params: ExportUsageParams }>, reply: FastifyReply) => {
      const { apiKey } = request.params;
      try {
        const hashedKey = EncryptionUtils.hashApiKey(apiKey);
        const { data: apiKeyData, error: apiKeyError } = await supabase
            .from('exported_apis')
            .select('user_id')
            .eq('api_key_hash', hashedKey)
            .single();

        if (apiKeyError || !apiKeyData) {
            return reply.status(404).send({ error: "API Key not found."});
        }

        const { data, error } = await supabase
          .from('api_usage')
          .select('*')
          .eq('api_key_hash', hashedKey);

        if (error) throw error;
        reply.code(200).send(data);
      } catch (error: any) {
        fastify.log.error({ msg: 'Error fetching API usage for key', err: error });
        reply.code(500).send({ error: error.message });
      }
    }
  );

    interface ExportedChatCompletionsBody {
        model: string;
        messages: any[];
        stream?: boolean;
        temperature?: number;
        max_tokens?: number;
        top_p?: number;
        frequency_penalty?: number;
        presence_penalty?: number;
    }
    interface ExportedChatCompletionsParams {
        apiKey: string;
    }

    fastify.post(
        '/api/exported/context/:apiKey/chat/completions',
        async (request: FastifyRequest<{ Params: ExportedChatCompletionsParams, Body: ExportedChatCompletionsBody }>, reply: FastifyReply) => {
            const { apiKey } = request.params;
            const { model, messages, stream, temperature, max_tokens, top_p, frequency_penalty, presence_penalty } = request.body;
            const startTime = Date.now();
            let promptTokens = 0;
            let completionTokens = 0;

            try {
                const exportData = await verifyExportedApiKey(apiKey, 'context', supabase, fastify.log);
                if (!exportData.allowed_models || !exportData.allowed_models.includes(model)) {
                    return reply.code(403).send({ error: 'Model not allowed' });
                }

                const userContext = await getUserContext(exportData.user_id, supabase, fastify.log);
                let contentForFiltering = '';
                const lastMessage = messages[messages.length - 1];
                if (lastMessage && lastMessage.content) {
                    if (typeof lastMessage.content === 'string') contentForFiltering = lastMessage.content;
                    else if (Array.isArray(lastMessage.content)) {
                        const textParts = lastMessage.content.filter((part: any) => part.type === 'text');
                        contentForFiltering = textParts.map((part: any) => part.text).join(' ');
                    }
                }

                if (contentForFiltering.trim() && (userContext.memories.length > 0 || userContext.notes.length > 0)) {
                    const { relevantMemories, relevantNotes } = await filterRelevantContext(contentForFiltering, userContext.memories, userContext.notes, genAI, fastify.log);
                    userContext.relevantMemories = relevantMemories;
                    userContext.relevantNotes = relevantNotes;
                } else {
                    userContext.relevantMemories = [];
                    userContext.relevantNotes = [];
                }
                
                const contextAwareMessages = buildContextAwareMessages(userContext, [], messages, exportData);

                const openRouterBody: any = { model, messages: contextAwareMessages, stream: stream || false, temperature, max_tokens, top_p, frequency_penalty, presence_penalty };
                Object.keys(openRouterBody).forEach(key => openRouterBody[key] === undefined && delete openRouterBody[key]);

                const openRouterResponse = await callOpenRouter(model, contextAwareMessages, openRouterApiKey, stream || false);

                if (stream) {
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
                    let fullResponseText = ''; 

                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            
                            while(true) {
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
                                        if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                                            fullResponseText += parsed.choices[0].delta.content;
                                        }
                                        if (parsed.usage) { 
                                            promptTokens = parsed.usage.prompt_tokens || promptTokens;
                                            completionTokens = parsed.usage.completion_tokens || completionTokens;
                                        }
                                    } catch (e) {
                                        fastify.log.warn({msg: "Error parsing stream data chunk", dataChunk: data, err: e});
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
                    const responseData: any = await openRouterResponse.json();
                    if (responseData.usage) {
                        promptTokens = responseData.usage.prompt_tokens || 0;
                        completionTokens = responseData.usage.completion_tokens || 0;
                    }
                    reply.code(200).send(responseData);
                }
                
                const responseTimeMs = Date.now() - startTime;
                // Corrected order: apiKey, userId, endpoint, model, supabase, logger, promptTokens, completionTokens, responseTimeMs
                await logApiUsage(apiKey, exportData.user_id, '/api/exported/context/chat/completions', model, supabase, fastify.log, promptTokens, completionTokens, responseTimeMs);

            } catch (error: any) {
                fastify.log.error({ msg: 'Context API consumption error', err: error, apiKey });
                if (!reply.sent) reply.code(500).send({ error: error.message });
                else if (!reply.raw.writableEnded) reply.raw.end();
            }
        }
    );

    fastify.post(
        '/api/exported/session/:apiKey/chat/completions',
        async (request: FastifyRequest<{ Params: ExportedChatCompletionsParams, Body: ExportedChatCompletionsBody }>, reply: FastifyReply) => {
            const { apiKey } = request.params;
            const { model, messages: newMessages, stream, temperature, max_tokens, top_p, frequency_penalty, presence_penalty } = request.body;
            const startTime = Date.now();
            let promptTokens = 0;
            let completionTokens = 0;

            try {
                const exportData = await verifyExportedApiKey(apiKey, 'session', supabase, fastify.log);
                 if (!exportData.session_id) {
                    return reply.code(400).send({ error: 'API key is not configured for a specific session.' });
                }
                if (!exportData.allowed_models || !exportData.allowed_models.includes(model)) {
                    return reply.code(403).send({ error: 'Model not allowed' });
                }

                const { data: sessionHistoryData, error: historyError } = await supabase
                    .from('chat_history')
                    .select('content, role')
                    .eq('session_id', exportData.session_id)
                    .eq('user_id', exportData.user_id)
                    .order('created_at', { ascending: true });
                if (historyError) throw historyError;
                const sessionHistory = (sessionHistoryData || []).map((msg: any) => ({ role: msg.role, content: msg.content }));

                const userContext = await getUserContext(exportData.user_id, supabase, fastify.log);
                let contentForFiltering = '';
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage && lastMessage.content) {
                     if (typeof lastMessage.content === 'string') contentForFiltering = lastMessage.content;
                    else if (Array.isArray(lastMessage.content)) {
                        const textParts = lastMessage.content.filter((part: any) => part.type === 'text');
                        contentForFiltering = textParts.map((part: any) => part.text).join(' ');
                    }
                }

                if (contentForFiltering.trim() && (exportData.include_memories || exportData.include_notes) && (userContext.memories.length > 0 || userContext.notes.length > 0)) {
                    const memoriesToFilter = exportData.include_memories ? userContext.memories : [];
                    const notesToFilter = exportData.include_notes ? userContext.notes : [];
                    const { relevantMemories, relevantNotes } = await filterRelevantContext(contentForFiltering, memoriesToFilter, notesToFilter, genAI, fastify.log);
                    userContext.relevantMemories = relevantMemories;
                    userContext.relevantNotes = relevantNotes;
                } else {
                    userContext.relevantMemories = [];
                    userContext.relevantNotes = [];
                }
                
                const allMessages = buildContextAwareMessages(userContext, sessionHistory, newMessages[newMessages.length -1], exportData);

                const openRouterBody: any = { model, messages: allMessages, stream: stream || false, temperature, max_tokens, top_p, frequency_penalty, presence_penalty };
                Object.keys(openRouterBody).forEach(key => openRouterBody[key] === undefined && delete openRouterBody[key]);

                const openRouterResponse = await callOpenRouter(model, allMessages, openRouterApiKey, stream || false);
                
                if (stream) {
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
                    let fullResponseText = '';

                     try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            
                            buffer += decoder.decode(value, { stream: true });
                            
                            while(true) {
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
                                        if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                                           fullResponseText += parsed.choices[0].delta.content;
                                        }
                                        if (parsed.usage) {
                                            promptTokens = parsed.usage.prompt_tokens || promptTokens;
                                            completionTokens = parsed.usage.completion_tokens || completionTokens;
                                        }
                                    } catch (e) {
                                        fastify.log.warn({msg: "Error parsing stream data chunk", dataChunk: data, err: e});
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
                    const responseData: any = await openRouterResponse.json();
                    if (responseData.usage) {
                        promptTokens = responseData.usage.prompt_tokens || 0;
                        completionTokens = responseData.usage.completion_tokens || 0;
                    }
                    reply.code(200).send(responseData);
                }
                
                const responseTimeMs = Date.now() - startTime;
                // Corrected order: apiKey, userId, endpoint, model, supabase, logger, promptTokens, completionTokens, responseTimeMs
                await logApiUsage(apiKey, exportData.user_id, '/api/exported/session/chat/completions', model, supabase, fastify.log, promptTokens, completionTokens, responseTimeMs);

            } catch (error: any) {
                fastify.log.error({ msg: 'Session API consumption error', err: error, apiKey });
                if (!reply.sent) reply.code(500).send({ error: error.message });
                else if (!reply.raw.writableEnded) reply.raw.end();
            }
        }
    );
}