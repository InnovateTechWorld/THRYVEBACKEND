"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fastify_1 = __importDefault(require("fastify"));
const supabase_js_1 = require("@supabase/supabase-js");
const jwt_1 = __importDefault(require("@fastify/jwt"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const cors_1 = __importDefault(require("@fastify/cors"));
const generative_ai_1 = require("@google/generative-ai");
const modelAccessMiddleware_1 = require("./src/middleware/modelAccessMiddleware");
const openRouterManager_1 = require("./src/lib/openRouterManager");
const creditCheckMiddleware_1 = require("./src/middleware/creditCheckMiddleware");
// Import modularized routes
const exported_api_1 = require("./src/routes/exported-api");
const userContext_1 = __importDefault(require("./src/routes/userContext"));
const chat_1 = __importDefault(require("./src/routes/chat"));
const models_1 = __importDefault(require("./src/routes/models"));
const apiManagement_1 = __importDefault(require("./src/routes/apiManagement"));
const dashboard_1 = __importDefault(require("./src/routes/dashboard"));
const developer_1 = __importDefault(require("./src/routes/developer"));
const admin_1 = __importDefault(require("./src/routes/admin"));
const analytics_1 = __importDefault(require("./src/routes/analytics"));
const payment_1 = __importDefault(require("./src/routes/payment"));
const app = (0, fastify_1.default)({ logger: true });
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openRouterApiKey = process.env.OPENROUTER_API_KEY;
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;
const geminiApiKey = process.env.GEMINI_API_KEY;
const appBaseUrl = process.env.BASE_URL || 'http://localhost:3000';
// Payment service environment variables
const flwPublicKey = process.env.FLW_PUBLIC_KEY;
const flwSecretKey = process.env.FLW_SECRET_KEY;
const flwWebhookSecret = process.env.FLW_WEBHOOK_SECRET;
const openRouterProvisioningKey = process.env.OPENROUTER_PROVISIONING_KEY;
if (!supabaseUrl || !supabaseServiceKey || !supabaseJwtSecret || !geminiApiKey || !openRouterProvisioningKey) {
    app.log.error('Missing critical environment variables.');
    process.exit(1);
}
if (!flwPublicKey || !flwSecretKey || !flwWebhookSecret) {
    app.log.warn('Flutterwave environment variables missing. Payment features will be disabled.');
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey);
app.register(jwt_1.default, {
    secret: supabaseJwtSecret,
    decode: { complete: true }
});
app.register(multipart_1.default);
app.register(cors_1.default, {
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
app.addHook('preHandler', async (request, reply) => {
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
        request.url.match(/\/api\/exported\/(context|session)\/v1\/chat\/completions$/)) {
        return; // Skip auth for exported API endpoints
    }
    // Legacy parameter-based routes
    if ((request.url.startsWith('/api/exported/context/') || request.url.startsWith('/api/exported/session/')) &&
        request.params && request.params.apiKey) {
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
    }
    catch (error) {
        reply.code(401).send({ error: 'Unauthorized', message: error.message });
        return reply;
    }
});
// Initialize OpenRouter manager
const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
// Register credit check middleware first
(0, creditCheckMiddleware_1.registerCreditCheckMiddleware)(app, {
    supabase,
    openRouterProvisioningKey
});
// Register model access control middleware
app.register(async (fastify) => {
    fastify.addHook('preHandler', async (request, reply) => {
        if (!request.url.match(/\/chat\/completions$/)) {
            return;
        }
        const handler = await (0, modelAccessMiddleware_1.modelAccessMiddleware)(openRouterManager, supabase, fastify.log);
        return handler(request, reply);
    });
});
app.register(userContext_1.default, { prefix: '/', supabase });
app.register(chat_1.default, { prefix: '/', supabase, genAI, openRouterProvisioningKey });
app.register(models_1.default, { prefix: '/', openRouterProvisioningKey, supabase });
app.register(apiManagement_1.default, { prefix: '/', supabase, genAI, appBaseUrl, openRouterProvisioningKey });
app.register(dashboard_1.default, { prefix: '/', supabase });
app.register(developer_1.default, { prefix: '/', supabase });
app.register(admin_1.default, { prefix: '/api/admin', supabase, openRouterProvisioningKey });
app.register(analytics_1.default, { prefix: '/', supabase }); // Register analytics routes
// Register payment routes if payment services are configured
if (flwPublicKey && flwSecretKey && flwWebhookSecret) { // Check all Flutterwave keys
    app.register(payment_1.default, { prefix: '/', supabase, openRouterProvisioningKey });
    app.log.info('Payment services enabled');
}
else {
    app.log.warn('Payment services disabled due to missing configuration');
}
app.register(exported_api_1.exportedApiRoutes, { supabase, genAI, openRouterProvisioningKey });
// Replace your current app.listen() with:
const start = async () => {
    try {
        const port = Number(process.env.PORT) || 3000;
        await app.listen({
            port,
            host: '0.0.0.0'
        });
        console.log(`Server running on 0.0.0.0:${port}`);
    }
    catch (err) {
        console.error(err);
        process.exit(1);
    }
};
start();
