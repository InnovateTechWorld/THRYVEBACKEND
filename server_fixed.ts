import 'dotenv/config';
import fastify from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { fetch } from 'undici';
import fastifyJwt from '@fastify/jwt';
import { FastifyRequest } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { exportedApiRoutes } from './src/routes/exported-api';
import { adminExportedApiRoutes } from './src/routes/admin-exported-api';
import fastifyCors from '@fastify/cors';


// Extend FastifyRequest and FastifyJWT types
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      id: string;
      email?: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string;
      email?: string;
    };
  }
}

// Initialize Fastify
const app = fastify({ logger: true });

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY as string;
const openRouterApiKey = process.env.OPENROUTER_API_KEY as string;
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !supabaseAnonKey || !openRouterApiKey || !supabaseJwtSecret || !supabaseServiceKey) {
  app.log.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Register plugins
app.register(fastifyJwt, {
  secret: supabaseJwtSecret,
  decode: { complete: true }
});

app.register(fastifyMultipart);

app.register(fastifyCors, {
  origin: true, // Allow all origins
  credentials: true, // Allow credentials (cookies, authorization headers)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization'] // Add this line
});

// Authentication Middleware
app.addHook('preHandler', async (request: FastifyRequest, reply) => {
  // Skip auth for OAuth and exported API routes
  if (request.url === '/oauth/token' || request.url.startsWith('/api/exported/')) {
    return;
  }

  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('No authorization token provided');
    }
    const token = authHeader.split(' ')[1];

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data || !data.user) {
      throw new Error('Invalid or expired token');
    }

    request.user = data.user as { id: string; email?: string };
  } catch (error: any) {
    reply.code(401).send({ error: 'Unauthorized', message: error.message });
    throw new Error('Authentication failed');
  }
});

// Helper function to call OpenRouter API
async function callOpenRouter(model: string, messages: any[], stream: boolean = false, tools?: any[]) {
  const headers = {
    'Authorization': `Bearer ${openRouterApiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://your-site-url.com',
    'X-Title': 'Fast Backend AI App',
  };

  const body: any = { model, messages, stream };
  if (tools) {
    body.tools = tools;
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData: any = await response.json();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorData.message || JSON.stringify(errorData)}`);
  }

  return response;
}

// Helper function to analyze if content should be committed to memory using Gemini
async function shouldCommitToMemory(content: string, userContext: string): Promise<{ shouldCommit: boolean; memoryContent?: string }> {
  const analysisMessages = [
    {
      role: 'system',
      content: `You are an AI assistant that determines whether user conversation content should be saved to their personal memory for future reference.

Analyze the user's message and determine if it contains:
- Important personal information (preferences, facts about the user, goals, etc.)
- Key insights or decisions they've made
- Information they might want to reference later
- Context that would be valuable for future conversations

Current user context: ${userContext}

Respond with a JSON object containing:
- "shouldCommit": boolean (true if content should be saved)
- "memoryContent": string (if shouldCommit is true, provide a concise summary of what should be remembered)

Only commit meaningful, referenceable information. Don't commit basic greetings, simple questions, or temporary/transactional content.`
    },
    {
      role: 'user',
      content: `Analyze this message: "${content}"`
    }
  ];

  try {
    const response = await callOpenRouter('google/gemini-2.0-flash-exp:free', analysisMessages);
    const data: any = await response.json();
    const analysis = JSON.parse(data.choices[0].message.content);
    return analysis;
  } catch (error) {
    app.log.error('Memory analysis failed:', error);
    return { shouldCommit: false };
  }
}

// Helper function to generate session title using AI
async function generateSessionTitle(firstMessage: string): Promise<string> {
  const titleMessages = [
    {
      role: 'system',
      content: `You are an AI assistant that generates concise, descriptive titles for chat conversations based on the user's first message.

Generate a short, clear title (3-8 words) that captures the main topic or intent of the conversation.

Examples:
- "How to learn Python" → "Learning Python Programming"
- "Plan my vacation to Japan" → "Japan Vacation Planning"
- "Debug my React code" → "React Code Debugging"
- "Explain quantum physics" → "Quantum Physics Explanation"

Respond with ONLY the title, no quotes or additional text.`
    },
    {
      role: 'user',
      content: `Generate a title for this conversation starter: "${firstMessage}"`
    }
  ];

  try {
    const response = await callOpenRouter('google/gemini-2.0-flash-001', titleMessages);
    const data: any = await response.json();
    const title = data.choices[0].message.content.trim();
    return title || 'New Conversation';
  } catch (error) {
    app.log.error('Title generation failed:', error);
    return 'New Conversation';
  }
}

// Helper function to get user context (memory, notes, system prompt)
async function getUserContext(userId: string) {
  try {
    const [memoryResult, notesResult, systemPromptResult] = await Promise.all([
      supabase.from('memory').select('content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      supabase.from('notes').select('content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
      supabase.from('system_prompts').select('prompt').eq('user_id', userId).single()
    ]);

    const context = {
      memories: memoryResult.data || [],
      notes: notesResult.data || [],
      systemPrompt: systemPromptResult.data?.prompt || 'You are a helpful AI assistant.'
    };

    return context;
  } catch (error) {
    app.log.error('Failed to get user context:', error);
    return {
      memories: [],
      notes: [],
      systemPrompt: 'You are a helpful AI assistant.'
    };
  }
}

// Helper function to build context-aware messages
function buildContextAwareMessages(userContext: any, sessionHistory: any[], newMessage: any, exportConfig?: any) {
  const messages = [];

  // Add system prompt (user's custom or default)
  messages.push({
    role: 'system',
    content: userContext.systemPrompt
  });

  // Add user context based on export configuration or default behavior
  const shouldIncludeMemories = exportConfig ? exportConfig.include_memories : (userContext.memories.length > 0);
  const shouldIncludeNotes = exportConfig ? exportConfig.include_notes : (userContext.notes.length > 0);

  if (shouldIncludeMemories || shouldIncludeNotes) {
    let contextContent = '';
    
    if (shouldIncludeMemories && userContext.memories.length > 0) {
      contextContent += '\n\nRelevant memories about the user:\n';
      userContext.memories.forEach((memory: any, index: number) => {
        contextContent += `${index + 1}. ${memory.content}\n`;
      });
    }

    if (shouldIncludeNotes && userContext.notes.length > 0) {
      contextContent += '\n\nUser\'s notes:\n';
      userContext.notes.forEach((note: any, index: number) => {
        contextContent += `${index + 1}. ${note.content}\n`;
      });
    }

    if (contextContent.trim()) {
      messages.push({
        role: 'system',
        content: `Additional context about the user:${contextContent}\n\nUse this context to provide more personalized and relevant responses.`
      });
    }
  }

  // Add session history (limit to last 20 messages for context window management)
  const recentHistory = sessionHistory.slice(-20);
  messages.push(...recentHistory);

  // Add new message
  messages.push(newMessage);

  return messages;
}

// Helper function to verify exported API key
async function verifyExportedApiKey(apiKey: string, expectedType: string) {
  try {
    // Import encryption utility
    const { EncryptionUtils } = await import('./src/utils/encryption');
    const hashedKey = EncryptionUtils.hashApiKey(apiKey);

    const { data, error } = await supabase
      .from('exported_apis')
      .select('*')
      .eq('api_key_hash', hashedKey)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      throw new Error('Invalid API key');
    }

    // Check if expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      throw new Error('API key has expired');
    }

    // Check if type matches
    if (data.export_type !== expectedType) {
      throw new Error(`Invalid API key type. Expected ${expectedType}, got ${data.export_type}`);
    }

    return data;
  } catch (error: any) {
    throw new Error(`API key verification failed: ${error.message}`);
  }
}

// Helper function to log API usage
async function logApiUsage(apiKey: string, userId: string, endpoint: string, model: string, promptTokens: number = 0, completionTokens: number = 0, responseTimeMs: number = 0) {
  try {
    // Import encryption utility
    const { EncryptionUtils } = await import('./src/utils/encryption');
    const hashedKey = EncryptionUtils.hashApiKey(apiKey);

    await supabase.from('api_usage').insert([{
      api_key_hash: hashedKey,
      user_id: userId,
      model_used: model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      request_type: endpoint,
    }]);
  } catch (error) {
    app.log.error('Failed to log API usage:', error);
  }
}

// 1. User Memory & Notes Management
app.post('/memory', async (request, reply) => {
  const userId = request.user.id;
  const { content } = request.body as { content: string };
  try {
    const { data, error } = await supabase.from('memory').insert([{ user_id: userId, content }]).select();
    if (error) throw error;
    reply.code(201).send(data);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

app.get('/memory', async (request, reply) => {
  const userId = request.user.id;
  try {
    const { data, error } = await supabase.from('memory').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    reply.code(200).send(data);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

app.delete('/memory/:id', async (request, reply) => {
  const userId = request.user.id;
  const { id } = request.params as { id: string };
  try {
    const { error } = await supabase.from('memory').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
    reply.code(204).send();
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

app.post('/notes', async (request, reply) => {
  const userId = request.user.id;
  const { content } = request.body as { content: string };
  try {
    const { data, error } = await supabase.from('notes').insert([{ user_id: userId, content }]).select();
    if (error) throw error;
    reply.code(201).send(data);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

app.get('/notes', async (request, reply) => {
  const userId = request.user.id;
  try {
    const { data, error } = await supabase.from('notes').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    reply.code(200).send(data);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

app.delete('/notes/:id', async (request, reply) => {
  const userId = request.user.id;
  const { id } = request.params as { id: string };
  try {
    const { error } = await supabase.from('notes').delete().eq('id', id).eq('user_id', userId);
    if (error) throw error;
    reply.code(204).send();
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

app.patch('/system-prompt', async (request, reply) => {
  const userId = request.user.id;
  const { prompt } = request.body as { prompt: string };
  try {
    const { data, error } = await supabase.from('system_prompts').upsert({ user_id: userId, prompt }, { onConflict: 'user_id' }).select();
    if (error) throw error;
    reply.code(200).send(data);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

// 2. Enhanced Chat Interface with Memory Integration
app.post('/chat/message', async (request, reply) => {
  const userId = request.user.id;
  const { sessionId, model, content, file_urls } = request.body as { sessionId: string; model: string; content: any; file_urls?: string[] };

  try {
    // Get user context (memories, notes, system prompt)
    const userContext = await getUserContext(userId);

    // Check if this is a new session (first message)
    const { data: existingHistory, error: historyCheckError } = await supabase
      .from('chat_history')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .limit(1);

    if (historyCheckError) throw historyCheckError;

    const isFirstMessage = !existingHistory || existingHistory.length === 0;

    // If this is the first message, create/update the chat session with a generated title
    if (isFirstMessage && typeof content === 'string') {
      const sessionTitle = await generateSessionTitle(content);
      
      // Create or update the chat session
      const { error: sessionError } = await supabase
        .from('chat_sessions')
        .upsert({
          id: sessionId,
          user_id: userId,
          name: sessionTitle
        }, {
          onConflict: 'id'
        });

      if (sessionError) {
        app.log.error('Failed to create/update chat session:', sessionError);
        // Continue anyway, don't fail the chat
      }
    }

    // Get session history
    const { data: sessionHistory, error: historyError } = await supabase
      .from('chat_history')
      .select('content, role')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (historyError) throw historyError;

    // Build the user message
    let userMessage: any = { role: 'user', content };
    if (file_urls && file_urls.length > 0) {
      userMessage = {
        role: 'user',
        content: [
          { type: 'text', text: content },
          ...file_urls.map(url => ({ type: 'image_url', image_url: { url } }))
        ]
      };
    }

    // Build context-aware messages
    const messagesForOpenRouter = buildContextAwareMessages(
      userContext,
      sessionHistory || [],
      userMessage
    );

    // Store user message in chat_history
    const { error: storeError } = await supabase.from('chat_history').insert([{ 
      user_id: userId, 
      session_id: sessionId, 
      model_id: model, 
      content: userMessage.content, 
      file_urls: file_urls || [],
      role: 'user'
    }]);
    if (storeError) throw storeError;

    // Call OpenRouter API for the response
    const openRouterResponse = await callOpenRouter(model, messagesForOpenRouter, true);

    // Set up streaming response
    reply.raw.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Credentials': 'true'
});

    const reader = openRouterResponse.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let assistantResponse = '';

    while (true) {
      const { done, value } = await reader!.read();
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
            reply.raw.write('data: [DONE]\n\n');
            break;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0].delta.content;
            if (content) {
              assistantResponse += content;
              reply.raw.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch (e) {
            // Ignore invalid JSON
          }
        }
      }
    }

    // Store assistant response
    if (assistantResponse.trim()) {
      const { error: storeAssistantError } = await supabase.from('chat_history').insert([{ 
        user_id: userId, 
        session_id: sessionId, 
        model_id: model, 
        content: assistantResponse,
        role: 'assistant'
      }]);
      if (storeAssistantError) app.log.error('Failed to store assistant response:', storeAssistantError);

      // Auto-commit to memory using Gemini analysis
      if (typeof content === 'string') {
        const memoryAnalysis = await shouldCommitToMemory(
          content, 
          JSON.stringify({ memories: userContext.memories, notes: userContext.notes })
        );

        if (memoryAnalysis.shouldCommit && memoryAnalysis.memoryContent) {
          const { error: memoryError } = await supabase.from('memory').insert([{
            user_id: userId,
            content: memoryAnalysis.memoryContent
          }]);
          if (memoryError) app.log.error('Failed to auto-commit to memory:', memoryError);
        }
      }
    }

    reply.raw.end();

  } catch (error: any) {
    app.log.error(error);
    if (!reply.sent) {
      reply.code(500).send({ error: error.message });
    }
  }
});

app.get('/chat/history/:sessionId', async (request, reply) => {
  const userId = request.user.id;
  const { sessionId } = request.params as { sessionId: string };
  
  try {
    // Handle special case for 'default' session
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
    app.log.error('Chat history error:', error);
    reply.code(500).send({ error: error.message });
  }
});

app.post('/chat/upload', async (request, reply) => {
  const userId = request.user.id;
  const data = await request.file();
  if (!data) {
    return reply.code(400).send({ error: 'No file uploaded.' });
  }

  const filename = data.filename;
  const mimetype = data.mimetype;
  const buffer = await data.toBuffer();

  try {
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('user_uploads')
      .upload(`${userId}/${filename}`, buffer, {
        contentType: mimetype,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const fileUrl = `${supabaseUrl}/storage/v1/object/public/user_uploads/${userId}/${filename}`;

    // Store file metadata in user_files table
    const { data: fileMetadata, error: fileMetadataError } = await supabase.from('user_files').insert([
      {
        user_id: userId,
        filename: filename,
        file_type: mimetype,
        file_url: fileUrl,
        file_size: buffer.length,
      },
    ]).select();

    if (fileMetadataError) throw fileMetadataError;

    const fileId = fileMetadata && fileMetadata.length > 0 ? fileMetadata[0].id : null;
    reply.code(201).send({ fileUrl, fileId });
  } catch (error: any) {
    app.log.error('File upload error:', error);
    reply.code(500).send({ error: error.message });
  }
});

app.get('/chat/sessions', async (request, reply) => {
  const userId = request.user.id;
  try {
    // Get sessions with their metadata and latest message info
    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select(`
        id,
        name,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Get message counts for each session
    const sessionsWithCounts = await Promise.all(
      sessions.map(async (session: any) => {
        const { data: messageCount, error: countError } = await supabase
          .from('chat_history')
          .select('id', { count: 'exact' })
          .eq('session_id', session.id)
          .eq('user_id', userId);

        return {
          ...session,
          message_count: countError ? 0 : (messageCount?.length || 0)
        };
      })
    );

    reply.code(200).send(sessionsWithCounts);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

// Update chat session name/title
app.patch('/chat/sessions/:sessionId', async (request, reply) => {
  const userId = request.user.id;
  const { sessionId } = request.params as { sessionId: string };
  const { name } = request.body as { name: string };

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
    reply.code(500).send({ error: error.message });
  }
});

// Delete chat session and all its messages
app.delete('/chat/sessions/:sessionId', async (request, reply) => {
  const userId = request.user.id;
  const { sessionId } = request.params as { sessionId: string };

  try {
    // Delete all chat history for this session first
    const { error: historyError } = await supabase
      .from('chat_history')
      .delete()
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (historyError) throw historyError;

    // Delete the session itself
    const { error: sessionError } = await supabase
      .from('chat_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (sessionError) throw sessionError;

    reply.code(204).send();
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

app.post('/chat/image/generate', async (request, reply) => {
  const { model, prompt } = request.body as { model: string; prompt: string };
  try {
    reply.code(200).send({ message: `Image generation endpoint (placeholder for model: ${model}, prompt: ${prompt})` });
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

// 3. AI Model Registry
app.get('/models', async (request, reply) => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${openRouterApiKey}` },
    });
    const data: any = await response.json();
    
    const formattedModels = data.data.map((model: any) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      created: model.created,
      architecture: model.architecture,
      top_provider: model.top_provider,
      pricing: model.pricing,
      context_length: model.context_length,
      supported_parameters: model.supported_parameters || [],
      per_request_limits: model.per_request_limits || {}
    }));
    
    reply.code(200).send({ data: formattedModels });
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

// 4. Export APIs - Creation (Enhanced with new secure system)
app.post('/export/context', async (request, reply) => {
  const userId = request.user.id;
  const { modelsToExpose, include_memories = false, include_notes = false } = request.body as { 
    modelsToExpose: string[];
    include_memories?: boolean;
    include_notes?: boolean;
  };
  
  try {
    // Import encryption utility
    const { EncryptionUtils } = await import('./src/utils/encryption');
    
    // Generate API key using new secure method
    const apiKey = EncryptionUtils.generateApiKey();
    const hashedKey = EncryptionUtils.hashApiKey(apiKey);

    // Create exported API record with new schema
    const { data: exportedApi, error } = await supabase
      .from('exported_apis')
      .insert({
        user_id: userId,
        name: `Context API - ${new Date().toISOString().split('T')[0]}`,
        description: 'Auto-generated context API',
        api_key_hash: hashedKey,
        export_type: 'context',
        base_model: modelsToExpose[0] || 'openai/gpt-4',
        allowed_models: modelsToExpose,
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
      apiUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/api/exported/context/v1/chat/completions`,
      type: 'context',
      id: exportedApi.id
    });
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

app.post('/export/session/:sessionId', async (request, reply) => {
  const userId = request.user.id;
  const { sessionId } = request.params as { sessionId: string };
  const { modelsToExpose, include_memories = false, include_notes = false } = request.body as { 
    modelsToExpose: string[];
    include_memories?: boolean;
    include_notes?: boolean;
  };
  
  try {
    // Verify user owns the session by checking chat_history
    const { data: sessionData, error: sessionError } = await supabase
      .from('chat_history')
      .select('session_id')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .limit(1);

    if (sessionError || !sessionData || sessionData.length === 0) {
      return reply.status(400).send({ error: 'Session not found or not owned by user' });
    }

    // Import encryption utility
    const { EncryptionUtils } = await import('./src/utils/encryption');
    
    // Generate API key using new secure method
    const apiKey = EncryptionUtils.generateApiKey();
    const hashedKey = EncryptionUtils.hashApiKey(apiKey);

    // Create exported API record with new schema
    const { data: exportedApi, error } = await supabase
      .from('exported_apis')
      .insert({
        user_id: userId,
        name: `Session API - ${sessionId.substring(0, 8)}`,
        description: 'Auto-generated session API',
        api_key_hash: hashedKey,
        export_type: 'session',
        session_id: sessionId,
        base_model: modelsToExpose[0] || 'openai/gpt-4',
        allowed_models: modelsToExpose,
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
      apiUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/api/exported/session/v1/chat/completions`,
      type: 'session',
      sessionId: sessionId,
      id: exportedApi.id
    });
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});


app.post('/export/session/current', async (request, reply) => {
  const userId = request.user.id;
  const { sessionId, modelsToExpose, include_memories = false, include_notes = false } = request.body as { 
    sessionId: string; 
    modelsToExpose: string[];
    include_memories?: boolean;
    include_notes?: boolean;
  };
  
  if (!sessionId) {
    return reply.status(400).send({ error: 'sessionId is required in request body' });
  }
  
  try {
    // Verify user owns the session by checking chat_history
    const { data: sessionData, error: sessionError } = await supabase
      .from('chat_history')
      .select('session_id')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .limit(1);

    if (sessionError || !sessionData || sessionData.length === 0) {
      return reply.status(400).send({ error: 'Session not found or not owned by user' });
    }

    // Import encryption utility
    const { EncryptionUtils } = await import('./src/utils/encryption');
    
    // Generate API key using new secure method
    const apiKey = EncryptionUtils.generateApiKey();
    const hashedKey = EncryptionUtils.hashApiKey(apiKey);

    // Create exported API record with new schema
    const { data: exportedApi, error } = await supabase
      .from('exported_apis')
      .insert({
        user_id: userId,
        name: `Session API - ${sessionId.substring(0, 8)}`,
        description: 'Auto-generated session API',
        api_key_hash: hashedKey,
        export_type: 'session',
        session_id: sessionId,
        base_model: modelsToExpose[0] || 'openai/gpt-4',
        allowed_models: modelsToExpose,
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
      apiUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/api/exported/session/v1/chat/completions`,
      type: 'session',
      sessionId: sessionId,
      id: exportedApi.id
    });
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

app.get('/export/usage/:apiKey', async (request, reply) => {
  const { apiKey } = request.params as { apiKey: string };
  try {
    // Import encryption utility
    const { EncryptionUtils } = await import('./src/utils/encryption');
    const hashedKey = EncryptionUtils.hashApiKey(apiKey);
    
    const { data, error } = await supabase.from('api_usage').select('*').eq('api_key_hash', hashedKey);
    if (error) throw error;
    reply.code(200).send(data);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

// 5. EXPORTED API CONSUMPTION ROUTES - These are the main new routes for third-party integration
app.post('/api/exported/context/:apiKey/chat/completions', async (request, reply) => {
  const { apiKey } = request.params as { apiKey: string };
  const { model, messages, stream, temperature, max_tokens, top_p, frequency_penalty, presence_penalty } = request.body as {
    model: string;
    messages: any[];
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
  };

  const startTime = Date.now();

  try {
    // Verify API key and get export data
    const exportData = await verifyExportedApiKey(apiKey, 'context');
    
    // Check if the requested model is allowed
    if (!exportData.allowed_models || !exportData.allowed_models.includes(model)) {
      return reply.code(403).send({
        error: 'Model not allowed',
        message: `Model ${model} is not in the allowed models list for this API key`
      });
    }

    // Get user context from the database (real-time data)
    const userContext = await getUserContext(exportData.user_id);

    // Build context-aware messages with export configuration
    const contextAwareMessages = buildContextAwareMessages(
      userContext, 
      [], 
      { role: 'user', content: messages }, 
      exportData
    );

    // Prepare request body for OpenRouter
    const openRouterBody: any = {
      model,
      messages: contextAwareMessages,
      stream: stream || false
    };

    // Add optional parameters if provided
    if (temperature !== undefined) openRouterBody.temperature = temperature;
    if (max_tokens !== undefined) openRouterBody.max_tokens = max_tokens;
    if (top_p !== undefined) openRouterBody.top_p = top_p;
    if (frequency_penalty !== undefined) openRouterBody.frequency_penalty = frequency_penalty;
    if (presence_penalty !== undefined) openRouterBody.presence_penalty = presence_penalty;

    // Call OpenRouter API
    const openRouterResponse = await callOpenRouter(model, contextAwareMessages, stream || false);

    // Handle streaming response
    if (stream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });

      const reader = openRouterResponse.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const lineEnd = buffer.indexOf('\n');
          if (lineEnd === -1) break;

          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);

          if (line.startsWith('data: ')) {
            reply.raw.write(line + '\n\n');
            if (line === 'data: [DONE]') {
              break;
            }
          }
        }
      }

      reply.raw.end();
    } else {
      // Handle non-streaming response
      const responseData = await openRouterResponse.json();
      reply.code(200).send(responseData);
    }

    // Log API usage
    const responseTime = Date.now() - startTime;
    await logApiUsage(apiKey, exportData.user_id, '/api/exported/context/chat/completions', model, 0, 0, responseTime);

  } catch (error: any) {
    app.log.error('Context API error:', error);
    if (!reply.sent) {
      reply.code(500).send({ error: error.message });
    }
  }
});

app.post('/api/exported/session/:apiKey/chat/completions', async (request, reply) => {
  const { apiKey } = request.params as { apiKey: string };
  const { model, messages, stream, temperature, max_tokens, top_p, frequency_penalty, presence_penalty } = request.body as {
    model: string;
    messages: any[];
    stream?: boolean;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
  };

  const startTime = Date.now();

  try {
    // Verify API key and get export data
    const exportData = await verifyExportedApiKey(apiKey, 'session');
    
    // Check if the requested model is allowed
    if (!exportData.allowed_models || !exportData.allowed_models.includes(model)) {
      return reply.code(403).send({
        error: 'Model not allowed',
        message: `Model ${model} is not in the allowed models list for this API key`
      });
    }

    // Get session history from the database (real-time data)
    const { data: sessionHistory, error: historyError } = await supabase
      .from('chat_history')
      .select('content, role')
      .eq('session_id', exportData.session_id)
      .eq('user_id', exportData.user_id)
      .order('created_at', { ascending: true });

    if (historyError) throw historyError;
    
    // Get the original user's context for system prompt
    const userContext = await getUserContext(exportData.user_id);

    // Build messages array with session history + new messages, respecting export config
    let allMessages = [
      { role: 'system', content: userContext.systemPrompt }
    ];

    // Add context based on export configuration
    if (exportData.include_memories && userContext.memories.length > 0) {
      let contextContent = '\n\nRelevant memories about the user:\n';
      userContext.memories.forEach((memory: any, index: number) => {
        contextContent += `${index + 1}. ${memory.content}\n`;
      });
      
      allMessages.push({
        role: 'system',
        content: `Additional context:${contextContent}\n\nUse this context to provide more personalized responses.`
      });
    }

    if (exportData.include_notes && userContext.notes.length > 0) {
      let notesContent = '\n\nUser\'s notes:\n';
      userContext.notes.forEach((note: any, index: number) => {
        notesContent += `${index + 1}. ${note.content}\n`;
      });
      
      allMessages.push({
        role: 'system',
        content: `User's notes:${notesContent}\n\nReference these notes when relevant.`
      });
    }

    // Add session history and new messages
    allMessages = [
      ...allMessages,
      ...(sessionHistory || []).map((msg: any) => ({ role: msg.role, content: msg.content })),
      ...messages
    ];

    // Prepare request body for OpenRouter
    const openRouterBody: any = {
      model,
      messages: allMessages,
      stream: stream || false
    };

    // Add optional parameters if provided
    if (temperature !== undefined) openRouterBody.temperature = temperature;
    if (max_tokens !== undefined) openRouterBody.max_tokens = max_tokens;
    if (top_p !== undefined) openRouterBody.top_p = top_p;
    if (frequency_penalty !== undefined) openRouterBody.frequency_penalty = frequency_penalty;
    if (presence_penalty !== undefined) openRouterBody.presence_penalty = presence_penalty;

    // Call OpenRouter API
    const openRouterResponse = await callOpenRouter(model, allMessages, stream || false);

    // Handle streaming response
    if (stream) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });

      const reader = openRouterResponse.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (true) {
          const lineEnd = buffer.indexOf('\n');
          if (lineEnd === -1) break;

          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);

          if (line.startsWith('data: ')) {
            reply.raw.write(line + '\n\n');
            if (line === 'data: [DONE]') {
              break;
            }
          }
        }
      }

      reply.raw.end();
    } else {
      // Handle non-streaming response
      const responseData = await openRouterResponse.json();
      reply.code(200).send(responseData);
    }

    // Log API usage
    const responseTime = Date.now() - startTime;
    await logApiUsage(apiKey, exportData.user_id, '/api/exported/session/chat/completions', model, 0, 0, responseTime);

  } catch (error: any) {
    app.log.error('Session API error:', error);
    if (!reply.sent) {
      reply.code(500).send({ error: error.message });
    }
  }
});

// 6. Dashboard
app.get('/dashboard/apps', async (request, reply) => {
  const userId = request.user.id;
  try {
    const { data, error } = await supabase.from('apps_connected').select('*').eq('user_id', userId);
    if (error) throw error;
    reply.code(200).send(data);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

app.get('/dashboard/usage', async (request, reply) => {
  const userId = request.user.id;
  try {
    const { data, error } = await supabase.from('api_usage').select('*').eq('user_id', userId);
    if (error) throw error;
    reply.code(200).send(data);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

app.get('/dashboard/tokens', async (request, reply) => {
  const userId = request.user.id;
  try {
    const { data, error } = await supabase.from('token_logs').select('*').eq('user_id', userId);
    if (error) throw error;
    reply.code(200).send(data);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

// 7. OAuth & Developer Support
app.post('/oauth/token', async (request, reply) => {
  const { email, password } = request.body as { email: string; password: string };
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    reply.code(200).send({ 
      accessToken: data.session?.access_token, 
      refreshToken: data.session?.refresh_token 
    });
  } catch (error: any) {
    reply.code(401).send({ error: 'Authentication failed', message: error.message });
  }
});

app.get('/developers/me/projects', async (request, reply) => {
  const userId = request.user.id;
  try {
    const { data, error } = await supabase.from('developer_projects').select('*').eq('user_id', userId);
    if (error) throw error;
    reply.code(200).send(data);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

app.post('/developers/projects/:id/usage', async (request, reply) => {
  const userId = request.user.id;
  const { id } = request.params as { id: string };
  const { tokensUsed, requestsMade } = request.body as { tokensUsed: number; requestsMade: number };
  try {
    const { data: project, error: projectError } = await supabase.from('developer_projects').select('id').eq('id', id).eq('user_id', userId).single();
    if (projectError || !project) throw new Error('Project not found or not owned by user.');

    const { data, error } = await supabase.from('developer_project_usage').insert([{ 
      project_id: id, 
      tokens_used: tokensUsed, 
      requests_made: requestsMade 
    }]).select();
    if (error) throw error;
    reply.code(201).send(data);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

app.get('/developers/stats', async (request, reply) => {
  const userId = request.user.id;
  try {
    const { data, error } = await supabase.from('developer_stats').select('*').eq('user_id', userId);
    if (error) throw error;
    reply.code(200).send(data);
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

// Register new exported API routes
app.register(exportedApiRoutes);
app.register(adminExportedApiRoutes);

// Start the server
const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    app.log.info('Server listening on http://localhost:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();