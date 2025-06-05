import { SupabaseClient } from '@supabase/supabase-js';
import { FastifyBaseLogger } from 'fastify';

export interface UserContext {
  systemPrompt: string;
  memories: Array<{ content: string; created_at: string }>;
  notes: Array<{ content: string; created_at: string }>;
  relevantMemories?: Array<{ content: string; created_at: string }>;
  relevantNotes?: Array<{ content: string; created_at: string }>;
}

export interface UserContextData {
  systemPrompt: string;
  memories: Array<{ content: string; created_at: string }>;
  notes: Array<{ content: string; created_at: string }>;
  relevantMemories?: Array<{ content: string; created_at: string }>;
  relevantNotes?: Array<{ content: string; created_at: string }>;
}

export interface ExportedApiData {
  id: string;
  user_id: string;
  export_type: 'context' | 'session';
  session_id?: string;
  include_memories: boolean;
  include_notes: boolean;
  base_model: string;
  allowed_models: string[];
}

export async function getUserContext(userId: string, supabase: SupabaseClient, logger: FastifyBaseLogger): Promise<UserContext> {
  try {
    const { data: profile } = await supabase
      .from('system_prompts')
      .select('prompt')
      .eq('user_id', userId)
      .single();

    const { data: memories } = await supabase
      .from('user_memories')
      .select('content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const { data: notes } = await supabase
      .from('user_notes')
      .select('content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    return {
      systemPrompt: profile?.prompt || 'You are a helpful AI assistant.',
      memories: memories || [],
      notes: notes || [],
    };
  } catch (error: any) {
    logger.error({ msg: 'Error fetching user context', err: error, userId });
    return {
      systemPrompt: 'You are a helpful AI assistant.',
      memories: [],
      notes: [],
    };
  }
}

// Enhanced system prompt builder for session APIs (ONLY for exported APIs)
export function buildEnhancedSessionSystemPrompt(
  baseSystemPrompt: string,
  userContext: UserContext,
  sessionHistory: Array<{ role: string; content: string; created_at?: string }>,
  exportData: ExportedApiData
): string {
  let enhancedPrompt = baseSystemPrompt;

  // Add session context instructions
  enhancedPrompt += '\n\n--- SESSION CONTEXT ---\n';
  enhancedPrompt += 'IMPORTANT: Always reference and build upon the conversation history provided below when responding. The user expects you to remember and continue from previous interactions in this session.\n';

  if (sessionHistory.length > 0) {
    enhancedPrompt += '\nPREVIOUS CONVERSATION:\n';
    sessionHistory.forEach((msg, index) => {
      enhancedPrompt += `${index + 1}. ${msg.role.toUpperCase()}: ${msg.content}\n`;
    });
  }

  // Add user context if enabled
  if (exportData.include_memories && userContext.relevantMemories && userContext.relevantMemories.length > 0) {
    enhancedPrompt += '\nUSER MEMORIES (reference when relevant):\n';
    userContext.relevantMemories.forEach((memory, index) => {
      enhancedPrompt += `- ${memory.content}\n`;
    });
  }

  if (exportData.include_notes && userContext.relevantNotes && userContext.relevantNotes.length > 0) {
    enhancedPrompt += '\nUSER NOTES (reference when relevant):\n';
    userContext.relevantNotes.forEach((note, index) => {
      enhancedPrompt += `- ${note.content}\n`;
    });
  }

  enhancedPrompt += '\n--- END SESSION CONTEXT ---\n';

  return enhancedPrompt;
}

// Enhanced system prompt builder for context APIs (ONLY for exported APIs)
export function buildEnhancedContextSystemPrompt(
  baseSystemPrompt: string,
  userContext: UserContext,
  exportData: ExportedApiData
): string {
  let enhancedPrompt = baseSystemPrompt;

  // Add user context if enabled
  if ((exportData.include_memories && userContext.relevantMemories && userContext.relevantMemories.length > 0) ||
      (exportData.include_notes && userContext.relevantNotes && userContext.relevantNotes.length > 0)) {
    
    enhancedPrompt += '\n\n--- USER CONTEXT ---\n';
    enhancedPrompt += 'Use the following context about the user when relevant to your response:\n';

    if (exportData.include_memories && userContext.relevantMemories && userContext.relevantMemories.length > 0) {
      enhancedPrompt += '\nUSER MEMORIES:\n';
      userContext.relevantMemories.forEach((memory, index) => {
        enhancedPrompt += `- ${memory.content}\n`;
      });
    }

    if (exportData.include_notes && userContext.relevantNotes && userContext.relevantNotes.length > 0) {
      enhancedPrompt += '\nUSER NOTES:\n';
      userContext.relevantNotes.forEach((note, index) => {
        enhancedPrompt += `- ${note.content}\n`;
      });
    }

    enhancedPrompt += '\n--- END USER CONTEXT ---\n';
  }

  return enhancedPrompt;
}

// Original functions for existing chat functionality (unchanged)
export function buildContextAwareMessages(
  userContext: UserContext,
  sessionHistory: Array<{ role: string; content: string }>,
  userMessage: { role: string; content: string }
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  messages.push({ role: 'system', content: userContext.systemPrompt });

  if ((userContext.relevantMemories && userContext.relevantMemories.length > 0) || 
      (userContext.relevantNotes && userContext.relevantNotes.length > 0)) {
    let contextMessage = 'Additional context about the user:\n';
    
    if (userContext.relevantMemories && userContext.relevantMemories.length > 0) {
      contextMessage += '\nRelevant memories:\n';
      userContext.relevantMemories.forEach((memory, index) => {
        contextMessage += `${index + 1}. ${memory.content}\n`;
      });
    }
    
    if (userContext.relevantNotes && userContext.relevantNotes.length > 0) {
      contextMessage += '\nRelevant notes:\n';
      userContext.relevantNotes.forEach((note, index) => {
        contextMessage += `${index + 1}. ${note.content}\n`;
      });
    }
    
    messages.push({ role: 'system', content: contextMessage });
  }

  messages.push(...sessionHistory);
  messages.push(userMessage);

  return messages;
}

// Simplified message builders for exported APIs
export function buildExportedContextAwareMessages(
  userContext: UserContext,
  sessionHistory: Array<{ role: string; content: string }>,
  thirdPartyMessages: Array<{ role: string; content: string }>,
  exportData: ExportedApiData,
  thirdPartySystemPrompt?: string
): Array<{ role: string; content: string }> {
  const baseSystemPrompt = thirdPartySystemPrompt || userContext.systemPrompt;
  const enhancedSystemPrompt = buildEnhancedContextSystemPrompt(baseSystemPrompt, userContext, exportData);
  
  return [
    { role: 'system', content: enhancedSystemPrompt },
    ...thirdPartyMessages
  ];
}

export function buildExportedSessionAwareMessages(
  userContext: UserContext,
  sessionHistory: Array<{ role: string; content: string; created_at?: string }>,
  thirdPartyMessages: Array<{ role: string; content: string }>,
  exportData: ExportedApiData,
  thirdPartySystemPrompt?: string
): Array<{ role: string; content: string }> {
  const baseSystemPrompt = thirdPartySystemPrompt || userContext.systemPrompt;
  const enhancedSystemPrompt = buildEnhancedSessionSystemPrompt(baseSystemPrompt, userContext, sessionHistory, exportData);
  
  return [
    { role: 'system', content: enhancedSystemPrompt },
    ...thirdPartyMessages
  ];
}

export function processMessageContent(content: any): string {
  if (typeof content === 'string') {
    return content;
  } else if (Array.isArray(content)) {
    return content
      .filter(item => item.type === 'text')
      .map(item => item.text || '')
      .join(' ');
  }
  return '';
}

export function extractOpenAIParameters(body: any) {
  const {
    model,
    stream = false,
    temperature,
    max_tokens,
    top_p,
    top_k,
    frequency_penalty,
    presence_penalty,
    repetition_penalty,
    min_p,
    stop,
    reasoning,
    include_reasoning,
    tools,
    tool_choice,
    response_format,
    structured_outputs,
    logit_bias,
    logprobs,
    top_logprobs,
    seed,
    system_prompt,
    ...otherParams
  } = body;

  const params: any = {
    model,
    stream,
  };

  if (temperature !== undefined) params.temperature = temperature;
  if (max_tokens !== undefined) params.max_tokens = max_tokens;
  if (top_p !== undefined) params.top_p = top_p;
  if (top_k !== undefined) params.top_k = top_k;
  if (frequency_penalty !== undefined) params.frequency_penalty = frequency_penalty;
  if (presence_penalty !== undefined) params.presence_penalty = presence_penalty;
  if (repetition_penalty !== undefined) params.repetition_penalty = repetition_penalty;
  if (min_p !== undefined) params.min_p = min_p;
  if (stop !== undefined) params.stop = stop;
  if (reasoning !== undefined) params.reasoning = reasoning;
  if (include_reasoning !== undefined) params.include_reasoning = include_reasoning;
  if (tools !== undefined) params.tools = tools;
  if (tool_choice !== undefined) params.tool_choice = tool_choice;
  if (response_format !== undefined) params.response_format = response_format;
  if (structured_outputs !== undefined) params.structured_outputs = structured_outputs;
  if (logit_bias !== undefined) params.logit_bias = logit_bias;
  if (logprobs !== undefined) params.logprobs = logprobs;
  if (top_logprobs !== undefined) params.top_logprobs = top_logprobs;
  if (seed !== undefined) params.seed = seed;

  return params;
}