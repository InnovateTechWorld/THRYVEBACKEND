"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserContext = getUserContext;
exports.buildEnhancedSessionSystemPrompt = buildEnhancedSessionSystemPrompt;
exports.buildEnhancedContextSystemPrompt = buildEnhancedContextSystemPrompt;
exports.buildContextAwareMessages = buildContextAwareMessages;
exports.buildExportedContextAwareMessages = buildExportedContextAwareMessages;
exports.buildExportedSessionAwareMessages = buildExportedSessionAwareMessages;
exports.processMessageContent = processMessageContent;
exports.extractOpenAIParameters = extractOpenAIParameters;
async function getUserContext(userId, supabase, logger) {
    try {
        const { data: profile } = await supabase
            .from('system_prompts')
            .select('prompt')
            .eq('user_id', userId)
            .single();
        // ✅ Fix: Query from 'memory' table (not 'user_memories')
        const { data: memories } = await supabase
            .from('memory') // ✅ Changed from 'user_memories'
            .select('content, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        // ✅ Fix: Query from 'notes' table (not 'user_notes')  
        const { data: notes } = await supabase
            .from('notes') // ✅ Changed from 'user_notes'
            .select('content, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        return {
            systemPrompt: profile?.prompt || 'You are a helpful AI assistant.',
            memories: memories || [],
            notes: notes || [],
        };
    }
    catch (error) {
        logger.error({ msg: 'Error fetching user context', err: error, userId });
        return {
            systemPrompt: 'You are a helpful AI assistant.',
            memories: [],
            notes: [],
        };
    }
}
// Enhanced system prompt builder for session APIs (ONLY for exported APIs)
function buildEnhancedSessionSystemPrompt(baseSystemPrompt, userContext, sessionHistory, exportData) {
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
function buildEnhancedContextSystemPrompt(baseSystemPrompt, userContext, exportData) {
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
function buildContextAwareMessages(userContext, // ✅ Use UserContextData instead of UserContext
sessionHistory, userMessage) {
    const messages = [];
    messages.push({ role: 'system', content: userContext.systemPrompt });
    // ✅ Use FILTERED memories and notes
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
function buildExportedContextAwareMessages(userContext, sessionHistory, thirdPartyMessages, exportData, thirdPartySystemPrompt) {
    const baseSystemPrompt = thirdPartySystemPrompt || userContext.systemPrompt;
    const enhancedSystemPrompt = buildEnhancedContextSystemPrompt(baseSystemPrompt, userContext, exportData);
    return [
        { role: 'system', content: enhancedSystemPrompt },
        ...thirdPartyMessages
    ];
}
function buildExportedSessionAwareMessages(userContext, sessionHistory, thirdPartyMessages, exportData, thirdPartySystemPrompt) {
    const baseSystemPrompt = thirdPartySystemPrompt || userContext.systemPrompt;
    const enhancedSystemPrompt = buildEnhancedSessionSystemPrompt(baseSystemPrompt, userContext, sessionHistory, exportData);
    return [
        { role: 'system', content: enhancedSystemPrompt },
        ...thirdPartyMessages
    ];
}
function processMessageContent(content) {
    if (typeof content === 'string') {
        return content;
    }
    else if (Array.isArray(content)) {
        return content
            .filter(item => item.type === 'text')
            .map(item => item.text || '')
            .join(' ');
    }
    return '';
}
function extractOpenAIParameters(body) {
    const { model, stream = false, temperature, max_tokens, top_p, top_k, frequency_penalty, presence_penalty, repetition_penalty, min_p, stop, reasoning, include_reasoning, tools, tool_choice, response_format, structured_outputs, logit_bias, logprobs, top_logprobs, seed, system_prompt, ...otherParams } = body;
    const params = {
        model,
        stream,
    };
    if (temperature !== undefined)
        params.temperature = temperature;
    if (max_tokens !== undefined)
        params.max_tokens = max_tokens;
    if (top_p !== undefined)
        params.top_p = top_p;
    if (top_k !== undefined)
        params.top_k = top_k;
    if (frequency_penalty !== undefined)
        params.frequency_penalty = frequency_penalty;
    if (presence_penalty !== undefined)
        params.presence_penalty = presence_penalty;
    if (repetition_penalty !== undefined)
        params.repetition_penalty = repetition_penalty;
    if (min_p !== undefined)
        params.min_p = min_p;
    if (stop !== undefined)
        params.stop = stop;
    if (reasoning !== undefined)
        params.reasoning = reasoning;
    if (include_reasoning !== undefined)
        params.include_reasoning = include_reasoning;
    if (tools !== undefined)
        params.tools = tools;
    if (tool_choice !== undefined)
        params.tool_choice = tool_choice;
    if (response_format !== undefined)
        params.response_format = response_format;
    if (structured_outputs !== undefined)
        params.structured_outputs = structured_outputs;
    if (logit_bias !== undefined)
        params.logit_bias = logit_bias;
    if (logprobs !== undefined)
        params.logprobs = logprobs;
    if (top_logprobs !== undefined)
        params.top_logprobs = top_logprobs;
    if (seed !== undefined)
        params.seed = seed;
    return params;
}
