import { FastifyInstance, FastifyRequest } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { fetch } from 'undici';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const openRouterApiKey = process.env.OPENROUTER_API_KEY as string;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Helper function to get model capabilities from OpenRouter
async function getModelCapabilities(modelId: string) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${openRouterApiKey}` },
    });
    const data: any = await response.json();
    
    const model = data.data.find((m: any) => m.id === modelId);
    if (!model) return null;

    const inputModalities = model.architecture?.input_modalities || ['text'];
    const outputModalities = model.architecture?.output_modalities || ['text'];
    
    return {
      supportsImages: inputModalities.includes('image'),
      supportsText: inputModalities.includes('text'),
      canGenerateImages: outputModalities.includes('image'),
      architecture: model.architecture
    };
  } catch (error) {
    console.error('Error fetching model capabilities:', error);
    return null;
  }
}

// Enhanced chat routes
export async function enhancedChatRoutes(fastify: FastifyInstance) {
  
  // Enhanced models endpoint with multimodal capabilities
  fastify.get('/models/enhanced', async (request: FastifyRequest, reply) => {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${openRouterApiKey}` },
      });
      const data: any = await response.json();
      
      const enhancedModels = data.data.map((model: any) => {
        const inputModalities = model.architecture?.input_modalities || ['text'];
        const outputModalities = model.architecture?.output_modalities || ['text'];
        
        const capabilities = {
          text: inputModalities.includes('text'),
          vision: inputModalities.includes('image'),
          audio: inputModalities.includes('audio'),
          video: inputModalities.includes('video'),
          textOutput: outputModalities.includes('text'),
          imageOutput: outputModalities.includes('image'),
          audioOutput: outputModalities.includes('audio')
        };

        let category = 'text';
        if (capabilities.imageOutput) category = 'image-generation';
        else if (capabilities.vision) category = 'multimodal';
        else if (capabilities.audio) category = 'audio';

        return {
          ...model,
          capabilities,
          category,
          input_modalities: inputModalities,
          output_modalities: outputModalities,
          is_multimodal: inputModalities.length > 1 || outputModalities.length > 1,
          architecture: model.architecture // Include full architecture for frontend
        };
      });
      
      reply.code(200).send({ 
        data: enhancedModels,
        summary: {
          total: enhancedModels.length,
          multimodal: enhancedModels.filter((m: any) => m.is_multimodal).length,
          vision_capable: enhancedModels.filter((m: any) => m.capabilities.vision).length,
          image_generation: enhancedModels.filter((m: any) => m.capabilities.imageOutput).length,
          text_only: enhancedModels.filter((m: any) => !m.is_multimodal).length
        }
      });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });

  // Enhanced chat endpoint with multimodal support
  fastify.post('/chat/enhanced', async (request: FastifyRequest, reply) => {
    const userId = (request as any).user.id;
    const { 
      session_id, 
      message, 
      model, 
      images = [], 
      files = [], 
      pdf_pages = [] 
    } = request.body as { 
      session_id?: string; 
      message: string; 
      model: string; 
      images?: string[]; 
      files?: any[]; 
      pdf_pages?: { page: number; image: string; filename: string }[] 
    };

    try {
      // Get model capabilities
      const capabilities = await getModelCapabilities(model);
      if (!capabilities) {
        return reply.code(400).send({ error: 'Model not found or unsupported' });
      }

      // Check if model supports the requested input types
      if (images.length > 0 && !capabilities.supportsImages) {
        return reply.code(400).send({ 
          error: 'This model does not support image inputs',
          model_capabilities: capabilities
        });
      }

      if (pdf_pages.length > 0 && !capabilities.supportsImages) {
        return reply.code(400).send({ 
          error: 'This model does not support PDF/image analysis',
          model_capabilities: capabilities
        });
      }

      // Get or create session
      let sessionId = session_id;
      if (!sessionId) {
        const { data: newSession, error: sessionError } = await supabase
          .from('chat_sessions')
          .insert([{ 
            user_id: userId, 
            title: message.substring(0, 50) + '...',
            model_used: model
          }])
          .select()
          .single();

        if (sessionError) throw sessionError;
        sessionId = newSession.id;
      }

      // Build multimodal message content
      const messageContent: any[] = [
        { type: 'text', text: message }
      ];

      // Add images if provided
      images.forEach(imageUrl => {
        messageContent.push({
          type: 'image_url',
          image_url: { url: imageUrl }
        });
      });

      // Add PDF pages as images with context
      pdf_pages.forEach(page => {
        messageContent.push({
          type: 'image_url',
          image_url: { url: page.image }
        });
      });

      // Get chat history
      const { data: history } = await supabase
        .from('chat_history')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      // Build messages array for OpenRouter
      const messages = [];
      
      // Add history
      if (history) {
        history.forEach(h => {
          if (h.role === 'user') {
            // Parse metadata for multimodal content
            const metadata = h.metadata || {};
            if (metadata.images || metadata.pdf_pages) {
              const content: any[] = [{ type: 'text', text: h.content }];
              
              if (metadata.images) {
                metadata.images.forEach((img: string) => {
                  content.push({
                    type: 'image_url',
                    image_url: { url: img }
                  });
                });
              }
              
              if (metadata.pdf_pages) {
                metadata.pdf_pages.forEach((page: any) => {
                  content.push({
                    type: 'image_url',
                    image_url: { url: page.image }
                  });
                });
              }
              
              messages.push({ role: 'user', content });
            } else {
              messages.push({ role: 'user', content: h.content });
            }
          } else {
            messages.push({ role: 'assistant', content: h.content });
          }
        });
      }

      // Add current message
      messages.push({
        role: 'user',
        content: messageContent.length === 1 ? message : messageContent
      });

      // Call OpenRouter API
      const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false
        }),
      });

      if (!openRouterResponse.ok) {
        const errorData = await openRouterResponse.json();
        throw new Error(`OpenRouter API error: ${openRouterResponse.status} - ${JSON.stringify(errorData)}`);
      }

      const responseData: any = await openRouterResponse.json();
      const assistantMessage = responseData.choices[0].message.content;

      // Store user message with metadata
      const userMetadata = {
        images: images.length > 0 ? images : undefined,
        pdf_pages: pdf_pages.length > 0 ? pdf_pages : undefined,
        files: files.length > 0 ? files : undefined,
        model_capabilities: capabilities
      };

      await supabase.from('chat_history').insert([{
        session_id: sessionId,
        user_id: userId,
        role: 'user',
        content: message,
        model: model,
        metadata: userMetadata
      }]);

      // Store assistant response
      await supabase.from('chat_history').insert([{
        session_id: sessionId,
        user_id: userId,
        role: 'assistant',
        content: assistantMessage,
        model: model,
        metadata: {
          model_used: responseData.model,
          usage: responseData.usage
        }
      }]);

      reply.code(200).send({
        session_id: sessionId,
        message: assistantMessage,
        model_used: responseData.model,
        usage: responseData.usage,
        capabilities_used: {
          multimodal: images.length > 0 || pdf_pages.length > 0,
          vision: images.length > 0 || pdf_pages.length > 0,
          pdf_analysis: pdf_pages.length > 0
        }
      });

    } catch (error: any) {
      fastify.log.error('Enhanced chat error:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // Image generation endpoint
  fastify.post('/chat/generate-image', async (request: FastifyRequest, reply) => {
    const userId = (request as any).user.id;
    const { 
      prompt, 
      model = 'black-forest-labs/flux-1.1-pro',
      session_id 
    } = request.body as { 
      prompt: string; 
      model?: string; 
      session_id?: string 
    };

    try {
      // Check if model can generate images
      const capabilities = await getModelCapabilities(model);
      if (!capabilities?.canGenerateImages) {
        return reply.code(400).send({ 
          error: 'This model cannot generate images',
          model_capabilities: capabilities
        });
      }

      // Call OpenRouter for image generation
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'user', content: prompt }
          ],
          max_tokens: 1000
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Image generation failed: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data: any = await response.json();
      const imageUrl = data.choices[0]?.message?.content;

      if (!imageUrl) {
        throw new Error('No image URL returned from model');
      }

      // Store generation record
      await supabase.from('image_generations').insert([{
        user_id: userId,
        session_id: session_id,
        prompt,
        model,
        image_url: imageUrl,
        metadata: {
          usage: data.usage,
          model_used: data.model
        }
      }]);

      // If session_id provided, add to chat history
      if (session_id) {
        await supabase.from('chat_history').insert([
          {
            session_id: session_id,
            user_id: userId,
            role: 'user',
            content: `Generate image: ${prompt}`,
            model: model,
            metadata: { type: 'image_generation_request' }
          },
          {
            session_id: session_id,
            user_id: userId,
            role: 'assistant',
            content: `Generated image: ${imageUrl}`,
            model: model,
            metadata: { 
              type: 'image_generation_response',
              image_url: imageUrl,
              usage: data.usage
            }
          }
        ]);
      }

      reply.code(200).send({
        image_url: imageUrl,
        prompt,
        model_used: data.model,
        session_id,
        usage: data.usage
      });

    } catch (error: any) {
      fastify.log.error('Image generation error:', error);
      reply.code(500).send({ error: error.message });
    }
  });

  // Get session with multimodal content
  fastify.get('/chat/session/:sessionId/enhanced', async (request: FastifyRequest, reply) => {
    const userId = (request as any).user.id;
    const { sessionId } = request.params as { sessionId: string };

    try {
      const { data: session, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

      if (sessionError) throw sessionError;

      const { data: history, error: historyError } = await supabase
        .from('chat_history')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (historyError) throw historyError;

      // Enhance history with multimodal indicators
      const enhancedHistory = history.map(h => ({
        ...h,
        has_images: h.metadata?.images?.length > 0,
        has_pdf_pages: h.metadata?.pdf_pages?.length > 0,
        is_image_generation: h.metadata?.type === 'image_generation_response',
        multimodal_content: h.metadata?.images || h.metadata?.pdf_pages || null
      }));

      reply.code(200).send({
        session,
        history: enhancedHistory,
        multimodal_summary: {
          total_messages: history.length,
          messages_with_images: history.filter(h => h.metadata?.images?.length > 0).length,
          messages_with_pdfs: history.filter(h => h.metadata?.pdf_pages?.length > 0).length,
          image_generations: history.filter(h => h.metadata?.type === 'image_generation_response').length
        }
      });

    } catch (error: any) {
      fastify.log.error('Get enhanced session error:', error);
      reply.code(500).send({ error: error.message });
    }
  });
}