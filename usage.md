# Fast Backend AI App - API Usage Guide

This comprehensive guide covers all available API endpoints for frontend integration.

## 🔐 Authentication

All routes except `/oauth/token` and `/api/exported/*` require authentication via Supabase JWT token.

**Headers:**
```
Authorization: Bearer <supabase_jwt_token>
Content-Type: application/json
```

---

## 📝 1. User Memory & Notes Management

### Memory Management

#### Create Memory
```http
POST /memory
Content-Type: application/json
Authorization: Bearer <token>

{
  "content": "User prefers dark mode and uses React for frontend development"
}
```

**Response:**
```json
[{
  "id": "uuid",
  "user_id": "uuid", 
  "content": "User prefers dark mode and uses React for frontend development",
  "created_at": "2025-05-28T22:30:00Z",
  "updated_at": "2025-05-28T22:30:00Z"
}]
```

#### Get All Memories
```http
GET /memory
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "content": "User prefers dark mode",
    "created_at": "2025-05-28T22:30:00Z"
  }
]
```

#### Delete Memory
```http
DELETE /memory/{id}
Authorization: Bearer <token>
```

### Notes Management

#### Create Note
```http
POST /notes
Content-Type: application/json
Authorization: Bearer <token>

{
  "content": "Remember to implement dark mode toggle in next sprint"
}
```

#### Get All Notes
```http
GET /notes
Authorization: Bearer <token>
```

#### Delete Note
```http
DELETE /notes/{id}
Authorization: Bearer <token>
```

### System Prompt Management

#### Update System Prompt
```http
PATCH /system-prompt
Content-Type: application/json
Authorization: Bearer <token>

{
  "prompt": "You are a helpful coding assistant specialized in React and TypeScript"
}
```

---

## 💬 2. Chat System

### Send Chat Message
```http
POST /chat/message
Content-Type: application/json
Authorization: Bearer <token>

{
  "sessionId": "uuid-v4",
  "model": "openai/gpt-4",
  "content": "Help me debug this React component",
  "file_urls": ["https://example.com/image.png"] // optional
}
```

**Features:**
- ✅ Auto-generates session titles for first messages
- ✅ Includes user context (memories, notes, system prompt)
- ✅ Streaming response
- ✅ Auto-commits important info to memory
- ✅ Supports file attachments

**Response:** Server-Sent Events stream
```
data: {"content": "I'd be happy to help"}
data: {"content": " you debug your React"}
data: {"content": " component. Could you"}
data: [DONE]
```

### Get Chat History
```http
GET /chat/history/{sessionId}
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "content": "Help me debug this React component",
    "role": "user",
    "model_id": "openai/gpt-4",
    "file_urls": [],
    "created_at": "2025-05-28T22:30:00Z"
  },
  {
    "id": "uuid", 
    "content": "I'd be happy to help you debug...",
    "role": "assistant",
    "created_at": "2025-05-28T22:30:15Z"
  }
]
```

### File Upload
```http
POST /chat/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>

[file data]
```

**Response:**
```json
{
  "fileUrl": "https://supabase.co/storage/v1/object/public/user_uploads/user-id/filename.png",
  "fileId": "uuid"
}
```

### Session Management

#### Get All Chat Sessions
```http
GET /chat/sessions
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "React Debugging Help", // Auto-generated title
    "created_at": "2025-05-28T22:30:00Z",
    "updated_at": "2025-05-28T22:35:00Z",
    "message_count": 6
  }
]
```

#### Update Session Title
```http
PATCH /chat/sessions/{sessionId}
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "My Custom Session Title"
}
```

#### Delete Session
```http
DELETE /chat/sessions/{sessionId}
Authorization: Bearer <token>
```
*Deletes session and all associated messages*

---

## 🤖 3. AI Models

### Get Available Models
```http
GET /models
Authorization: Bearer <token>
```

**Response:**
```json
{
  "data": [
    {
      "id": "openai/gpt-4",
      "name": "GPT-4",
      "description": "Most capable GPT-4 model",
      "pricing": {
        "prompt": "0.00003",
        "completion": "0.00006"
      },
      "context_length": 8192
    }
  ]
}
```

---

## 🔧 4. API Export System

### Create Context API
```http
POST /export/context
Content-Type: application/json
Authorization: Bearer <token>

{
  "modelsToExpose": ["openai/gpt-4", "anthropic/claude-3-sonnet"]
}
```

**Response:**
```json
{
  "apiKey": "sk-abc123...",
  "apiUrl": "https://yourapp.com/api/exported/context/v1/chat/completions",
  "type": "context",
  "id": "uuid"
}
```

### Create Session API
```http
POST /export/session/{sessionId}
Content-Type: application/json
Authorization: Bearer <token>

{
  "modelsToExpose": ["openai/gpt-4"]
}
```

**Response:**
```json
{
  "apiKey": "sk-def456...",
  "apiUrl": "https://yourapp.com/api/exported/session/v1/chat/completions", 
  "type": "session",
  "sessionId": "uuid",
  "id": "uuid"
}
```

### Get API Usage
```http
GET /export/usage/{apiKey}
Authorization: Bearer <token>
```

---

## 🛠️ 5. Admin Exported API Management

### Create Exported API (Advanced)
```http
POST /api/admin/exported-apis
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "My Custom API",
  "description": "API for my React app",
  "export_type": "context", // or "session"
  "session_id": "uuid", // required if export_type is "session"
  "base_model": "openai/gpt-4",
  "allowed_models": ["openai/gpt-4", "anthropic/claude-3-sonnet"],
  "rate_limit": 100, // requests per minute
  "expires_at": "2025-12-31T23:59:59Z" // optional
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "My Custom API",
  "api_key": "sk-xyz789...", // Only returned once!
  "export_type": "context",
  "base_model": "openai/gpt-4",
  "allowed_models": ["openai/gpt-4", "anthropic/claude-3-sonnet"],
  "rate_limit": 100,
  "is_active": true,
  "created_at": "2025-05-28T22:30:00Z"
}
```

### Get All Exported APIs
```http
GET /api/admin/exported-apis
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "My Custom API",
    "description": "API for my React app",
    "export_type": "context",
    "base_model": "openai/gpt-4",
    "allowed_models": ["openai/gpt-4"],
    "rate_limit": 100,
    "is_active": true,
    "api_key_preview": "sk-abc12345...", // Masked
    "created_at": "2025-05-28T22:30:00Z",
    "chat_sessions": null // or session info if session type
  }
]
```

### Get Specific Exported API
```http
GET /api/admin/exported-apis/{id}
Authorization: Bearer <token>
```

### Update Exported API
```http
PUT /api/admin/exported-apis/{id}
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Updated API Name",
  "description": "Updated description",
  "rate_limit": 200,
  "is_active": false
}
```

### Delete Exported API
```http
DELETE /api/admin/exported-apis/{id}
Authorization: Bearer <token>
```

### Get API Usage Statistics
```http
GET /api/admin/exported-apis/{id}/usage?start_date=2025-05-01&end_date=2025-05-31&limit=100
Authorization: Bearer <token>
```

**Response:**
```json
{
  "summary": {
    "total_requests": 150,
    "total_tokens": 50000,
    "total_prompt_tokens": 30000,
    "total_completion_tokens": 20000,
    "models_used": ["openai/gpt-4", "anthropic/claude-3-sonnet"],
    "request_types": ["context_chat", "session_chat"]
  },
  "usage": [
    {
      "id": "uuid",
      "model_used": "openai/gpt-4",
      "prompt_tokens": 100,
      "completion_tokens": 50,
      "total_tokens": 150,
      "request_type": "context_chat",
      "created_at": "2025-05-28T22:30:00Z"
    }
  ]
}
```

### Regenerate API Key
```http
POST /api/admin/exported-apis/{id}/regenerate-key
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "uuid",
  "api_key": "sk-new123...", // New key returned once!
  "updated_at": "2025-05-28T22:30:00Z"
}
```

---

## 🌐 6. Exported API Usage (Third-Party Integration)

These endpoints are for third-party apps using your exported APIs.

### Context-Based Chat Completions
```http
POST /api/exported/context/v1/chat/completions
Content-Type: application/json
Authorization: Bearer <exported_api_key>

{
  "model": "openai/gpt-4", // or "base" for default
  "messages": [
    {
      "role": "user",
      "content": "Help me with React hooks"
    }
  ],
  "stream": true, // optional
  "temperature": 0.7, // optional
  "max_tokens": 1000 // optional
}
```

**Features:**
- ✅ Automatically includes user's memories, notes, and system prompt
- ✅ Rate limiting and API key validation
- ✅ Model restrictions based on API configuration
- ✅ Usage tracking

### Session-Based Chat Completions
```http
POST /api/exported/session/v1/chat/completions
Content-Type: application/json
Authorization: Bearer <exported_api_key>

{
  "model": "openai/gpt-4",
  "messages": [
    {
      "role": "user", 
      "content": "Continue our conversation"
    }
  ],
  "session_id": "optional-override" // uses API's session by default
}
```

**Features:**
- ✅ Automatically includes full session history
- ✅ Maintains conversation context

### Get Available Models
```http
GET /api/exported/v1/models
Authorization: Bearer <exported_api_key>
```

**Response:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "base",
      "name": "Base Model (openai/gpt-4)",
      "description": "Default model for this API: openai/gpt-4"
    },
    {
      "id": "openai/gpt-4",
      "name": "GPT-4",
      "description": "Most capable GPT-4 model"
    }
  ]
}
```

---

## 📊 7. Dashboard & Analytics

### Get Connected Apps
```http
GET /dashboard/apps
Authorization: Bearer <token>
```

### Get Usage Statistics
```http
GET /dashboard/usage
Authorization: Bearer <token>
```

### Get Token Logs
```http
GET /dashboard/tokens
Authorization: Bearer <token>
```

---

## 🔑 8. OAuth & Developer Support

### Get Access Token
```http
POST /oauth/token
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "refresh_token_here"
}
```

### Get Developer Projects
```http
GET /developers/me/projects
Authorization: Bearer <token>
```

### Log Project Usage
```http
POST /developers/projects/{id}/usage
Content-Type: application/json
Authorization: Bearer <token>

{
  "tokensUsed": 1500,
  "requestsMade": 10
}
```

### Get Developer Stats
```http
GET /developers/stats
Authorization: Bearer <token>
```

---

## 🚨 Error Handling

All endpoints return consistent error formats:

```json
{
  "error": "Error type",
  "message": "Detailed error description"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `204` - No Content (for deletes)
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Rate Limit Exceeded
- `500` - Internal Server Error

---

## 🎯 Frontend Integration Examples

### React Hook for Chat
```typescript
const useChat = (sessionId: string) => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (content: string, fileUrls?: string[]) => {
    setIsLoading(true);
    
    const response = await fetch('/chat/message', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        model: 'openai/gpt-4',
        content,
        file_urls: fileUrls
      })
    });

    // Handle streaming response
    const reader = response.body?.getReader();
    // ... streaming logic
  };

  return { messages, sendMessage, isLoading };
};
```

### Vue.js Exported API Integration
```javascript
// Using exported API in external Vue.js app
const chatWithExportedAPI = async (message) => {
  const response = await fetch('https://yourapp.com/api/exported/context/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${exportedApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'base', // Use default model
      messages: [{ role: 'user', content: message }],
      stream: false
    })
  });
  
  return response.json();
};
```

---

## 🔐 Security Notes

1. **API Keys**: Store exported API keys securely, never expose in frontend code
2. **Rate Limiting**: Respect rate limits (default 100 requests/minute)
3. **Token Expiry**: Handle JWT token expiration and refresh
4. **CORS**: Exported APIs include CORS headers for browser integration
5. **Data Privacy**: Exported APIs only expose data you've explicitly configured

---

This guide covers all available endpoints. The API is OpenAI-compatible for exported endpoints, making integration with existing AI applications seamless.