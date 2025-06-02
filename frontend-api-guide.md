# Fast Backend AI App - Complete Frontend API Guide

This comprehensive guide covers all API endpoints for frontend integration, focusing on creating and using exported APIs.

## 🔐 Authentication

All routes except `/oauth/token` and `/api/exported/*` require Supabase JWT authentication.

**Standard Headers:**
```http
Authorization: Bearer <supabase_jwt_token>
Content-Type: application/json
```

---

## 🚀 Quick Start - Create Your First API

### Step 1: Get Access Token
```http
POST /oauth/token
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your_password"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "refresh_token_string"
}
```

### Step 2: Create a Context API (Simple Method)
```http
POST /export/context
Authorization: Bearer <token>
Content-Type: application/json

{
  "modelsToExpose": ["openai/gpt-4", "anthropic/claude-3-sonnet"]
}
```

**Response:**
```json
{
  "apiKey": "sk-abc123def456...",
  "apiUrl": "http://localhost:3000/api/exported/context/v1/chat/completions",
  "type": "context",
  "id": "uuid"
}
```

### Step 3: Use Your API
```http
POST /api/exported/context/v1/chat/completions
Authorization: Bearer sk-abc123def456...
Content-Type: application/json

{
  "model": "openai/gpt-4",
  "messages": [
    {
      "role": "user",
      "content": "Hello! Remember my preferences from our previous conversations."
    }
  ],
  "stream": false
}
```

---

## 📋 1. Core App Features

### Memory Management
Store important user information that should be remembered across conversations.

#### Create Memory
```http
POST /memory
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "User prefers dark mode, works as a React developer, and likes concise explanations"
}
```

**Response:**
```json
[{
  "id": "uuid",
  "user_id": "uuid",
  "content": "User prefers dark mode, works as a React developer, and likes concise explanations",
  "created_at": "2025-05-29T12:30:00Z",
  "updated_at": "2025-05-29T12:30:00Z"
}]
```

#### Get All Memories
```http
GET /memory
Authorization: Bearer <token>
```

#### Delete Memory
```http
DELETE /memory/{id}
Authorization: Bearer <token>
```

### Notes Management
Quick notes that users can reference and include in AI conversations.

#### Create Note
```http
POST /notes
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Remember to implement pagination in the user dashboard"
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

### System Prompt Configuration
Customize the AI's behavior and personality.

```http
PATCH /system-prompt
Authorization: Bearer <token>
Content-Type: application/json

{
  "prompt": "You are a helpful React developer assistant. Always provide code examples and be concise."
}
```

---

## 💬 2. Chat System

### Send Chat Message
```http
POST /chat/message
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "uuid-v4-session-id",
  "model": "openai/gpt-4",
  "content": "Help me debug this React component",
  "file_urls": ["https://example.com/screenshot.png"] // optional
}
```

**Features:**
- ✅ Auto-generates session titles for first messages
- ✅ Includes user memories, notes, and system prompt automatically
- ✅ Streaming response (Server-Sent Events)
- ✅ Auto-commits important information to memory
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
    "created_at": "2025-05-29T12:30:00Z"
  },
  {
    "id": "uuid",
    "content": "I'd be happy to help you debug...",
    "role": "assistant",
    "created_at": "2025-05-29T12:30:15Z"
  }
]
```

### File Upload for Chat
```http
POST /chat/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

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

#### Get All Sessions
```http
GET /chat/sessions
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "React Component Debugging", // Auto-generated title
    "created_at": "2025-05-29T12:30:00Z",
    "updated_at": "2025-05-29T12:35:00Z",
    "message_count": 6
  }
]
```

#### Update Session Title
```http
PATCH /chat/sessions/{sessionId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Custom Session Title"
}
```

#### Delete Session
```http
DELETE /chat/sessions/{sessionId}
Authorization: Bearer <token>
```

---

## 🔧 3. API Creation & Management

### Simple API Creation (Quick Setup)

#### Create Context API
Shares user's memories, notes, and system prompt with every request.

```http
POST /export/context
Authorization: Bearer <token>
Content-Type: application/json

{
  "modelsToExpose": ["openai/gpt-4", "anthropic/claude-3-sonnet", "google/gemini-pro"]
}
```

**Response:**
```json
{
  "apiKey": "sk-abc123def456ghi789jkl012mno345pqr678stu901vwx234yzA567bcD890efG123",
  "apiUrl": "http://localhost:3000/api/exported/context/v1/chat/completions",
  "type": "context",
  "id": "uuid"
}
```

#### Create Session API
Shares a specific conversation history.

```http
POST /export/session/{sessionId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "modelsToExpose": ["openai/gpt-4"]
}
```

**Alternative (for current session):**
```http
POST /export/session/current
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "uuid-of-session",
  "modelsToExpose": ["openai/gpt-4"]
}
```

**Response:**
```json
{
  "apiKey": "sk-def456ghi789jkl012mno345pqr678stu901vwx234yzA567bcD890efG123hij456",
  "apiUrl": "http://localhost:3000/api/exported/session/v1/chat/completions",
  "type": "session",
  "sessionId": "uuid",
  "id": "uuid"
}
```

### Advanced API Management

#### Create Advanced API
Full control over API settings.

```http
POST /api/admin/exported-apis
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My React App API",
  "description": "API for my React application with user context",
  "export_type": "context", // or "session"
  "session_id": "uuid", // required if export_type is "session"
  "base_model": "openai/gpt-4",
  "allowed_models": ["openai/gpt-4", "anthropic/claude-3-sonnet"],
  "rate_limit": 200, // requests per minute
  "expires_at": "2025-12-31T23:59:59Z" // optional
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "My React App API",
  "description": "API for my React application with user context",
  "api_key": "sk-xyz789abc123def456ghi789jkl012mno345pqr678stu901vwx234", // Only returned once!
  "export_type": "context",
  "base_model": "openai/gpt-4",
  "allowed_models": ["openai/gpt-4", "anthropic/claude-3-sonnet"],
  "rate_limit": 200,
  "is_active": true,
  "expires_at": "2025-12-31T23:59:59Z",
  "created_at": "2025-05-29T12:30:00Z",
  "updated_at": "2025-05-29T12:30:00Z"
}
```

#### Get All Exported APIs
```http
GET /api/admin/exported-apis
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "My React App API",
    "description": "API for my React application",
    "export_type": "context",
    "base_model": "openai/gpt-4",
    "allowed_models": ["openai/gpt-4", "anthropic/claude-3-sonnet"],
    "rate_limit": 200,
    "is_active": true,
    "api_key_preview": "sk-xyz78912...", // Masked for security
    "expires_at": "2025-12-31T23:59:59Z",
    "created_at": "2025-05-29T12:30:00Z",
    "chat_sessions": null // or session info if session type
  }
]
```

#### Get Specific API
```http
GET /api/admin/exported-apis/{id}
Authorization: Bearer <token>
```

#### Update API
```http
PUT /api/admin/exported-apis/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated API Name",
  "description": "Updated description",
  "rate_limit": 300,
  "is_active": false
}
```

#### Delete API
```http
DELETE /api/admin/exported-apis/{id}
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Exported API deleted successfully"
}
```

#### Regenerate API Key
```http
POST /api/admin/exported-apis/{id}/regenerate-key
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "uuid",
  "api_key": "sk-new123abc456def789ghi012jkl345mno678pqr901stu234vwx567", // New key returned once!
  "updated_at": "2025-05-29T12:30:00Z"
}
```

---

## 🌐 4. Using Exported APIs (Third-Party Integration)

### Context-Based API Usage
Automatically includes user's memories, notes, and system prompt.

```http
POST /api/exported/context/v1/chat/completions
Authorization: Bearer <exported_api_key>
Content-Type: application/json

{
  "model": "openai/gpt-4", // or "base" for default
  "messages": [
    {
      "role": "user",
      "content": "Help me with my React project based on what you know about me"
    }
  ],
  "stream": true, // optional
  "temperature": 0.7, // optional
  "max_tokens": 1000, // optional
  "top_p": 1.0, // optional
  "frequency_penalty": 0.0, // optional
  "presence_penalty": 0.0 // optional
}
```

**OpenAI-Compatible Response:**
```json
{
  "id": "chatcmpl-uuid",
  "object": "chat.completion",
  "created": 1674076600,
  "model": "openai/gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Based on your previous conversations, I know you're a React developer who prefers dark mode and concise explanations. Here's how I can help with your React project..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 120,
    "completion_tokens": 85,
    "total_tokens": 205
  }
}
```

### Session-Based API Usage
Includes specific conversation history.

```http
POST /api/exported/session/v1/chat/completions
Authorization: Bearer <exported_api_key>
Content-Type: application/json

{
  "model": "openai/gpt-4",
  "messages": [
    {
      "role": "user",
      "content": "Continue helping me with the debugging we discussed earlier"
    }
  ],
  "session_id": "optional-override" // uses API's session by default
}
```

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
      "description": "Most capable GPT-4 model",
      "pricing": {
        "prompt": "0.00003",
        "completion": "0.00006"
      }
    }
  ]
}
```

---

## 📊 5. Analytics & Usage Tracking

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
      "created_at": "2025-05-29T12:30:00Z"
    }
  ]
}
```

### Dashboard Analytics

#### Get Connected Apps
```http
GET /dashboard/apps
Authorization: Bearer <token>
```

#### Get Usage Statistics
```http
GET /dashboard/usage
Authorization: Bearer <token>
```

#### Get Token Logs
```http
GET /dashboard/tokens
Authorization: Bearer <token>
```

---

## 🤖 6. AI Models

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
      "context_length": 8192,
      "architecture": {
        "tokenizer": "gpt-4",
        "instruct_type": null
      },
      "top_provider": {
        "max_completion_tokens": 4096
      }
    }
  ]
}
```

---

## 💻 7. Frontend Integration Examples

### React Hook for Chat
```typescript
import { useState, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const useChat = (sessionId: string, token: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async (content: string, fileUrls?: string[]) => {
    setIsLoading(true);
    
    // Add user message immediately
    const userMessage: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMessage]);
    
    try {
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

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      // Handle streaming response
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                assistantMessage += parsed.content;
                // Update UI with streaming content
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastMessage = newMessages[newMessages.length - 1];
                  if (lastMessage?.role === 'assistant') {
                    lastMessage.content = assistantMessage;
                  } else {
                    newMessages.push({ role: 'assistant', content: assistantMessage });
                  }
                  return newMessages;
                });
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await fetch(`/chat/history/${sessionId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const history = await response.json();
        setMessages(history.map((h: any) => ({
          role: h.role,
          content: h.content
        })));
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    };

    if (sessionId && token) {
      loadHistory();
    }
  }, [sessionId, token]);

  return { messages, sendMessage, isLoading };
};
```

### Vue.js Exported API Integration
```javascript
// Using exported API in external Vue.js app
export default {
  data() {
    return {
      apiKey: 'sk-your-exported-api-key',
      messages: [],
      isLoading: false
    };
  },
  methods: {
    async sendMessage(message) {
      this.isLoading = true;
      
      try {
        const response = await fetch('http://localhost:3000/api/exported/context/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'base', // Use default model
            messages: [{ role: 'user', content: message }],
            stream: false,
            temperature: 0.7
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        const assistantMessage = result.choices[0].message.content;
        
        this.messages.push(
          { role: 'user', content: message },
          { role: 'assistant', content: assistantMessage }
        );
      } catch (error) {
        console.error('API Error:', error);
      } finally {
        this.isLoading = false;
      }
    }
  }
};
```

### Python Integration Example
```python
import requests
import json

class FastBackendClient:
    def __init__(self, api_key, base_url="http://localhost:3000"):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def chat_context(self, message, model="base", stream=False):
        """Send message to context API"""
        url = f"{self.base_url}/api/exported/context/v1/chat/completions"
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": message}],
            "stream": stream
        }
        
        response = requests.post(url, headers=self.headers, json=payload)
        response.raise_for_status()
        
        if stream:
            return response.iter_lines()
        else:
            return response.json()
    
    def get_available_models(self):
        """Get available models for this API"""
        url = f"{self.base_url}/api/exported/v1/models"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        return response.json()

# Usage
client = FastBackendClient("sk-your-exported-api-key")
response = client.chat_context("Help me with React hooks")
print(response["choices"][0]["message"]["content"])
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
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (model not allowed, rate limit)
- `404` - Not Found
- `429` - Rate Limit Exceeded
- `500` - Internal Server Error

**Example Error Responses:**
```json
// Rate limit exceeded
{
  "error": "Rate limit exceeded"
}

// Model not allowed
{
  "error": "Model not allowed",
  "message": "Model gpt-4o is not in the allowed models list for this API key"
}

// API key expired
{
  "error": "API key expired"
}
```

---

## 🔐 Security Best Practices

1. **API Key Storage**: Never expose exported API keys in frontend code. Store them securely on your backend.

2. **Rate Limiting**: Default is 100 requests/minute. Adjust based on your needs.

3. **Token Expiration**: JWT tokens expire. Implement refresh logic.

4. **CORS**: The API includes proper CORS headers for browser integration.

5. **Data Privacy**: Exported APIs only expose data you've explicitly configured (memories, notes, specific sessions).

6. **Model Restrictions**: Use `allowed_models` to restrict which AI models can be used.

7. **API Expiration**: Set `expires_at` for temporary API access.

---

## 🎯 Common Use Cases

### 1. Personal AI Assistant App
```javascript
// Create context API to remember user preferences
const contextAPI = await createContextAPI(['openai/gpt-4']);
// Use in your app to get personalized responses
const response = await contextAPI.chat("What should I work on today?");
```

### 2. Customer Support Integration
```javascript
// Create session API for specific support conversation
const sessionAPI = await createSessionAPI(supportSessionId, ['openai/gpt-4']);
// Third-party tools can continue the conversation
const response = await sessionAPI.chat("Can you provide more details about this issue?");
```

### 3. Team Collaboration
```javascript
// Share session with team members via exported API
const teamAPI = await createSessionAPI(projectSessionId, ['anthropic/claude-3-sonnet']);
// Team members can interact with the same conversation context
```

### 4. Mobile App Integration
```javascript
// Use exported API in React Native app
const mobileResponse = await fetch(exportedApiUrl, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({
    model: 'base',
    messages: [{ role: 'user', content: userMessage }]
  })
});
```

---

This guide provides everything needed to integrate with the Fast Backend AI App. The API is OpenAI-compatible, making it easy to integrate with existing AI applications and tools.