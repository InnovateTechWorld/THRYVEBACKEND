import 'dotenv/config';
import fastify, { FastifyInstance, FastifyRequest, FastifyReply, FastifyBaseLogger } from 'fastify';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { modelAccessMiddleware } from './src/middleware/modelAccessMiddleware';
import { OpenRouterManager } from './src/lib/openRouterManager';
import { registerCreditCheckMiddleware } from './src/middleware/creditCheckMiddleware';

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
import paymentRoutes from './src/routes/payment';
import defaultModelRoutes from './src/routes/defaultModel';



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

// Payment service environment variables
const flwPublicKey = process.env.FLW_PUBLIC_KEY as string;
const flwSecretKey = process.env.FLW_SECRET_KEY as string;
const flwWebhookSecret = process.env.FLW_WEBHOOK_SECRET as string;
const openRouterProvisioningKey = process.env.OPENROUTER_PROVISIONING_KEY as string;

if (!supabaseUrl || !supabaseServiceKey || !supabaseJwtSecret || !geminiApiKey || !openRouterProvisioningKey) {
  app.log.error('Missing critical environment variables.');
  process.exit(1);
}

if (!flwPublicKey || !flwSecretKey || !flwWebhookSecret) {
  app.log.warn('Flutterwave environment variables missing. Payment features will be disabled.');
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'apikey', 'x-api-key', 'x-flutterwave-signature'],
  exposedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID'],
  preflightContinue: false,
  optionsSuccessStatus: 204
});


app.get('/', async (request, reply) => {
  return {
    status: 'healthy',
    service: 'Thryve Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
});

// Health check endpoint
app.get('/health', async (request, reply) => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version,
    environment: process.env.NODE_ENV || 'development'
  };
});

app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
  const noAuthRoutes = [
        '/', // ✅ Add root route
    '/health', // ✅ Add health check

    '/oauth/token',
    '/api/payment/webhook', // Flutterwave webhook doesn't need auth
  ];

  // Allow all exported API endpoints without auth
  if (
    // New Bearer token endpoints
    request.url.startsWith('/api/exported/context/v1/') ||
    request.url.startsWith('/api/exported/session/v1/') ||
    request.url === '/api/exported/v1/models' ||

    // Legacy path-based endpoints
    request.url.startsWith('/api/exported/context/') ||
    request.url.startsWith('/api/exported/session/') ||

    // Models endpoints (both styles)
    request.url.match(/\/api\/exported\/(context|session)\/sk-[a-f0-9]+\/models$/) ||
    request.url.match(/\/api\/exported\/v1\/models$/) ||

    // Chat completions endpoints
    request.url.match(/\/api\/exported\/(context|session)\/sk-[a-f0-9]+\/chat\/completions$/) ||
    request.url.match(/\/api\/exported\/(context|session)\/v1\/chat\/completions$/)
  ) {
    return; // Skip auth for exported API endpoints
  }

  // Legacy parameter-based routes
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



// Initialize OpenRouter manager
const openRouterManager = new OpenRouterManager(openRouterProvisioningKey);

// Register credit check middleware first
registerCreditCheckMiddleware(app, {
  supabase,
  openRouterProvisioningKey
});

// Register model access control middleware
app.register(async (fastify) => {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.match(/\/chat\/completions$/)) {
      return;
    }
    const handler = await modelAccessMiddleware(openRouterManager, supabase, fastify.log);
    return handler(request as any, reply);
  });
});


app.register(defaultModelRoutes, { supabase });
app.register(userContextRoutes, { prefix: '/', supabase });
app.register(chatRoutes, { prefix: '/', supabase, genAI, openRouterProvisioningKey });
app.register(modelRoutes, { prefix: '/', openRouterProvisioningKey, supabase });
app.register(apiManagementRoutes, { prefix: '/', supabase, genAI, appBaseUrl, openRouterProvisioningKey });
app.register(dashboardRoutes, { prefix: '/', supabase });
app.register(developerRoutes, { prefix: '/', supabase });
app.register(adminApiManagementRoutes, { prefix: '/api/admin', supabase, openRouterProvisioningKey });
app.register(analyticsRoutes, { prefix: '/', supabase }); // Register analytics routes

// Register payment routes if payment services are configured
if (flwPublicKey && flwSecretKey && flwWebhookSecret) { // Check all Flutterwave keys
  app.register(paymentRoutes, { prefix: '/', supabase, openRouterProvisioningKey });
  app.log.info('Payment services enabled');
} else {
  app.log.warn('Payment services disabled due to missing configuration');
}

app.register(exportedApiRoutes, { supabase, genAI, openRouterProvisioningKey });


// Replace your current app.listen() with:

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    
    await app.listen({ 
      port, 
      host: '0.0.0.0'
    });
    
    console.log(`Server running on 0.0.0.0:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();