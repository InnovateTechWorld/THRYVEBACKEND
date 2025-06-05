import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';
import { callOpenRouter, filterRelevantContext, shouldCommitToMemory, generateSessionTitle } from '../lib/ai';
import { getUserContext, buildContextAwareMessages, UserContextData } from '../lib/context';
import { logApiUsage } from '../lib/apiUtils';


interface ChatMessageBody {
  sessionId: string;
  model: string;
  content: any; // Can be string or array of parts for multimodal
  file_urls?: string[];
}

interface ChatSessionParams {
  sessionId: string;
}

interface ChatSessionNameBody {
  name: string;
}

interface ImageGenerateBody {
  model: string;
  prompt: string;
}

export default async function chatRoutes(
  fastify: FastifyInstance,
  options: {
    supabase: SupabaseClient,
    genAI: GoogleGenerativeAI,
    openRouterApiKey: string
  }
) {
  const { supabase, genAI, openRouterApiKey } = options;

  fastify.post('/chat/message', async (request: FastifyRequest<{ Body: ChatMessageBody }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const { sessionId, model, content, file_urls } = request.body;
    const startTime = Date.now(); // ADD THIS LINE - Track when the request started


    try {
      let actualSessionId = sessionId;
      if (sessionId === 'default') {
        actualSessionId = randomUUID();
      }

      const userContext: UserContextData = await getUserContext(userId, supabase, fastify.log);

      let contentForFiltering = '';
      if (typeof content === 'string') {
        contentForFiltering = content;
      } else if (Array.isArray(content)) {
        const textParts = content.filter((part: any) => part.type === 'text');
        contentForFiltering = textParts.map((part: any) => part.text).join(' ');
      }

      if (contentForFiltering.trim() && (userContext.memories.length > 0 || userContext.notes.length > 0)) {
        const { relevantMemories, relevantNotes } = await filterRelevantContext(
          contentForFiltering,
          userContext.memories,
          userContext.notes,
          genAI,
          fastify.log
        );
        userContext.relevantMemories = relevantMemories;
        userContext.relevantNotes = relevantNotes;
      } else {
        userContext.relevantMemories = [];
        userContext.relevantNotes = [];
      }

      const { data: existingHistory, error: historyCheckError } = await supabase
        .from('chat_history')
        .select('id')
        .eq('session_id', actualSessionId)
        .eq('user_id', userId)
        .limit(1);

      if (historyCheckError) throw historyCheckError;
      const isFirstMessage = !existingHistory || existingHistory.length === 0;

      if (isFirstMessage && typeof content === 'string') { // Title generation only for string content for now
        const sessionTitle = await generateSessionTitle(content, openRouterApiKey, fastify.log);
        const { error: sessionError } = await supabase
          .from('chat_sessions')
          .upsert({ id: actualSessionId, user_id: userId, name: sessionTitle }, { onConflict: 'id' });
        if (sessionError) fastify.log.error({ msg: 'Failed to create/update chat session', err: sessionError });
      }

      const { data: sessionHistoryData, error: historyError } = await supabase
        .from('chat_history')
        .select('content, role')
        .eq('session_id', actualSessionId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (historyError) throw historyError;
      const sessionHistory = sessionHistoryData || [];


      let userMessage: any = { role: 'user', content };
      if (file_urls && file_urls.length > 0) {
        userMessage = {
          role: 'user',
          content: [
            { type: 'text', text: content }, // Assuming content is the text part
            ...file_urls.map(url => ({ type: 'image_url', image_url: { url } }))
          ]
        };
      }


      const messagesForOpenRouter = buildContextAwareMessages(userContext, sessionHistory, userMessage);

      const { error: storeError } = await supabase.from('chat_history').insert([{
        user_id: userId,
        session_id: actualSessionId,
        model_id: model,
        content: userMessage.content, // Store the potentially complex content
        file_urls: file_urls || [],
        role: 'user'
      }]);
      if (storeError) throw storeError;

      const openRouterResponse = await callOpenRouter(model, messagesForOpenRouter, openRouterApiKey, true);

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'X-Session-ID': actualSessionId
      });

      if (sessionId === 'default') {
        reply.raw.write(`data: ${JSON.stringify({ sessionId: actualSessionId })}\n\n`);
      }

      const reader = openRouterResponse.body?.getReader();
      if (!reader) {
        fastify.log.error('Failed to get reader from OpenRouter response');
        reply.raw.end();
        return;
      }
      const decoder = new TextDecoder();
    let buffer = '';
    let assistantResponseContent = '';
    let promptTokens = 0;
    let completionTokens = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last partial line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              if (data === '[DONE]') {
                reply.raw.write('data: [DONE]\n\n');
                break;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                  const chunkContent = parsed.choices[0].delta.content;
                  assistantResponseContent += chunkContent;
                  reply.raw.write(`data: ${JSON.stringify({ content: chunkContent })}\n\n`);
                }
                 // ADD THIS: Extract usage information from streaming response
              if (parsed.usage) {
                promptTokens = parsed.usage.prompt_tokens || promptTokens;
                completionTokens = parsed.usage.completion_tokens || completionTokens;
              }
              } catch (e) {
                fastify.log.warn({ msg: 'Error parsing stream data chunk', dataChunk: data, err: e });
              }
            }
          }
        }
         if (buffer.startsWith('data: ')) { // Process any remaining data in buffer
            const data = buffer.substring(6);
            if (data !== '[DONE]') {
                 try {
                    const parsed = JSON.parse(data);
                    if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                        const chunkContent = parsed.choices[0].delta.content;
                        assistantResponseContent += chunkContent;
                        reply.raw.write(`data: ${JSON.stringify({ content: chunkContent })}\n\n`);
                    }
                    if (parsed.usage) {
              promptTokens = parsed.usage.prompt_tokens || promptTokens;
              completionTokens = parsed.usage.completion_tokens || completionTokens;
            }
                } catch (e) {
                    fastify.log.warn({ msg: 'Error parsing final stream data chunk', dataChunk: data, err: e });
                }
            }
             if (data === '[DONE]') {
                reply.raw.write('data: [DONE]\n\n');
            }
        }


      } finally {
        reader.releaseLock();
      }


      if (assistantResponseContent.trim()) {
        const { error: storeAssistantError } = await supabase.from('chat_history').insert([{
          user_id: userId,
          session_id: actualSessionId,
          model_id: model,
          content: assistantResponseContent,
          role: 'assistant'
        }]);
        if (storeAssistantError) fastify.log.error({ msg: 'Failed to store assistant response', err: storeAssistantError });

        const responseTimeMs = Date.now() - startTime;

        console.log('About to log chat usage:', {
  apiKeyHash: 'internal-chat',
  userId,
  endpoint: '/chat/message',
  model,
  promptTokens,
  completionTokens,
  responseTimeMs
});



      await logApiUsage(
        'internal-chat', // Special key for internal chat usage
        userId,
        '/chat/message',
        model,
        supabase,
        fastify.log,
        promptTokens,
        completionTokens,
        responseTimeMs
      );

        

        let textContentForAnalysis = '';
        if (typeof content === 'string') {
            textContentForAnalysis = content;
        } else if (Array.isArray(content)) {
            const textPart = content.find(part => part.type === 'text');
            if (textPart) textContentForAnalysis = textPart.text;
        }


        if (textContentForAnalysis.trim() && assistantResponseContent.trim()) {
          const memoryAnalysis = await shouldCommitToMemory(
            textContentForAnalysis,
            assistantResponseContent,
            JSON.stringify({ memories: userContext.memories, notes: userContext.notes }),
            genAI,
            fastify.log
          );
          if (memoryAnalysis.shouldCommit && memoryAnalysis.memoryContent) {
            const { error: memoryError } = await supabase.from('memory').insert([{
              user_id: userId,
              content: memoryAnalysis.memoryContent
            }]);
            if (memoryError) fastify.log.error({ msg: 'Failed to auto-commit to memory', err: memoryError });
            else fastify.log.info({ msg: 'Auto-committed to memory', content: memoryAnalysis.memoryContent });
          }
        }
      }
      reply.raw.end();
    } catch (error: any) {
      fastify.log.error({ msg: 'Chat message error', err: error, userId, sessionId });
      if (!reply.sent) {
        reply.code(500).send({ error: error.message });
      } else {
        // If headers already sent, we can't send a JSON error, but we should end the stream.
        if (!reply.raw.writableEnded) {
            reply.raw.end();
        }
      }
    }
  });

  fastify.get('/chat/history/:sessionId', async (request: FastifyRequest<{ Params: ChatSessionParams }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const { sessionId } = request.params;
    try {
      if (sessionId === 'default') {
        return reply.code(200).send([]);
      }
      const { data, error } = await supabase
        .from('chat_history')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      reply.code(200).send(data || []);
    } catch (error: any) {
      fastify.log.error({ msg: 'Chat history error', err: error, userId, sessionId });
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/chat/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded.' });
    }

    const filename = data.filename;
    const mimetype = data.mimetype;
    const buffer = await data.toBuffer();
    const supabaseUrl = process.env.SUPABASE_URL;


    try {
      const filePath = `${userId}/${Date.now()}-${filename}`; // Add timestamp to avoid overwrites
      const { error: uploadError } = await supabase.storage
        .from('user_uploads') // Ensure this bucket exists and has correct policies
        .upload(filePath, buffer, {
          contentType: mimetype,
          upsert: false, // Consider if upsert should be true
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('user_uploads').getPublicUrl(filePath);
      const fileUrl = publicUrlData.publicUrl;


      const { data: fileMetadata, error: fileMetadataError } = await supabase.from('user_files').insert([
        {
          user_id: userId,
          filename: filename,
          file_type: mimetype,
          file_url: fileUrl,
          file_size: buffer.length,
          storage_path: filePath
        },
      ]).select();
      if (fileMetadataError) throw fileMetadataError;

      const fileId = fileMetadata && fileMetadata.length > 0 ? fileMetadata[0].id : null;
      reply.code(201).send({ fileUrl, fileId });
    } catch (error: any) {
      fastify.log.error({ msg: 'File upload error', err: error, userId, filename });
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.get('/chat/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    try {
      const { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('id, name, created_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (error) throw error;

      const sessionsWithCounts = await Promise.all(
        (sessions || []).map(async (session: any) => {
          const { count, error: countError } = await supabase
            .from('chat_history')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', session.id)
            .eq('user_id', userId);
          return { ...session, message_count: countError ? 0 : count };
        })
      );
      reply.code(200).send(sessionsWithCounts);
    } catch (error: any) {
      fastify.log.error({ msg: 'Error fetching chat sessions', err: error, userId });
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.patch('/chat/sessions/:sessionId', async (
    request: FastifyRequest<{ Params: ChatSessionParams, Body: ChatSessionNameBody }>,
    reply: FastifyReply
  ) => {
    const userId = request.user.id;
    const { sessionId } = request.params;
    const { name } = request.body;
    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      reply.code(200).send(data);
    } catch (error: any) {
      fastify.log.error({ msg: 'Error updating chat session name', err: error, userId, sessionId });
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.delete('/chat/sessions/:sessionId', async (request: FastifyRequest<{ Params: ChatSessionParams }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const { sessionId } = request.params;
    try {
      // RLS should handle ensuring user can only delete their own sessions/history
      const { error: historyError } = await supabase
        .from('chat_history')
        .delete()
        .eq('session_id', sessionId)
        .eq('user_id', userId); // Still good to be explicit
      if (historyError) throw historyError;

      const { error: sessionError } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId)
        .eq('user_id', userId);
      if (sessionError) throw sessionError;

      reply.code(204).send();
    } catch (error: any) {
      fastify.log.error({ msg: 'Error deleting chat session', err: error, userId, sessionId });
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.post('/chat/image/generate', async (request: FastifyRequest<{ Body: ImageGenerateBody }>, reply: FastifyReply) => {
    const { model, prompt } = request.body;
    // Placeholder - actual image generation logic would go here
    fastify.log.info({ msg: 'Image generation request (placeholder)', model, prompt, userId: request.user.id });
    reply.code(200).send({ message: `Image generation endpoint (placeholder for model: ${model}, prompt: ${prompt})` });
  });
}