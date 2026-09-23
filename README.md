# THRYVE Backend

THRYVE Backend is the TypeScript API layer behind an AI-powered workspace for conversations, memory, developer integrations, model access, usage tracking, subscriptions, and payments.

The project is built around a simple idea: AI should feel useful over time, not stateless. THRYVE combines streaming conversations with user-owned memories, notes, session history, model controls, usage visibility, and a billing system that connects paid access to OpenRouter credit limits.

This repository contains the backend services that make that experience possible.

## What the backend provides

- Authenticated AI chat with streaming responses
- Persistent chat sessions and conversation history
- User memories and notes that can be selected as relevant context
- Automatic memory extraction with duplicate protection
- Multimodal chat support through text and uploaded files
- OpenRouter model access and per-user API key provisioning
- Subscription plans, credit top-ups, billing dashboards, and transaction history
- Flutterwave payment initialization, verification, and webhook processing
- Developer OAuth token exchange and project usage tracking
- OpenAI-compatible exported APIs for context-aware and session-aware integrations
- Model access controls based on API configuration and subscription plans
- API usage analytics, token tracking, response-time logging, and administrative controls

## Architecture at a glance

THRYVE follows a modular service-oriented backend structure inside a single TypeScript application. It is not a large distributed system, but the boundaries between HTTP routes, domain services, middleware, persistence, and third-party integrations are intentionally clear.

```text
Client applications
        |
        v
Fastify HTTP API
        |
        +--> Authentication and request middleware
        |       - Supabase JWT validation
        |       - API key verification
        |       - Rate and credit checks
        |       - Model access control
        |
        +--> Route modules
        |       - Chat and sessions
        |       - User memory and notes
        |       - Models and developer APIs
        |       - Payments and subscriptions
        |       - Dashboard, analytics, and administration
        |
        +--> Application services
        |       - AI context and memory orchestration
        |       - OpenRouter account and credit management
        |       - Flutterwave payment processing
        |       - Currency conversion and API usage logging
        |
        +--> Supabase
                - Authentication
                - PostgreSQL data access
                - Storage for user uploads
                - User-scoped application data
```

## Technology choices

### TypeScript

The backend is written entirely in TypeScript. Strict compiler settings are enabled so that route contracts, service inputs, and shared domain objects are checked during development rather than discovered later in production.

### Fastify

Fastify provides the HTTP foundation. It keeps the server lightweight while supporting plugins for JWT authentication, CORS, multipart uploads, rate limiting, and request lifecycle hooks.

### Supabase

Supabase is used as the backend data platform for authentication, PostgreSQL access, and file storage. The application keeps user-owned data scoped by authenticated user IDs and consistently includes ownership filters in database queries.

### OpenRouter

OpenRouter is the model gateway for chat completions. THRYVE adds a management layer around it so that every user can have controlled model access, credit limits, usage synchronization, and plan-aware permissions.

### Google Gemini

Gemini is used for supporting AI workflows around the conversation itself, including selecting relevant memories and notes, generating session titles, and deciding when a conversation contains information worth committing to long-term memory.

### Flutterwave

Flutterwave handles payment initiation and verification. The payment flow supports both subscriptions and credit top-ups, with webhook processing used to reconcile provider events with local transaction records.

## Core request flows

### AI chat flow

A chat request passes through several deliberate stages:

1. The authenticated user and requested model are identified.
2. The request is mapped to a real session when the default session is used.
3. The user's system prompt, memories, and notes are loaded from Supabase.
4. Gemini helps select only the context relevant to the current message.
5. Existing session history is combined with the selected context.
6. The user's credit balance and model permissions are checked before provider usage.
7. The request is sent to OpenRouter using the user's managed API key.
8. The response is streamed back to the client using Server-Sent Events.
9. The conversation is saved and token usage is recorded.
10. A follow-up AI analysis can commit useful information to memory while avoiding duplicates.

This design keeps the user experience responsive while still preserving the data needed for continuity, analytics, and billing.

### Payment and credit flow

Subscriptions and top-ups follow a provider-aware workflow:

1. The API validates the requested plan, currency, amount, and user identity.
2. Flutterwave payment data is created using the user's local currency where supported.
3. The transaction reference is stored locally before the payment is completed.
4. The payment is verified directly with Flutterwave.
5. Webhooks are checked using the configured Flutterwave signature.
6. The local transaction is marked complete only after successful verification.
7. Subscription status or user credits are updated in Supabase.
8. The user's OpenRouter key limit is created or synchronized with the new balance.
9. Credit transactions and usage data remain available for dashboards and support operations.

The local database is treated as the source of application state, while provider responses are retained in transaction metadata for traceability.

### Exported API flow

THRYVE can expose context-aware and session-aware AI APIs to external applications. These APIs use hashed API keys, active/expired key checks, model restrictions, usage logging, and plan-level access checks before forwarding compatible chat completion requests to OpenRouter.

The exported API surface is intentionally close to the OpenAI chat-completions shape, which makes it easier for developers to integrate THRYVE into existing tools without building a completely new client abstraction.

## Repository structure

```text
.
├── server.ts                 # Application bootstrap and plugin registration
├── src/
│   ├── routes/               # HTTP route modules grouped by capability
│   ├── lib/                  # AI, payments, context, usage, and provider services
│   ├── middleware/            # Authentication, credits, rate, and model policies
│   ├── utils/                 # Shared helpers such as encryption utilities
│   └── types/                 # TypeScript declarations for external services
├── package.json              # Scripts and runtime dependencies
├── tsconfig.json             # Strict TypeScript compiler configuration
├── PAYMENT_SYSTEM_SETUP.md   # Payment and OpenRouter setup notes
├── payment.md                # Flutterwave payment reference material
└── paymentapi.md             # Additional payment API reference material
```

## Engineering principles

### Clear responsibility boundaries

Routes handle HTTP concerns and coordinate work. Reusable logic lives in services and libraries such as the AI helpers, context builder, payment service, currency converter, and OpenRouter manager. This makes provider-specific behavior easier to change without rewriting every route.

### Provider abstraction

The application does not couple every feature directly to a third-party SDK. OpenRouter and Flutterwave interactions are concentrated in dedicated services, while the rest of the application works with application-level concepts such as credits, subscriptions, transactions, model access, and user context.

### User-scoped data access

Most data operations are explicitly scoped by the authenticated user ID. This is important for conversations, memories, notes, uploaded files, subscriptions, credits, transactions, and usage records. Supabase policies should complement these application-level checks in each deployed environment.

### Fail safely around external systems

External providers can fail independently of the local application. Payment verification, credit synchronization, webhook handling, and OpenRouter key management therefore include structured error paths and logging. When a provider action cannot be completed immediately, the code preserves enough state for later diagnosis or manual recovery instead of silently losing the operation.

### Observable application behavior

Fastify logging is used throughout the request and provider flows. Important operations include user and transaction identifiers, model decisions, credit checks, provider synchronization, response timing, and failure details. Sensitive credentials and raw API keys are not intended to be exposed in responses.

### Compatibility where it matters

The exported API uses familiar chat-completion conventions, including streaming, generation parameters, tools, response formats, reasoning flags, and model discovery. This lowers the integration cost for developers who already understand OpenAI-compatible APIs.

## Security model

The backend expects secrets and service credentials to be provided through environment variables rather than committed source files. Authentication is based on Supabase-issued JWTs, while exported integrations use hashed API keys and active/expiry checks.

Security-sensitive areas include:

- JWT validation for authenticated application routes
- Separate API-key verification for exported developer APIs
- Model authorization before provider calls
- Credit checks before paid model usage
- Flutterwave webhook signature verification
- Ownership checks when reading or mutating user data
- Encryption and hashing helpers for sensitive API credentials
- Rate limiting and CORS configuration at the Fastify layer

For production, database row-level security, least-privilege service credentials, strict CORS origins, secure webhook configuration, and secret rotation should be enabled and reviewed as part of deployment operations.

## Getting started

### Requirements

- Node.js 18.x
- npm
- A Supabase project
- An OpenRouter account and API credentials
- A Google Gemini API key
- Flutterwave credentials if payment features are enabled

### Install dependencies

```bash
npm install
```

### Configure environment variables

Create a `.env` file in the project root. At minimum, the server expects the following values:

```env
SUPABASE_URL="your-supabase-url"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_JWT_SECRET="your-supabase-jwt-secret"
OPENROUTER_API_KEY="your-openrouter-api-key"
OPENROUTER_PROVISIONING_KEY="your-openrouter-provisioning-key"
GEMINI_API_KEY="your-gemini-api-key"
BASE_URL="http://localhost:3000"

# Required when payment features are enabled
FLW_PUBLIC_KEY="your-flutterwave-public-key"
FLW_SECRET_KEY="your-flutterwave-secret-key"
FLW_WEBHOOK_SECRET="your-flutterwave-webhook-secret"
```

The server validates the core AI and database configuration during startup. Flutterwave configuration is treated separately, so payment features can be disabled while the rest of the API is developed.

### Run in development

```bash
npm run dev
```

The development command runs `server.ts` through `ts-node`.

### Build for production

```bash
npm run build
npm start
```

The TypeScript compiler outputs JavaScript to `dist/`, and the production command starts `dist/server.js`.

## API areas

The exact route surface continues to evolve with the product, but the backend is organized around these areas:

| Area | Purpose |
| --- | --- |
| `/chat/*` | Streaming chat, sessions, history, and file uploads |
| `/memory` and `/notes` | User-managed long-term context |
| `/api/payment/*` | Plans, subscriptions, top-ups, verification, webhooks, and billing |
| Developer routes | OAuth tokens, projects, and developer usage |
| Exported API routes | External context/session chat integrations |
| Dashboard and analytics routes | Usage, connected apps, billing, and reporting |
| Admin routes | Operational controls for users, credits, models, and OpenRouter keys |

All authenticated endpoints require the appropriate bearer token. Exported APIs use their own API-key flow and should be treated separately from application-user authentication.

## Testing and quality notes

The repository is configured for strict TypeScript compilation and includes a build step that should be run before deployment:

```bash
npm run build
```

At the moment, `npm test` is still a placeholder and exits with an error because an automated test suite has not yet been wired into the package scripts. Adding route, service, payment-webhook, credit-accounting, and provider-mocking tests would be a valuable next step as the system grows.

## Operational considerations

- Keep service-role keys and provider credentials out of source control.
- Use Flutterwave test credentials while validating payment flows.
- Configure the Flutterwave webhook URL for each deployed environment.
- Monitor failed OpenRouter synchronizations because local credit state and provider limits must remain aligned.
- Review payment and credit reconciliation logs regularly.
- Configure Supabase storage policies for the `user_uploads` bucket.
- Add database indexes for user-scoped history, usage, transactions, and session queries as data volume grows.
- Consider background jobs for retries, reconciliation, and long-running provider operations.
- Add automated tests before making changes to payment accounting or access-control logic.

## Why this architecture works

THRYVE is designed as a product backend rather than a thin proxy around an AI provider. It brings together conversation state, personal context, model access, usage accounting, billing, and developer access in one consistent application model.

The architecture is strong because each major concern has a clear home:

- Fastify handles transport and request lifecycle concerns.
- Middleware enforces cross-cutting policies before expensive provider calls.
- Route modules organize product capabilities.
- Services isolate integrations and business workflows.
- Supabase provides a practical foundation for auth, relational data, and storage.
- AI is used not only to generate responses, but also to improve context selection and memory quality.
- Usage and payment records make the system observable and commercially usable.

That combination gives the project room to grow without losing the human part of the product: conversations should become more useful, integrations should be understandable, and users should be able to see and control how their AI access is being used.

## Contributing

When contributing, keep new functionality close to the route or service that owns it, avoid leaking provider-specific details into unrelated modules, preserve user ownership checks, and add logging around important external operations. Run the TypeScript build before opening a pull request and include any required environment or database changes in the documentation.

## License

No project license has been declared yet. Until a license is added to the repository, usage and redistribution rights should be treated as reserved by the project owner.
