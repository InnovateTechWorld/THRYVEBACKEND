import { fetch } from 'undici';
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { FastifyBaseLogger } from 'fastify';

// Enhanced OpenRouter API call with full parameter support
export async function callOpenRouter(
  model: string,
  messages: any[],
  openRouterApiKey: string,
  stream: boolean = false,
  additionalParams?: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    top_k?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    repetition_penalty?: number;
    min_p?: number;
    stop?: string | string[];
    reasoning?: boolean;
    include_reasoning?: boolean;
    tools?: any[];
    tool_choice?: any;
    response_format?: any;
    structured_outputs?: boolean;
    logit_bias?: Record<string, number>;
    logprobs?: boolean;
    top_logprobs?: number;
    seed?: number;
  }
) {
  const headers = {
    'Authorization': `Bearer ${openRouterApiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.SITE_URL || 'https://your-site-url.com',
    'X-Title': process.env.APP_NAME || 'Fast Backend AI App',
  };

  const body: any = {
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

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData: any = { message: `OpenRouter API error: ${response.status}` };
    try {
        errorData = JSON.parse(errorText);
    } catch (e) {
        errorData.details = errorText;
    }
    throw new Error(errorData.error?.message || errorData.message || `OpenRouter API error: ${response.status}`);
  }

  return response;
}

// Function to filter context using Gemini
export async function filterRelevantContext(
  userMessage: string,
  memories: any[],
  notes: any[],
  genAI: GoogleGenerativeAI,
  logger: FastifyBaseLogger
): Promise<{ relevantMemories: any[], relevantNotes: any[] }> {
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
        ? analysis.relevantMemories.map((index: number) => memories[index - 1]).filter(Boolean)
        : [];
      const relevantNotes = analysis.relevantNotes
        ? analysis.relevantNotes.map((index: number) => notes[index - 1]).filter(Boolean)
        : [];

      logger.info(`Context filtering: ${relevantMemories.length}/${memories.length} memories, ${relevantNotes.length}/${notes.length} notes selected`);
      return { relevantMemories, relevantNotes };
    } catch (parseError) {
      logger.error({ msg: 'Error parsing context filter response:', err: parseError, responseText });
      return {
        relevantMemories: memories.slice(0, 3),
        relevantNotes: notes.slice(0, 2)
      };
    }
  } catch (error) {
    logger.error({ msg: 'Context filtering failed:', err: error });
    return {
      relevantMemories: memories.slice(0, 3),
      relevantNotes: notes.slice(0, 2)
    };
  }
}


export function isDuplicateMemory(newContent: string, existingMemories: any[]): boolean {
  const normalizedNew = newContent.toLowerCase().trim();
  
  return existingMemories.some(memory => {
    const normalizedExisting = memory.content.toLowerCase().trim();
    
    // Check for exact matches
    if (normalizedNew === normalizedExisting) return true;
    
    // Check for semantic similarity (simple approach)
    const newWords = normalizedNew.split(' ');
    const existingWords = normalizedExisting.split(' ');
    
    // If 80% of words overlap and both are short, consider duplicate
    if (newWords.length <= 6 && existingWords.length <= 6) {
      const overlap = newWords.filter(word => existingWords.includes(word)).length;
      const similarity = overlap / Math.max(newWords.length, existingWords.length);
      return similarity > 0.8;
    }
    
    return false;
  });
}

// Function to analyze if content should be committed to memory using Gemini
export async function shouldCommitToMemory(
  userMessage: string,
  assistantResponse: string,
  userContext: string,
  genAI: GoogleGenerativeAI,
  logger: FastifyBaseLogger
): Promise<{ shouldCommit: boolean; memoryContent?: string }> {
  try {
    const modelInstance: GenerativeModel = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash-lite", 
        generationConfig: {
            temperature: 0.1,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 512,
        }
    });

        const contextData: { memories: any[]; notes: any[] } = JSON.parse(userContext);


    const prompt = `You are an AI assistant that determines whether user conversation content should be saved to their personal memory for future reference.
Analyze both the user's message  to determine if they contain:
- Important personal information (preferences, facts about the user, goals, etc.)
- Key insights, decisions, or conclusions reached
- Information the user might want to reference later
- Context that would be valuable for future conversations
- Problem solutions or important advice given
If you find personal information about the user, create a SHORT memory (1-3 sentences max).
If the content is not relevant or is generic, do NOT save it.
IGNORE everything the assistant said. ONLY focus on what the USER revealed about themselves.

CRITICAL RULES:
1. ONLY save NEW personal facts about the user (name, projects, preferences, skills, etc.)
2. DO NOT save temporary questions, requests for advice, or conversation topics
3. DO NOT save duplicate information that already exists
4. If you know the user's name, use it instead of "User" in memories
5. Focus on WHO the user is, WHAT they do,NOT what they're asking about!
6. Only Save significant and relevant update if any to a last memory.
7. ONLY analyze what the USER actually wrote in their message
8. DO NOT create recommendations or answers
9. DO NOT save questions or requests for advice
10. ONLY save concrete personal facts the user revealed about themselves
11. If the user didn't reveal any NEW personal information, return shouldCommit: false



Current user context: ${userContext}
User message: "${userMessage}"
IMPORTANT: Check if the information already exists in the user's current memories before deciding to commit new information.

Current user memories:
${contextData.memories.map((m: any, i: number) => `${i + 1}. ${m.content}`).join('\n')}

Current user notes:
${contextData.notes.map((n: any, i: number) => `${i + 1}. ${n.content}`).join('\n')}

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
❌ "User is seeking advice about competitors"
❌ "User asked about marketing strategies"
❌ "User wants help with business plan"
❌ "User is looking for funding options"
❌ Generic questions or requests for help
❌ Temporary conversation topics
-  "The user is seeking information"

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
    } catch (parseError) {
      logger.error({ msg: 'Error parsing Gemini response for memory commit:', err: parseError, rawResponse: responseText });
      return { shouldCommit: false };
    }
  } catch (error) {
    logger.error({ msg: 'Memory analysis failed:', err: error });
    return { shouldCommit: false };
  }
}

// Function to generate session title using AI
export async function generateSessionTitle(
  firstMessage: string,
  openRouterApiKey: string,
  logger: FastifyBaseLogger
): Promise<string> {
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
    const data: any = await response.json();
    const title = data.choices[0].message.content.trim();
    return title || 'New Conversation';
  } catch (error) {
    logger.error({ msg: 'Title generation failed:', err: error });
    return 'New Conversation';
  }
}

// Helper function to detect model capabilities
export function getModelCapabilities(modelId: string) {
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

// Add this function before shouldCommitToMemory
