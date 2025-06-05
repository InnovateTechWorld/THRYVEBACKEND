import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyExportedApiKey, logApiUsage, ExportedApiData } from '../lib/apiUtils';
import { getUserContext, buildContextAwareMessages, UserContextData } from '../lib/context';
import { callOpenRouter, filterRelevantContext } from '../lib/ai';
import { EncryptionUtils } from '../utils/encryption'; // Import EncryptionUtils

// Define a type for the request user after API key verification
interface AuthenticatedRequest extends FastifyRequest {
  exportedApiData?: ExportedApiData; // To store verified API key data
}

interface ExportedChatCompletionsBody {
  model?: string; 
  messages: any[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

export async function exportedApiRoutes(
    fastify: FastifyInstance, 
    options: { 
        supabase: SupabaseClient, 
        genAI: GoogleGenerativeAI, 
        openRouterApiKey: string 
    }
) {
  const { supabase, genAI, openRouterApiKey } = options;

  fastify.addHook('preHandler', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const apiKeyHeader = request.headers.authorization;
    if (!apiKeyHeader || !apiKeyHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or invalid API key. Use Bearer token format.' });
    }
    const apiKey = apiKeyHeader.split(' ')[1];

    let expectedType: 'context' | 'session' = 'context';
    if (request.url.includes('/session/v1/')) { // Use request.url
      expectedType = 'session';
    }
    
    if (request.url.includes('/models')) {
        try {
            const hashedKey = EncryptionUtils.hashApiKey(apiKey); // Use imported EncryptionUtils
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
            return reply.code(403).send({ error: `API Key verification failed: ${error.message}` });
        }
    } else {
        try {
            request.exportedApiData = await verifyExportedApiKey(apiKey, expectedType, supabase, fastify.log);
        } catch (error: any) {
            fastify.log.warn({ msg: 'API Key verification failed in exported-api preHandler', err: error.message });
            return reply.code(403).send({ error: `API Key verification failed: ${error.message}` });
        }
    }
  });

  fastify.post(
    '/api/exported/context/v1/chat/completions',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      const { messages, stream, temperature, max_tokens, top_p, frequency_penalty, presence_penalty } = request.body as ExportedChatCompletionsBody;
      const exportData = request.exportedApiData!; 
      const modelToUse = (request.body as ExportedChatCompletionsBody).model || exportData.base_model;
      const apiKey = request.headers.authorization!.split(' ')[1]; 
      const startTime = Date.now();
      let promptTokens = 0;
      let completionTokens = 0;

      try {
        if (!exportData.allowed_models || !exportData.allowed_models.includes(modelToUse)) {
          return reply.code(403).send({ error: `Model '${modelToUse}' not allowed for this API key.` });
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

        const contextAwareMessages = buildContextAwareMessages(userContext, [], messages, exportData);
        const openRouterBody: any = { model: modelToUse, messages: contextAwareMessages, stream: stream || false, temperature, max_tokens, top_p, frequency_penalty, presence_penalty };
        Object.keys(openRouterBody).forEach(key => openRouterBody[key] === undefined && delete openRouterBody[key]);

        const openRouterResponse = await callOpenRouter(modelToUse, contextAwareMessages, openRouterApiKey, stream || false);

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
                  } catch (e) { /* ignore */ }
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
        await logApiUsage(apiKey, exportData.user_id, request.url, modelToUse, supabase, fastify.log, promptTokens, completionTokens, responseTimeMs);

      } catch (error: any) {
        fastify.log.error({ msg: 'Exported Context API (v1) consumption error', err: error.message, apiKeyId: exportData?.id }); // Added optional chaining for exportData
        if (!reply.sent) reply.code(500).send({ error: error.message });
        else if (!reply.raw.writableEnded) reply.raw.end();
      }
    }
  );

  fastify.post(
    '/api/exported/session/v1/chat/completions',
    async (request: AuthenticatedRequest, reply: FastifyReply) => {
      const { messages, stream, temperature, max_tokens, top_p, frequency_penalty, presence_penalty } = request.body as ExportedChatCompletionsBody;
      const exportData = request.exportedApiData!;
      const modelToUse = (request.body as ExportedChatCompletionsBody).model || exportData.base_model;
      const apiKey = request.headers.authorization!.split(' ')[1];
      const startTime = Date.now();
      let promptTokens = 0;
      let completionTokens = 0;

      try {
        if (!exportData.session_id) {
          return reply.code(400).send({ error: 'API key is not configured for a specific session.' });
        }
        if (!exportData.allowed_models || !exportData.allowed_models.includes(modelToUse)) {
          return reply.code(403).send({ error: `Model '${modelToUse}' not allowed for this API key.` });
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
        const lastMessage = messages[messages.length - 1];
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

        const allMessages = buildContextAwareMessages(userContext, sessionHistory, messages[messages.length - 1], exportData);
        const openRouterBody: any = { model: modelToUse, messages: allMessages, stream: stream || false, temperature, max_tokens, top_p, frequency_penalty, presence_penalty };
        Object.keys(openRouterBody).forEach(key => openRouterBody[key] === undefined && delete openRouterBody[key]);

        const openRouterResponse = await callOpenRouter(modelToUse, allMessages, openRouterApiKey, stream || false);

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
                  } catch (e) { /* ignore */ }
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
        await logApiUsage(apiKey, exportData.user_id, request.url, modelToUse, supabase, fastify.log, promptTokens, completionTokens, responseTimeMs);

      } catch (error: any) {
        fastify.log.error({ msg: 'Exported Session API (v1) consumption error', err: error.message, apiKeyId: exportData?.id }); // Added optional chaining
        if (!reply.sent) reply.code(500).send({ error: error.message });
        else if (!reply.raw.writableEnded) reply.raw.end();
      }
    }
  );

  fastify.get('/api/exported/v1/models', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const exportData = request.exportedApiData!;
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            headers: { 'Authorization': `Bearer ${openRouterApiKey}` },
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch models from OpenRouter: ${errorText}`);
        }
        const allModelsData: any = await response.json();
        let modelsToList = allModelsData.data;

        if (exportData.allowed_models && exportData.allowed_models.length > 0) {
            modelsToList = allModelsData.data.filter((m: any) => exportData.allowed_models.includes(m.id));
        }
        
        const apiKey = request.headers.authorization!.split(' ')[1];
        await logApiUsage(apiKey, exportData.user_id, request.url, 'N/A (models_list)', supabase, fastify.log, 0, 0, 0);

        reply.send({ data: modelsToList });
    } catch (error: any) {
        fastify.log.error({ msg: 'Error fetching models for exported API', err: error.message, apiKeyId: exportData?.id }); // Added optional chaining
        reply.code(500).send({ error: 'Could not fetch models.' });
    }
  });

}