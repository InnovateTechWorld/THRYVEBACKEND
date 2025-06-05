import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { fetch } from 'undici';

export default async function modelRoutes(
  fastify: FastifyInstance,
  options: { openRouterApiKey: string }
) {
  const { openRouterApiKey } = options;

  fastify.get('/models', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${openRouterApiKey}` },
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
        created: model.created, // This might be a timestamp, ensure frontend handles it
        architecture: model.architecture,
        top_provider: model.top_provider,
        pricing: model.pricing,
        context_length: model.context_length,
        // These might not always exist, provide defaults or check
        supported_parameters: model.supported_parameters || [],
        per_request_limits: model.per_request_limits || {}
      }));

      reply.code(200).send({ data: formattedModels });
    } catch (error: any) {
      fastify.log.error({ msg: 'Error in /models route', err: error });
      reply.code(500).send({ error: error.message });
    }
  });
}