import { SupabaseClient } from '@supabase/supabase-js';
import { FastifyBaseLogger } from 'fastify';

export interface UserContextData {
  memories: any[];
  notes: any[];
  systemPrompt: string;
  relevantMemories?: any[];
  relevantNotes?: any[];
}

// Helper function to get user context (memory, notes, system prompt)
export async function getUserContext(
  userId: string,
  supabase: SupabaseClient,
  logger: FastifyBaseLogger
): Promise<UserContextData> {
  try {
    const [memoryResult, notesResult, systemPromptResult] = await Promise.all([
      supabase.from('memory').select('content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
      supabase.from('notes').select('content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
      supabase.from('system_prompts').select('prompt').eq('user_id', userId).single()
    ]);

    const context: UserContextData = {
      memories: memoryResult.data || [],
      notes: notesResult.data || [],
      systemPrompt: systemPromptResult.data?.prompt || 'You are a helpful AI assistant.'
    };

    return context;
  } catch (error) {
    logger.error({ msg: 'Failed to get user context:', err: error, userId });
    return {
      memories: [],
      notes: [],
      systemPrompt: 'You are a helpful AI assistant.'
    };
  }
}

// Helper function to build context-aware messages
export function buildContextAwareMessages(
  userContext: UserContextData,
  sessionHistory: any[],
  newMessage: any,
  exportConfig?: any // Consider defining a type for exportConfig
) {
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

    // Use filtered memories if available, otherwise fall back to all memories
    const memoriesToUse = userContext.relevantMemories || userContext.memories;
    const notesToUse = userContext.relevantNotes || userContext.notes;

    if (shouldIncludeMemories && memoriesToUse.length > 0) {
      contextContent += '\n\nRelevant memories about the user:\n';
      memoriesToUse.forEach((memory: any, index: number) => {
        contextContent += `${index + 1}. ${memory.content}\n`;
      });
    }

    if (shouldIncludeNotes && notesToUse.length > 0) {
      contextContent += '\n\nUser\'s relevant notes:\n';
      notesToUse.forEach((note: any, index: number) => {
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