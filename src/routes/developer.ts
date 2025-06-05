import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';

interface OAuthTokenBody {
  email?: string;
  password?: string;
  grant_type?: string; // For potential refresh token logic
  refresh_token?: string;
}

interface DeveloperProjectUsageBody {
  tokensUsed: number;
  requestsMade: number;
}

interface DeveloperProjectParams {
  id: string;
}

export default async function developerRoutes(fastify: FastifyInstance, options: { supabase: SupabaseClient }) {
  const { supabase } = options;

  // OAuth Token Endpoint (Password Grant)
  // Note: This route is typically excluded from JWT auth middleware.
  fastify.post('/oauth/token', async (request: FastifyRequest<{ Body: OAuthTokenBody }>, reply: FastifyReply) => {
    const { email, password, grant_type, refresh_token } = request.body;

    if (grant_type === 'refresh_token') {
        if (!refresh_token) {
            return reply.code(400).send({ error: 'Refresh token is required for grant_type "refresh_token"' });
        }
        try {
            const { data, error } = await supabase.auth.refreshSession({ refresh_token });
            if (error) throw error;
            if (!data.session) return reply.code(401).send({ error: 'Invalid refresh token' });
            
            return reply.code(200).send({
              accessToken: data.session.access_token,
              refreshToken: data.session.refresh_token, // Send back the new refresh token if it changed
              expiresIn: data.session.expires_in,
              tokenType: data.session.token_type,
            });
        } catch (error: any) {
            fastify.log.error({ msg: 'OAuth refresh token error', err: error });
            return reply.code(401).send({ error: 'Authentication failed', message: error.message });
        }
    } else { // Default to password grant
        if (!email || !password) {
            return reply.code(400).send({ error: 'Email and password are required for password grant type.' });
        }
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            if (!data.session) return reply.code(401).send({ error: 'Invalid credentials or user does not exist' });

            reply.code(200).send({
              accessToken: data.session.access_token,
              refreshToken: data.session.refresh_token,
              expiresIn: data.session.expires_in,
              tokenType: data.session.token_type,
              user: { id: data.user?.id, email: data.user?.email } // Include user info
            });
        } catch (error: any) {
            fastify.log.error({ msg: 'OAuth password grant error', err: error, email });
            reply.code(401).send({ error: 'Authentication failed', message: error.message });
        }
    }
  });

  // Developer Project Management
  fastify.get('/developers/me/projects', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id; // Assumes JWT auth middleware populates request.user
    try {
      const { data, error } = await supabase.from('developer_projects').select('*').eq('user_id', userId);
      if (error) throw error;
      reply.code(200).send(data);
    } catch (error: any) {
      fastify.log.error({ msg: 'Error fetching developer projects', err: error, userId });
      reply.code(500).send({ error: error.message });
    }
  });

  fastify.post(
    '/developers/projects/:id/usage',
    async (request: FastifyRequest<{ Params: DeveloperProjectParams, Body: DeveloperProjectUsageBody }>, reply: FastifyReply) => {
      const userId = request.user.id;
      const { id: projectId } = request.params;
      const { tokensUsed, requestsMade } = request.body;
      try {
        // Verify project ownership
        const { data: project, error: projectError } = await supabase
          .from('developer_projects')
          .select('id')
          .eq('id', projectId)
          .eq('user_id', userId)
          .single();

        if (projectError || !project) {
          return reply.code(404).send({ error: 'Project not found or not owned by user.' });
        }

        const { data, error } = await supabase
          .from('developer_project_usage')
          .insert([{ project_id: projectId, tokens_used: tokensUsed, requests_made: requestsMade }])
          .select();
        if (error) throw error;
        reply.code(201).send(data);
      } catch (error: any) {
        fastify.log.error({ msg: 'Error logging developer project usage', err: error, userId, projectId });
        reply.code(500).send({ error: error.message });
      }
    }
  );

  fastify.get('/developers/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    try {
      // This table 'developer_stats' might need specific queries or might be a summary view.
      const { data, error } = await supabase.from('developer_stats').select('*').eq('user_id', userId);
      if (error) throw error;
      reply.code(200).send(data);
    } catch (error: any) {
      fastify.log.error({ msg: 'Error fetching developer stats', err: error, userId });
      reply.code(500).send({ error: error.message });
    }
  });
}