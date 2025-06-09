import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { fetch } from 'undici';
import { OpenRouterManager } from '../lib/openRouterManager';

export default async function modelRoutes(
  fastify: FastifyInstance,
  options: { 
    openRouterProvisioningKey: string,
    supabase: SupabaseClient 
  }
) {
  const { openRouterProvisioningKey, supabase } = options;
  const openRouterManager = new OpenRouterManager(openRouterProvisioningKey);

  fastify.get('/models', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user.id;
      const apiKeyResponse = await openRouterManager.getUserApiKey(userId, supabase, fastify.log);

      if (!apiKeyResponse.success || !apiKeyResponse.data) {
        throw new Error('Failed to get OpenRouter key');
      }

      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKeyResponse.data}` },
      });

      if (!response.ok) {
        const errorText = await response.text();
        fastify.log.error({ msg: 'Failed to fetch models from OpenRouter', status: response.status, error: errorText });
        return reply.code(response.status).send({ error: 'Failed to fetch models from OpenRouter', details: errorText });
      }

      const data: any = await response.json();

      const formattedModels = data.data.map((model: any) => ({
        id: model.id,
        name: model.name,
        description: model.description,
        created: model.created,
        architecture: model.architecture,
        top_provider: model.top_provider,
        pricing: model.pricing,
        context_length: model.context_length,
        supported_parameters: model.supported_parameters || [],
        per_request_limits: model.per_request_limits || {}
      }));

      reply.code(200).send({ data: formattedModels });
    } catch (error: any) {
      fastify.log.error({ msg: 'Error in /models route', err: error });
      reply.code(500).send({ error: error.message });
    }
  });

  // Add this endpoint after your existing /models endpoint:

// Get available free models
fastify.get('/models/free', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const userId = request.user.id;
    const apiKeyResponse = await openRouterManager.getUserApiKey(userId, supabase, fastify.log);

    // Get free models using user's key if available, otherwise use provisioning key
    const userApiKey = apiKeyResponse.success ? apiKeyResponse.data : undefined;
    const freeModels = await openRouterManager.getAvailableFreeModels(userApiKey, fastify.log);
    
    // Format as model objects
    const formattedFreeModels = freeModels.map(modelId => ({
      id: modelId,
      name: modelId.replace(':free', '').replace(/[/-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: 'Free tier model - no credits required',
      created: null,
      architecture: null,
      top_provider: null,
      pricing: { 
        completion: '0', 
        prompt: '0' 
      },
      context_length: 4096, // Default, could be enhanced with actual data
      supported_parameters: [],
      per_request_limits: {},
      is_free: true
    }));

    reply.code(200).send({ 
      data: formattedFreeModels,
      total: formattedFreeModels.length,
      pattern: 'Models ending with ":free" don\'t require credits'
    });

  } catch (error: any) {
    fastify.log.error({ msg: 'Error fetching free models', err: error });
    reply.code(500).send({ error: error.message });
  }
});
}
