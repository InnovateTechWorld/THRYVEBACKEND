import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from 'crypto';
import { callOpenRouter, filterRelevantContext, shouldCommitToMemory, generateSessionTitle } from '../lib/ai';
import { getUserContext, buildContextAwareMessages, UserContextData } from '../lib/context';
import { logApiUsage } from '../lib/apiUtils';
import { OpenRouterManager, OpenRouterError } from '../lib/openRouterManager';


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

// Error codes for OpenRouter integration
enum ChatError {
  MODEL_NOT_ALLOWED_FOR_PLAN = 'MODEL_NOT_ALLOWED_FOR_PLAN',
  CREDIT_INSUFFICIENT = 'CREDIT_INSUFFICIENT',
  USER_KEY_DISABLED = 'USER_KEY_DISABLED',
  USER_KEY_NOT_FOUND = 'USER_KEY_NOT_FOUND'
}

interface ImageGenerateBody {
  model: string;
  prompt: string;
}

// Update the options interface to include openRouterProvisioningKey
export default async function chatRoutes(
  fastify: FastifyInstance,
  options: {
    supabase: SupabaseClient,
    genAI: GoogleGenerativeAI,
    openRouterProvisioningKey: string
  }
) {
  const { supabase, genAI, openRouterProvisioningKey } = options;
  const openRouterManager = new OpenRouterManager(openRouterProvisioningKey);

  fastify.post('/chat/message', async (request: FastifyRequest<{ Body: ChatMessageBody }>, reply: FastifyReply) => {
    const userId = request.user.id;
    const { sessionId, model, content, file_urls } = request.body;
    const startTime = Date.now();

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

      if (isFirstMessage && typeof content === 'string') {
        // Get user's API key for title generation
        const apiKeyResponse = await openRouterManager.getUserApiKey(userId, supabase, fastify.log);
        if (!apiKeyResponse.success) {
          fastify.log.warn({ msg: 'Using default title - failed to get user key', userId });
          const sessionTitle = `Chat ${new Date().toLocaleDateString()}`;
          const { error: sessionError } = await supabase
            .from('chat_sessions')
            .upsert({ id: actualSessionId, user_id: userId, name: sessionTitle }, { onConflict: 'id' });
          if (sessionError) fastify.log.error({ msg: 'Failed to create/update chat session', err: sessionError });
          return;
        }

        const sessionTitle = await generateSessionTitle(content, apiKeyResponse.data!, fastify.log);
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

      // Check credit balance before making the call
const creditCheckResponse = await openRouterManager.checkUserCredits(
  userId, 
  0.001, 
  supabase, 
  fastify.log,
  model // ✅ Pass the model ID for free model check
);


if (!creditCheckResponse.success) {
  if (creditCheckResponse.error?.code === OpenRouterError.KEY_NOT_FOUND) {
    fastify.log.error({ msg: 'User OpenRouter key not found', userId });
    return reply.code(404).send({
      error: ChatError.USER_KEY_NOT_FOUND,
      message: 'OpenRouter key not found. Please contact support.'
    });
  } else if (creditCheckResponse.error?.code === OpenRouterError.INSUFFICIENT_CREDITS) {
    // Enhanced insufficient credits error with free model suggestions
    fastify.log.warn({ msg: 'User has insufficient credits', userId, model, error: creditCheckResponse.error });
    return reply.code(402).send({
      error: ChatError.CREDIT_INSUFFICIENT,
      message: creditCheckResponse.error.message,
      details: {
        available: creditCheckResponse.error.details?.available || 0,
        required: creditCheckResponse.error.details?.required || 1,
        freeModelsAvailable: creditCheckResponse.error.details?.freeModelsAvailable || [],
        suggestion: creditCheckResponse.error.details?.suggestion || 'Consider using a free model',
        freeModelPattern: creditCheckResponse.error.details?.freeModelPattern || 'Models ending with ":free" don\'t require credits'
      }
    });
  } else {
    fastify.log.error({ msg: 'Failed to check user credits', userId, error: creditCheckResponse.error });
    return reply.code(500).send({ error: creditCheckResponse.error });
  }
}

const { sufficient, available, isFreeModel } = creditCheckResponse.data!;

// Only check credits for paid models
if (!isFreeModel && (!sufficient || available <= 0)) {
  fastify.log.warn({ msg: 'User has insufficient credits for paid model', userId, available, sufficient, model });
  return reply.code(402).send({
    error: ChatError.CREDIT_INSUFFICIENT,
    message: 'Your credit balance is insufficient for this paid model. Please top up or use a free model.',
    details: { 
      available, 
      sufficient, 
      modelType: 'paid',
      suggestion: 'Try a model ending with ":free" which doesn\'t require credits'
    }
  });
}

// Log model type for debugging
fastify.log.info({ 
  msg: 'Model access granted', 
  userId, 
  model, 
  modelType: isFreeModel ? 'free' : 'paid',
  creditsAvailable: available 
});



      // Check model access permissions (basic check - can be enhanced with plan-based restrictions)
      const modelCheckResponse = await openRouterManager.checkModelAccess(userId, model, supabase, fastify.log);
      
      if (!modelCheckResponse.success) {
        if (modelCheckResponse.error?.code === OpenRouterError.MODEL_NOT_ALLOWED) {
          fastify.log.warn({ msg: 'Model not allowed for user plan', userId, model });
          return reply.code(403).send({
            error: ChatError.MODEL_NOT_ALLOWED_FOR_PLAN,
            message: `Model '${model}' is not available on your current plan. Please upgrade to access this model.`
          });
        } else {
          fastify.log.error({ msg: 'Model access check failed', userId, model, error: modelCheckResponse.error });
          return reply.code(500).send({ error: modelCheckResponse.error });
        }
      }

      // Get user's API key
      const apiKeyResponse = await openRouterManager.getUserApiKey(userId, supabase, fastify.log);

      if (!apiKeyResponse.success) {
        fastify.log.error({ msg: 'Failed to get OpenRouter key for user', userId, error: apiKeyResponse.error });
        return reply.code(500).send({
          error: ChatError.USER_KEY_NOT_FOUND,
          message: 'Failed to retrieve your OpenRouter key. Please contact support.'
        });
      }

      const userApiKey = apiKeyResponse.data;

      fastify.log.info({
        msg: 'Using user OpenRouter key for chat',
        userId,
        model,
        available: available,
        keyType: 'user-openrouter-key'
      });
if (!userApiKey) {
  throw new Error('User OpenRouter key is required');
}

const openRouterResponse = await callOpenRouter(model, messagesForOpenRouter, userApiKey, true);

// Sync user usage after OpenRouter call
await openRouterManager.syncUserCredits(userId, supabase, fastify.log);


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

         fastify.log.info({
           msg: 'About to log chat usage',
           keySource: 'user-openrouter-key',
           userId,
           endpoint: '/chat/message',
           model,
           promptTokens,
           completionTokens,
           responseTimeMs
         });
       


       const keyHash = 'user-openrouter-key';
       await logApiUsage(
         keyHash,
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