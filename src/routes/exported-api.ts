import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { EncryptionUtils } from '../utils/encryption';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// OpenAI-compatible request/response types
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  tools?: any[];
  tool_choice?: any;
}

export async function exportedApiRoutes(fastify: FastifyInstance) {
  // Middleware to validate exported API key and get associated data
  async function validateExportedApiKey(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or invalid authorization header' });
    }

    const apiKey = authHeader.substring(7);
    const hashedKey = EncryptionUtils.hashApiKey(apiKey);

    const { data: exportedApi, error } = await supabase
      .from('exported_apis')
      .select(`
        *,
        users (id, email)
      `)
      .eq('api_key_hash', hashedKey)
      .eq('is_active', true)
      .single();

    if (error || !exportedApi) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    // Check if API key is expired
    if (exportedApi.expires_at && new Date(exportedApi.expires_at) < new Date()) {
      return reply.status(401).send({ error: 'API key expired' });
    }

    // Rate limiting check
    const { data: rateLimitData } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('api_key_hash', hashedKey)
      .gte('window_start', new Date(Date.now() - 60000)) // Last minute
      .single();

    if (rateLimitData && rateLimitData.request_count >= exportedApi.rate_limit) {
      return reply.status(429).send({ error: 'Rate limit exceeded' });
    }

    // Update rate limiting
    await supabase
      .from('rate_limits')
      .upsert({
        api_key_hash: hashedKey,
        window_start: new Date(),
        request_count: (rateLimitData?.request_count || 0) + 1
      });

    (request as any).exportedApi = exportedApi;
    (request as any).userId = exportedApi.user_id;
  }

  // Get user context (memory, notes, system prompt) based on API configuration
  async function getUserContext(userId: string, exportedApi: any) {
    // Always get system prompt
    const { data: promptData } = await supabase
      .from('system_prompts')
      .select('*')
      .eq('user_id', userId)
      .single();

    let memory: any[] = [];
    let notes: any[] = [];

    // Only fetch memory if API is configured to include it
    if (exportedApi.include_memories) {
      const { data: memoryData } = await supabase
        .from('memory')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      memory = memoryData || [];
    }

    // Only fetch notes if API is configured to include them
    if (exportedApi.include_notes) {
      const { data: notesData } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      notes = notesData || [];
    }

    return {
      memory,
      notes,
      systemPrompt: promptData?.prompt || "You are a helpful AI assistant."
    };
  }

  // Determine which model to use based on request and API configuration
  function determineModel(requestModel: string, exportedApi: any): string {
    // If model is "base" or matches the API's base model, use the API's default model
    if (requestModel === 'base' || requestModel === exportedApi.base_model) {
      return exportedApi.base_model || 'openai/gpt-4';
    }

    // If API has allowed models and request model is in the list, use it
    if (exportedApi.allowed_models && exportedApi.allowed_models.length > 0) {
      if (exportedApi.allowed_models.includes(requestModel)) {
        return requestModel;
      } else {
        throw new Error(`Model ${requestModel} not allowed for this API. Allowed models: ${exportedApi.allowed_models.join(', ')}`);
      }
    }

    // If no restrictions, allow any model
    return requestModel;
  }

  // Context-based chat completions endpoint
  fastify.post<{
    Body: ChatCompletionRequest;
  }>('/api/exported/context/v1/chat/completions', {
    preHandler: validateExportedApiKey
  }, async (request, reply) => {
    try {
      const { messages, model: requestModel, stream = false, ...otherParams } = request.body;
      const exportedApi = (request as any).exportedApi;
      const userId = (request as any).userId;

      // Determine which model to use
      let modelToUse: string;
      try {
        modelToUse = determineModel(requestModel, exportedApi);
      } catch (error) {
        return reply.status(400).send({ error: (error as Error).message });
      }

      // Get user context based on API configuration
      const context = await getUserContext(userId, exportedApi);

      // Build context-aware system message
      let contextMessage = context.systemPrompt;
      
      if (context.memory.length > 0) {
        contextMessage += '\n\nRelevant memories about the user:\n';
        contextMessage += context.memory.slice(0, 10).map(m => `- ${m.content}`).join('\n');
      }

      if (context.notes.length > 0) {
        contextMessage += '\n\nUser notes:\n';
        contextMessage += context.notes.slice(0, 5).map(n => `- ${n.content}`).join('\n');
      }

      // Prepare messages with context
      const contextMessages: ChatMessage[] = [
        { role: 'system', content: contextMessage },
        ...messages
      ];

      // Call OpenRouter API
      const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'Fast Backend API'
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: contextMessages,
          stream,
          ...otherParams
        })
      });

      if (!openRouterResponse.ok) {
        const error = await openRouterResponse.text();
        return reply.status(openRouterResponse.status).send({ error });
      }

      const hashedKey = EncryptionUtils.hashApiKey(request.headers.authorization!.substring(7));

      // Log API usage
      await supabase.from('api_usage').insert({
        api_key_hash: hashedKey,
        user_id: userId,
        model_used: modelToUse,
        prompt_tokens: 0, // Will be updated from response
        completion_tokens: 0,
        total_tokens: 0,
        request_type: 'context_chat'
      });

      if (stream) {
        // Handle streaming response
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        const reader = openRouterResponse.body?.getReader();
        if (!reader) {
          return reply.status(500).send({ error: 'Failed to read stream' });
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim() === '') continue;
              reply.raw.write(line + '\n');
            }
          }

          if (buffer.trim()) {
            reply.raw.write(buffer + '\n');
          }
        } finally {
          reply.raw.end();
        }
      } else {
        // Handle non-streaming response
        const responseData = await openRouterResponse.json();
        
        // Update usage tracking
        if (responseData.usage) {
          await supabase
            .from('api_usage')
            .update({
              prompt_tokens: responseData.usage.prompt_tokens,
              completion_tokens: responseData.usage.completion_tokens,
              total_tokens: responseData.usage.total_tokens
            })
            .eq('api_key_hash', hashedKey)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1);
        }

        return reply.send(responseData);
      }
    } catch (error) {
      console.error('Context API Error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Session-based chat completions endpoint
  fastify.post<{
    Body: ChatCompletionRequest & { session_id?: string };
  }>('/api/exported/session/v1/chat/completions', {
    preHandler: validateExportedApiKey
  }, async (request, reply) => {
    try {
      const { messages, model: requestModel, session_id, stream = false, ...otherParams } = request.body;
      const exportedApi = (request as any).exportedApi;
      const userId = (request as any).userId;

      // Determine which model to use
      let modelToUse: string;
      try {
        modelToUse = determineModel(requestModel, exportedApi);
      } catch (error) {
        return reply.status(400).send({ error: (error as Error).message });
      }

      let sessionMessages = messages;

      // If session_id is provided and API is session-based, get session history
      if (session_id && exportedApi.export_type === 'session') {
        const { data: sessionHistory } = await supabase
          .from('chat_history')
          .select('*')
          .eq('session_id', exportedApi.session_id)
          .eq('user_id', userId)
          .order('created_at', { ascending: true });

        if (sessionHistory && sessionHistory.length > 0) {
          // Convert session history to chat messages
          const historyMessages: ChatMessage[] = sessionHistory.map(h => ({
            role: h.role as 'user' | 'assistant',
            content: h.content
          }));

          // Combine history with new messages
          sessionMessages = [...historyMessages, ...messages];
        }
      }

      // Call OpenRouter API
      const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'Fast Backend API'
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: sessionMessages,
          stream,
          ...otherParams
        })
      });

      if (!openRouterResponse.ok) {
        const error = await openRouterResponse.text();
        return reply.status(openRouterResponse.status).send({ error });
      }

      const hashedKey = EncryptionUtils.hashApiKey(request.headers.authorization!.substring(7));

      // Log API usage
      await supabase.from('api_usage').insert({
        api_key_hash: hashedKey,
        user_id: userId,
        model_used: modelToUse,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        request_type: 'session_chat'
      });

      if (stream) {
        // Handle streaming response
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        const reader = openRouterResponse.body?.getReader();
        if (!reader) {
          return reply.status(500).send({ error: 'Failed to read stream' });
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim() === '') continue;
              reply.raw.write(line + '\n');
            }
          }

          if (buffer.trim()) {
            reply.raw.write(buffer + '\n');
          }
        } finally {
          reply.raw.end();
        }
      } else {
        // Handle non-streaming response
        const responseData = await openRouterResponse.json();
        
        // Update usage tracking
        if (responseData.usage) {
          await supabase
            .from('api_usage')
            .update({
              prompt_tokens: responseData.usage.prompt_tokens,
              completion_tokens: responseData.usage.completion_tokens,
              total_tokens: responseData.usage.total_tokens
            })
            .eq('api_key_hash', hashedKey)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1);
        }

        return reply.send(responseData);
      }
    } catch (error) {
      console.error('Session API Error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Models endpoint - returns available models for this API
  fastify.get('/api/exported/v1/models', {
    preHandler: validateExportedApiKey
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const exportedApi = (request as any).exportedApi;

      // Get available models from OpenRouter
      const openRouterResponse = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
        }
      });

      if (!openRouterResponse.ok) {
        return reply.status(500).send({ error: 'Failed to fetch models' });
      }

      const modelsData = await openRouterResponse.json();
      let availableModels = modelsData.data;

      // Filter models based on API configuration
      if (exportedApi.allowed_models && exportedApi.allowed_models.length > 0) {
        availableModels = availableModels.filter((model: any) => 
          exportedApi.allowed_models.includes(model.id)
        );
      }

      // Add base model option if configured
      if (exportedApi.base_model) {
        availableModels.unshift({
          id: 'base',
          name: `Base Model (${exportedApi.base_model})`,
          description: `Default model for this API: ${exportedApi.base_model}`
        });
      }

      return reply.send({
        object: 'list',
        data: availableModels
      });
    } catch (error) {
      console.error('Models API Error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}