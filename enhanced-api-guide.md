# Enhanced Exported API Guide

## Overview

Your exported API now matches the performance and flexibility of platforms like Cline, supporting advanced model parameters, custom system prompts, and comprehensive OpenAI compatibility while maintaining your powerful user context and memory system.

## Key Features

### 🚀 **Enhanced Capabilities**
- **Custom System Prompts**: Third-party apps can override system prompts while keeping user context
- **Full OpenAI Compatibility**: Support for all modern OpenAI parameters
- **Advanced Model Support**: Reasoning models (DeepSeek R1), tool calling, structured outputs
- **Smart Context Integration**: Your existing memory and notes system works seamlessly
- **Performance Optimized**: Model-specific parameter validation and capabilities detection

### 🔧 **Supported Parameters**

Your API now supports all these OpenAI-compatible parameters:

```typescript
{
  // Core parameters
  "model": "deepseek/deepseek-r1-0528",
  "messages": [...],
  "stream": true,
  
  // Generation parameters
  "temperature": 0.7,
  "max_tokens": 4096,
  "top_p": 0.9,
  "top_k": 40,
  "frequency_penalty": 0.0,
  "presence_penalty": 0.0,
  "repetition_penalty": 1.0,
  "min_p": 0.0,
  "stop": ["<|end|>", "\n\n"],
  
  // Reasoning parameters (for R1 models)
  "reasoning": true,
  "include_reasoning": true,
  
  // Tool parameters
  "tools": [...],
  "tool_choice": "auto",
  
  // Response format
  "response_format": { "type": "json_object" },
  "structured_outputs": true,
  
  // Logit parameters
  "logit_bias": { "50256": -100 },
  "logprobs": true,
  "top_logprobs": 5,
  
  // Deterministic outputs
  "seed": 42,
  
  // 🆕 Custom system prompt override
  "system_prompt": "You are a specialized coding assistant..."
}
```

## API Types: Context vs Session

### 🔵 **Context API** - Stateless with User Context
- **Purpose**: Stateless interactions with user memories and notes
- **Best for**: Independent requests, one-off tasks, third-party integrations
- **Includes**: User context (filtered memories + notes) + your messages
- **Does NOT include**: Session history from other conversations

### 🟡 **Session API** - Stateful with Full Conversation History
- **Purpose**: Stateful conversations with complete session knowledge
- **Best for**: Ongoing conversations, chat applications, multi-turn interactions
- **Includes**: User context (filtered memories + notes) + FULL session history + your messages
- **Key Feature**: The model has knowledge of the entire conversation from that specific session

## API Endpoints

### 1. Bearer Token Endpoints (Recommended)

#### Context API (Stateless)
```bash
POST /api/exported/context/v1/chat/completions
Authorization: Bearer your-api-key-here
```

#### Session API (Stateful)
```bash
POST /api/exported/session/v1/chat/completions
Authorization: Bearer your-session-api-key-here
```

#### Models List
```bash
GET /api/exported/v1/models
Authorization: Bearer your-api-key-here
```

### 2. Legacy Path-based Endpoints

#### Context API (Legacy)
```bash
POST /api/exported/context/{api-key}/chat/completions
```

#### Session API (Legacy)
```bash
POST /api/exported/session/{api-key}/chat/completions
```

## Usage Examples

### Example 1: Context API - Stateless Request with Custom System Prompt

```javascript
// Context API: No session history, just user context + your messages
const response = await fetch('/api/exported/context/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-context-api-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: "deepseek/deepseek-r1-0528",
    messages: [
      {
        role: "user",
        content: "Help me debug this React component"
      }
    ],
    system_prompt: "You are a React debugging expert. Focus on performance and best practices.",
    temperature: 0.3,
    max_tokens: 2048
  })
});
```

**What the model receives:**
1. System prompt: "You are a React debugging expert..."
2. User context: Relevant memories about the user (e.g., "User prefers TypeScript", "User is working on FastBackend project")
3. Your message: "Help me debug this React component"

### Example 2: Session API - Conversation with Full History

```javascript
// Session API: Includes FULL session history + user context + your messages
const response = await fetch('/api/exported/session/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-session-api-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: "anthropic/claude-sonnet-4",
    messages: [
      {
        role: "user",
        content: "Can you explain the fix you suggested earlier?"
      }
    ],
    system_prompt: "You are a helpful programming assistant. Reference previous conversations when relevant.",
    temperature: 0.7
  })
});
```

**What the model receives:**
1. System prompt: "You are a helpful programming assistant..."
2. User context: Relevant memories and notes about the user
3. **FULL session history**: All previous messages from this specific session
   - "User: How do I fix this async bug?"
   - "Assistant: Here's how to fix it with proper error handling..."
   - "User: That worked! Can you also help with..."
   - "Assistant: Sure! Here's how to..."
4. Your new message: "Can you explain the fix you suggested earlier?"

### Example 3: Reasoning Model with Streaming

```javascript
const response = await fetch('/api/exported/context/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-api-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: "deepseek/deepseek-r1-0528",
    messages: [
      {
        role: "user",
        content: "Solve this complex math problem step by step: ..."
      }
    ],
    stream: true,
    reasoning: true,
    include_reasoning: true,
    temperature: 0.1
  })
});

// Handle streaming response
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = new TextDecoder().decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      
      try {
        const parsed = JSON.parse(data);
        console.log(parsed.choices[0].delta.content);
      } catch (e) {
        // Handle parsing errors
      }
    }
  }
}
```

### Example 4: Tool Calling with Structured Output

```javascript
const response = await fetch('/api/exported/context/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-api-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: "anthropic/claude-sonnet-4",
    messages: [
      {
        role: "user",
        content: "Get the weather for Lagos, Nigeria"
      }
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get weather information for a city",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string" },
              country: { type: "string" }
            },
            required: ["city"]
          }
        }
      }
    ],
    tool_choice: "auto",
    response_format: { type: "json_object" }
  })
});
```

## How System Prompts Work

### Priority Order:
1. **Third-party override** (via `system_prompt` parameter) - Highest priority
2. **User's custom system prompt** (from their profile) - Medium priority  
3. **Default fallback** ("You are a helpful AI assistant.") - Lowest priority

### User Context Integration:
- Your memory and notes system still works alongside custom system prompts
- User context is added as a secondary system message after the primary prompt
- Memory filtering ensures only relevant context is included
- **Session APIs ALWAYS include the full conversation history**

### Message Flow Examples:

#### Context API Flow:
```
1. Primary System Message: "You are a specialized coding assistant..." (from system_prompt)
2. User Context Message: "Additional context about the user: 
   Relevant memories:
   1. User prefers TypeScript over JavaScript
   2. User is working on a FastAPI backend project
   ..."
3. Your Messages: [
     { role: "user", content: "Help me with this API endpoint" }
   ]
```

#### Session API Flow:
```
1. Primary System Message: "You are a specialized coding assistant..." (from system_prompt)
2. User Context Message: "Additional context about the user: 
   Relevant memories:
   1. User prefers TypeScript over JavaScript
   2. User is working on a FastAPI backend project
   ..."
3. Session History: [
     { role: "user", content: "I'm building a FastAPI backend" },
     { role: "assistant", content: "Great! FastAPI is excellent for..." },
     { role: "user", content: "How do I handle authentication?" },
     { role: "assistant", content: "For authentication, I recommend..." }
   ]
4. Your New Messages: [
     { role: "user", content: "Can you review the auth code I wrote based on your suggestion?" }
   ]
```

## Model Capabilities

Your API automatically detects and optimizes for different model types:

### Reasoning Models (DeepSeek R1 series)
- Supports `reasoning` and `include_reasoning` parameters
- Optimized context window handling
- Enhanced token limit validation

### Claude Models
- Image support detection
- Optimized for tool calling
- Enhanced context window (200K tokens)

### GPT Models
- Image support for GPT-4 variants
- Tool calling optimization
- Standard parameter validation

### Gemini Models
- Multi-modal support
- Large context windows (1M+ tokens)
- Optimized generation parameters

## Context vs Session: When to Use Which?

### Use Context API When:
- ✅ Building a search interface where each query is independent
- ✅ Creating a code analysis tool that processes individual files
- ✅ Developing a translation service
- ✅ Building a content generation tool
- ✅ Creating one-off AI interactions
- ✅ Want to include user context but not conversation history

### Use Session API When:
- ✅ Building a chat application
- ✅ Creating a conversational assistant
- ✅ Developing a tutoring system that builds on previous lessons
- ✅ Building a coding assistant that remembers the conversation context
- ✅ Creating any multi-turn interaction where context matters
- ✅ Want the model to reference what was discussed earlier in the conversation

## Error Handling

The API returns OpenAI-compatible error formats:

```json
{
  "error": {
    "message": "Model 'gpt-5' not allowed for this API key. Allowed models: gpt-4, claude-3-sonnet",
    "type": "invalid_request_error",
    "code": "model_not_allowed"
  }
}
```

Common error codes:
- `invalid_api_key` - Invalid or missing API key
- `model_not_allowed` - Model not in allowed list
- `invalid_messages` - Invalid message format
- `session_not_configured` - Session API key without session
- `internal_error` - Server error

## Rate Limiting & Usage Tracking

- All API calls are logged with detailed token usage
- Response times are tracked for performance monitoring
- Rate limits are enforced per API key
- Usage analytics available through dashboard

## Best Practices

### 1. **Choose the Right API Type**
```javascript
// For independent requests
const contextAPI = '/api/exported/context/v1/chat/completions';

// For conversational flows
const sessionAPI = '/api/exported/session/v1/chat/completions';
```

### 2. **Model Selection**
```javascript
// For reasoning tasks
model: "deepseek/deepseek-r1-0528"

// For general chat
model: "openai/gpt-4"

// For image analysis
model: "anthropic/claude-sonnet-4"
```

### 3. **Parameter Optimization**
```javascript
// For creative writing
{
  temperature: 0.8,
  top_p: 0.9,
  presence_penalty: 0.6
}

// For code generation
{
  temperature: 0.2,
  top_p: 0.95,
  stop: ["\n\n", "```"]
}

// For reasoning tasks
{
  temperature: 0.1,
  reasoning: true,
  include_reasoning: true
}
```

### 4. **System Prompt Design**
```javascript
// ✅ Good: Specific and actionable
system_prompt: "You are a TypeScript expert. Provide type-safe solutions with proper error handling. Always explain your reasoning."

// ❌ Bad: Vague and generic  
system_prompt: "You are helpful."
```

### 5. **Context Management**
- Use session APIs for ongoing conversations where history matters
- Use context APIs for stateless interactions with user personalization
- The memory system automatically filters relevant context
- Long conversations are automatically truncated to fit context windows

## Integration Examples

### Chat Application (Session API)
```typescript
class ChatApp {
  constructor(sessionApiKey: string) {
    this.apiKey = sessionApiKey;
  }
  
  async sendMessage(message: string, systemPrompt?: string) {
    return fetch('/api/exported/session/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4',
        messages: [{ role: 'user', content: message }],
        system_prompt: systemPrompt,
        stream: true
      })
    });
  }
}
```

### Analysis Tool (Context API)
```typescript
class AnalysisTool {
  constructor(contextApiKey: string) {
    this.apiKey = contextApiKey;
  }
  
  async analyzeCode(code: string) {
    return fetch('/api/exported/context/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-r1-0528',
        messages: [
          { 
            role: 'user', 
            content: `Analyze this code for potential issues:\n\n${code}` 
          }
        ],
        system_prompt: 'You are a code analysis expert. Identify bugs, security issues, and optimization opportunities.',
        reasoning: true,
        temperature: 0.2
      })
    });
  }
}
```

Your exported API now provides enterprise-grade flexibility with clear separation between stateless context interactions and stateful session conversations, while maintaining the simplicity and power of your existing user context system. Third-party applications can leverage advanced AI capabilities while seamlessly integrating with user memories and personalized context.