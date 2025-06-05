import 'dotenv/config';
import fastify, { FastifyInstance, FastifyRequest, FastifyReply, FastifyBaseLogger } from 'fastify';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import { GoogleGenerativeAI } from "@google/generative-ai";

// Import modularized routes
import { exportedApiRoutes } from './src/routes/exported-api'; 
import userContextRoutes from './src/routes/userContext';
import chatRoutes from './src/routes/chat';
import modelRoutes from './src/routes/models';
import apiManagementRoutes from './src/routes/apiManagement'; 
import dashboardRoutes from './src/routes/dashboard';
import developerRoutes from './src/routes/developer';
import adminApiManagementRoutes from './src/routes/admin';
import analyticsRoutes from './src/routes/analytics';


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

const app: FastifyInstance = fastify({ logger: true });

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string; 
const openRouterApiKey = process.env.OPENROUTER_API_KEY as string;
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET as string;
const geminiApiKey = process.env.GEMINI_API_KEY as string;
const appBaseUrl = process.env.BASE_URL || 'http://localhost:3000';

if (!supabaseUrl || !supabaseServiceKey || !openRouterApiKey || !supabaseJwtSecret || !geminiApiKey) {
  app.log.error('Missing critical environment variables.');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey);
const genAI = new GoogleGenerativeAI(geminiApiKey);

app.register(fastifyJwt, {
  secret: supabaseJwtSecret,
  decode: { complete: true } 
});

app.register(fastifyMultipart);

app.register(fastifyCors, {
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'apikey', 'x-api-key'], 
  exposedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'], 
  preflightContinue: false,
  optionsSuccessStatus: 204
});

app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
  const noAuthRoutes = [
    '/oauth/token', 
  ];

  // Allow all exported API endpoints without auth
  if (request.url.startsWith('/api/exported/context/v1/') ||
      request.url.startsWith('/api/exported/session/v1/') ||
      request.url.startsWith('/api/exported/v1/models') ||
      // Fix: Add these patterns to allow model endpoints
      request.url.match(/\/api\/exported\/(context|session)\/sk-[a-f0-9]+\/models$/) ||
      request.url.match(/\/api\/exported\/(context|session)\/sk-[a-f0-9]+\/chat\/completions$/)) {
    return; 
  }
  
  if ((request.url.startsWith('/api/exported/context/') || request.url.startsWith('/api/exported/session/')) &&
      request.params && (request.params as any).apiKey) {
      return; 
  }

  if (noAuthRoutes.includes(request.url)) {
    return;
  }

  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('No or invalid authorization token provided');
    }
    const token = authHeader.split(' ')[1];

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      app.log.warn({ msg: 'Auth error or no user from token', error });
      throw new Error('Invalid or expired token');
    }

    request.user = { id: user.id, email: user.email }; 
  } catch (error: any) {
    reply.code(401).send({ error: 'Unauthorized', message: error.message });
    return reply; 
  }
});


app.register(userContextRoutes, { prefix: '/', supabase });
app.register(chatRoutes, { prefix: '/', supabase, genAI, openRouterApiKey });
app.register(modelRoutes, { prefix: '/', openRouterApiKey });
app.register(apiManagementRoutes, { prefix: '/', supabase, genAI, openRouterApiKey, appBaseUrl });
app.register(dashboardRoutes, { prefix: '/', supabase });
app.register(developerRoutes, { prefix: '/', supabase }); 
app.register(adminApiManagementRoutes, { prefix: '/api/admin', supabase });
app.register(analyticsRoutes, { prefix: '/', supabase }); // Register analytics routes

app.register(exportedApiRoutes, { supabase, genAI, openRouterApiKey });


const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    app.log.info(`Server listening on ${appBaseUrl} (internally on port 3000, host 0.0.0.0)`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
