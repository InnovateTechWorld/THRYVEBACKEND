# Database Schema Explanation

## Chat System Architecture

### Two-Table Design: `chat_sessions` + `chat_history`

The chat system uses a **normalized database design** with two related tables:

## 📋 **`chat_sessions` Table**
**Purpose**: Stores conversation metadata and organization
```sql
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY,           -- Unique session identifier
  user_id UUID,                  -- Owner of the session
  name VARCHAR(255),             -- Session title/name (auto-generated or user-edited)
  created_at TIMESTAMP,          -- When session started
  updated_at TIMESTAMP           -- Last activity in session
);
```

**What it stores:**
- Session titles (e.g., "Learning Python Programming", "Travel Planning")
- Session ownership and organization
- Timestamps for sorting and management

## 💬 **`chat_history` Table**
**Purpose**: Stores individual messages/interactions
```sql
CREATE TABLE chat_history (
  id UUID PRIMARY KEY,
  user_id UUID,                  -- Message owner
  session_id UUID,               -- References chat_sessions.id
  model_id TEXT,                 -- Which AI model was used
  content JSONB,                 -- Message content (text/images)
  role TEXT,                     -- 'user', 'assistant', 'system'
  file_urls TEXT[],              -- Attached files
  created_at TIMESTAMP           -- Message timestamp
);
```

**What it stores:**
- Individual messages from users and AI
- Message content and metadata
- File attachments and model information

## 🔗 **Relationship**

```
chat_sessions (1) ←→ (many) chat_history
     ↓                        ↓
One session can have      Each message belongs
many messages            to one session
```

**Foreign Key**: `chat_history.session_id` → `chat_sessions.id`

## 🎯 **Why This Design?**

### ✅ **Benefits of Two-Table Approach:**

1. **Organization**: Sessions provide logical grouping of related messages
2. **Performance**: Can query sessions without loading all messages
3. **Metadata**: Store session-level data (titles, categories) separately
4. **Scalability**: Efficient for large conversation histories
5. **User Experience**: Users can see conversation list with titles

### ❌ **Alternative Single-Table Issues:**
- No conversation grouping
- Difficult to show conversation list
- Poor performance for session management
- No session-level metadata storage

## 🚀 **Automatic Features**

### **Auto-Generated Session Titles**
When a user sends the first message in a new session:
1. AI analyzes the message content
2. Generates a descriptive title (e.g., "Help with React debugging" → "React Code Debugging")
3. Creates/updates the `chat_sessions` record with the title
4. User can edit the title later

### **Smart Timestamps**
- `chat_sessions.updated_at` automatically updates when new messages are added
- Enables "most recent conversations" sorting
- Tracks session activity

## 📊 **API Endpoints**

### **Session Management:**
- `GET /chat/sessions` - List all user's sessions with titles and message counts
- `PATCH /chat/sessions/:id` - Update session title
- `DELETE /chat/sessions/:id` - Delete session and all messages

### **Message Management:**
- `POST /chat/message` - Send message (auto-creates session if first message)
- `GET /chat/history/:sessionId` - Get all messages in a session

## 🔐 **Security**

Both tables use **Row Level Security (RLS)**:
- Users can only access their own sessions and messages
- Foreign key constraints ensure data integrity
- Cascading deletes maintain consistency

## 📈 **Performance Optimizations**

### **Indexes:**
```sql
-- Fast session lookups
CREATE INDEX idx_chat_sessions_user_updated ON chat_sessions(user_id, updated_at DESC);

-- Fast message queries
CREATE INDEX idx_chat_history_session_user ON chat_history(session_id, user_id);
CREATE INDEX idx_chat_history_user_created ON chat_history(user_id, created_at DESC);
```

### **Triggers:**
- Auto-update `chat_sessions.updated_at` when messages added
- Auto-update `updated_at` columns on record changes

## 🎨 **User Experience Flow**

1. **User starts new conversation** → System generates UUID for `session_id`
2. **First message sent** → AI generates title, creates `chat_sessions` record
3. **Conversation continues** → Messages stored in `chat_history`
4. **User views conversations** → Query `chat_sessions` for organized list
5. **User opens conversation** → Query `chat_history` for message thread
6. **User renames conversation** → Update `chat_sessions.name`

This design provides the best balance of **organization**, **performance**, and **user experience** for a modern chat application.