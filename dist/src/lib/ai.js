"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callOpenRouter = callOpenRouter;
exports.filterRelevantContext = filterRelevantContext;
exports.shouldCommitToMemory = shouldCommitToMemory;
exports.generateSessionTitle = generateSessionTitle;
exports.getModelCapabilities = getModelCapabilities;
const undici_1 = require("undici");
// Enhanced OpenRouter API call with full parameter support
async function callOpenRouter(model, messages, openRouterApiKey, stream = false, additionalParams) {
    const headers = {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.SITE_URL || 'https://your-site-url.com',
        'X-Title': process.env.APP_NAME || 'Fast Backend AI App',
    };
    const body = {
        model,
        messages,
        stream,
        stream_options: { include_usage: true }, // Always include usage for token tracking
    };
    // Add all additional parameters if provided
    if (additionalParams) {
        Object.entries(additionalParams).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                body[key] = value;
            }
        });
    }
    const response = await (0, undici_1.fetch)('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorText = await response.text();
        let errorData = { message: `OpenRouter API error: ${response.status}` };
        try {
            errorData = JSON.parse(errorText);
        }
        catch (e) {
            errorData.details = errorText;
        }
        throw new Error(errorData.error?.message || errorData.message || `OpenRouter API error: ${response.status}`);
    }
    return response;
}
// Function to filter context using Gemini
async function filterRelevantContext(userMessage, memories, notes, genAI, logger) {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-lite",
            generationConfig: {
                temperature: 0.1,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 300,
            }
        });
        const prompt = `You are an AI that filters user context to include only relevant information for the current conversation.
Given the user's message and their available memories/notes, select only the most relevant ones that would help provide a better response.
User message: "${userMessage}"
Available memories:
${memories.map((memory, index) => `${index + 1}. ${memory.content}`).join('\n')}
Available notes:
${notes.map((note, index) => `${index + 1}. ${note.content}`).join('\n')}
Return a JSON object with arrays of relevant item numbers:
{
  "relevantMemories": [1, 3, 5],
  "relevantNotes": [2, 4]
}
Only include memories/notes that are directly relevant to answering the user's current message.
If nothing is relevant, return empty arrays.
Be selective - only include what's truly useful for this specific conversation.`;
        const result = await model.generateContent([{ text: prompt }]);
        const responseText = result.response.text();
        try {
            const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const analysis = JSON.parse(cleanedText);
            const relevantMemories = analysis.relevantMemories
                ? analysis.relevantMemories.map((index) => memories[index - 1]).filter(Boolean)
                : [];
            const relevantNotes = analysis.relevantNotes
                ? analysis.relevantNotes.map((index) => notes[index - 1]).filter(Boolean)
                : [];
            logger.info(`Context filtering: ${relevantMemories.length}/${memories.length} memories, ${relevantNotes.length}/${notes.length} notes selected`);
            return { relevantMemories, relevantNotes };
        }
        catch (parseError) {
            logger.error({ msg: 'Error parsing context filter response:', err: parseError, responseText });
            return {
                relevantMemories: memories.slice(0, 3),
                relevantNotes: notes.slice(0, 2)
            };
        }
    }
    catch (error) {
        logger.error({ msg: 'Context filtering failed:', err: error });
        return {
            relevantMemories: memories.slice(0, 3),
            relevantNotes: notes.slice(0, 2)
        };
    }
}
// Function to analyze if content should be committed to memory using Gemini
async function shouldCommitToMemory(userMessage, assistantResponse, userContext, genAI, logger) {
    try {
        const modelInstance = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-lite",
            generationConfig: {
                temperature: 0.1,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 512,
            }
        });
        const prompt = `You are an AI assistant that determines whether user conversation content should be saved to their personal memory for future reference.
Analyze both the user's message AND the assistant's response to determine if they contain:
- Important personal information (preferences, facts about the user, goals, etc.)
- Key insights, decisions, or conclusions reached
- Information the user might want to reference later
- Context that would be valuable for future conversations
- Problem solutions or important advice given
If you find personal information about the user, create a SHORT memory (1-3 sentences max).
If the content is not relevant or is generic, do NOT save it.
IGNORE everything the assistant said. ONLY focus on what the USER revealed about themselves.
Current user context: ${userContext}
User message: "${userMessage}"
Assistant response: "${assistantResponse}"
Return your response as a JSON object with this exact structure:
{
  "shouldCommit": true/false,
  "memoryContent": "concise summary of what should be remembered (only if shouldCommit is true)"
}
Examples of what TO save:
- "User prefers React over Vue for frontend development"
- "User is working on a project called 'FastBackend' - a Node.js API"
- "User learned that Supabase RLS policies need to be configured for security"
- "User decided to use TypeScript for better type safety"
- "User has experience with React, Python, and machine learning"
- "User's startup is called Clairo, focusing on product information in Africa"
- "User is studying computer engineering at University of Lagos"
Examples of what NOT to save:
- Simple greetings or thank yous
- Basic questions without important context
- Temporary troubleshooting that's resolved
- General conversation without personal relevance
- General educational explanations (like "what is machine learning")
- Generic tutorials or how-to information
- Theoretical concepts or definitions
- General examples or case studies
- Common troubleshooting steps
- Universal best practices
- Assistant explanations or advice
- Tutorial content or step-by-step guides
Be very conservative - only save clear personal facts about the user.
Only commit meaningful, referenceable information that would help in future conversations.`;
        logger.info('Analyzing conversation for memory commit...');
        const result = await modelInstance.generateContent([{ text: prompt }]);
        const responseText = result.response.text();
        try {
            const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const analysis = JSON.parse(cleanedText);
            if (typeof analysis.shouldCommit !== 'boolean') {
                throw new Error('Invalid response: shouldCommit must be boolean');
            }
            logger.info({ msg: 'Memory analysis result:', analysis });
            return analysis;
        }
        catch (parseError) {
            logger.error({ msg: 'Error parsing Gemini response for memory commit:', err: parseError, rawResponse: responseText });
            return { shouldCommit: false };
        }
    }
    catch (error) {
        logger.error({ msg: 'Memory analysis failed:', err: error });
        return { shouldCommit: false };
    }
}
// Function to generate session title using AI
async function generateSessionTitle(firstMessage, openRouterApiKey, logger) {
    const titleMessages = [
        {
            role: 'system',
            content: `You are an AI assistant that generates concise, descriptive titles for chat conversations based on the user's first message.
Generate a short, clear title (3-8 words) that captures the main topic or intent of the conversation.
Examples:
- "How to learn Python" → "Learning Python Programming"
- "Plan my vacation to Japan" → "Japan Vacation Planning"
- "Debug my React code" → "React Code Debugging"
- "Explain quantum physics" → "Quantum Physics Explanation"
Respond with ONLY the title, no quotes or additional text.`
        },
        {
            role: 'user',
            content: `Generate a title for this conversation starter: "${firstMessage}"`
        }
    ];
    try {
        const response = await callOpenRouter('google/gemini-2.0-flash-001', titleMessages, openRouterApiKey);
        const data = await response.json();
        const title = data.choices[0].message.content.trim();
        return title || 'New Conversation';
    }
    catch (error) {
        logger.error({ msg: 'Title generation failed:', err: error });
        return 'New Conversation';
    }
}
// Helper function to detect model capabilities
function getModelCapabilities(modelId) {
    const capabilities = {
        supportsReasoning: false,
        supportsTools: true,
        supportsImages: false,
        isReasoningModel: false,
        maxTokens: 4096,
        contextWindow: 128000,
    };
    // DeepSeek R1 models
    if (modelId.includes('deepseek') && modelId.includes('r1')) {
        capabilities.supportsReasoning = true;
        capabilities.isReasoningModel = true;
        capabilities.maxTokens = 32768;
        capabilities.contextWindow = 131072;
    }
    // Claude models
    if (modelId.includes('claude')) {
        capabilities.supportsImages = true;
        capabilities.maxTokens = 32000;
        capabilities.contextWindow = 200000;
    }
    // GPT models
    if (modelId.includes('gpt')) {
        capabilities.supportsImages = modelId.includes('gpt-4');
        capabilities.maxTokens = 16384;
        capabilities.contextWindow = 128000;
    }
    // Gemini models
    if (modelId.includes('gemini')) {
        capabilities.supportsImages = true;
        capabilities.maxTokens = 8192;
        capabilities.contextWindow = 1048576;
    }
    return capabilities;
}
