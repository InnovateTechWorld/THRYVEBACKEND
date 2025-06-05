import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';

export default async function dashboardRoutes(fastify: FastifyInstance, options: { supabase: SupabaseClient }) {
  const { supabase } = options;

  fastify.get('/dashboard/apps', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    try {
      const { data, error } = await supabase.from('apps_connected').select('*').eq('user_id', userId);
      if (error) throw error;
      reply.code(200).send(data || []);
    } catch (error: any) {
      fastify.log.error({ msg: 'Error fetching dashboard apps', err: error, userId });
      reply.code(500).send({ error: error.message });
    }
  });

  // Update the /dashboard/usage route in dashboard.ts
fastify.get('/dashboard/usage', async (request: FastifyRequest, reply: FastifyReply) => {
  const userId = request.user.id;
  try {
    const { data: allUsage, error: usageError } = await supabase
      .from('api_usage')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (usageError) throw usageError;

    const { data: apis, error: apisError } = await supabase
      .from('exported_apis')
      .select('id, name, api_key_hash, export_type')
      .eq('user_id', userId)
      .eq('is_active', true); // Add this filter

    if (apisError) throw apisError;

    const internalChatUsage = (allUsage || []).filter(usage => usage.api_key_hash === 'internal-chat');
    const apiKeyUsage = (allUsage || []).filter(usage => usage.api_key_hash !== 'internal-chat');


    const usageByApi = (apis || []).map(api => {
      const apiUsage = (allUsage || []).filter(usage => usage.api_key_hash === api.api_key_hash);
      const totalRequests = apiUsage.length;
      const totalTokens = apiUsage.reduce((sum, record) => sum + (record.total_tokens || 0), 0);
      
      return {
        apiId: api.id,
        apiName: api.name,
        exportType: api.export_type,
        totalRequests,
        totalTokens,
        lastUsed: apiUsage.length > 0 ? apiUsage[0].created_at : null
      };
    });

     if (internalChatUsage.length > 0) {
      usageByApi.unshift({
        apiId: 'internal-chat',
        apiName: 'Internal Chat',
        exportType: 'chat',
        totalRequests: internalChatUsage.length,
        totalTokens: internalChatUsage.reduce((sum, record) => sum + (record.total_tokens || 0), 0),
        lastUsed: internalChatUsage[0].created_at
      });}



    const totalRequests = (allUsage || []).length;
    const totalTokens = (allUsage || []).reduce((sum, record) => sum + (record.total_tokens || 0), 0);

    reply.code(200).send({
      overview: {
        total_requests: totalRequests,      // Changed to snake_case
        total_tokens: totalTokens,          // Changed to snake_case
        total_api_keys: apis?.length || 0   // Changed name to match frontend
      },
      usageByApi,
      recentActivity: (allUsage || []).slice(0, 20)
    });
  } catch (error: any) {
    fastify.log.error({ msg: 'Dashboard usage error:', err: error, userId });
    reply.code(500).send({ error: error.message });
  }
});

  fastify.get('/dashboard/tokens', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    try {
      const { data, error } = await supabase.from('token_logs').select('*').eq('user_id', userId);
      if (error) throw error;
      reply.code(200).send(data || []);
    } catch (error: any) {
      fastify.log.error({ msg: 'Error fetching dashboard tokens', err: error, userId });
      reply.code(500).send({ error: error.message });
    }
  });
}