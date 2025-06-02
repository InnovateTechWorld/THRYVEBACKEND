import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import { EncryptionUtils } from '../utils/encryption';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

interface CreateExportedApiRequest {
  name: string;
  description?: string;
  export_type: 'context' | 'session';
  session_id?: string;
  base_model?: string;
  allowed_models?: string[];
  rate_limit?: number;
  expires_at?: string;
  include_memories?: boolean;
  include_notes?: boolean;
}

interface UpdateExportedApiRequest {
  name?: string;
  description?: string;
  base_model?: string;
  allowed_models?: string[];
  rate_limit?: number;
  expires_at?: string;
  is_active?: boolean;
}

export async function adminExportedApiRoutes(fastify: FastifyInstance) {
  // Middleware to verify user authentication
  async function verifyAuth(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing authorization header' });
    }

    const token = authHeader.substring(7);
    
    // Verify with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    (request as any).user = user;
  }

  // Create a new exported API
  fastify.post<{
    Body: CreateExportedApiRequest;
  }>('/api/admin/exported-apis', {
    preHandler: verifyAuth
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      const {
        name,
        description,
        export_type,
        session_id,
        base_model,
        allowed_models,
        rate_limit = 100,
        expires_at
      } = request.body;

      // Validate session_id if export_type is 'session'
      if (export_type === 'session') {
        if (!session_id) {
          return reply.status(400).send({ error: 'session_id is required for session export type' });
        }

        // Verify user owns the session
        const { data: session, error: sessionError } = await supabase
          .from('chat_sessions')
          .select('id')
          .eq('id', session_id)
          .eq('user_id', user.id)
          .single();

        if (sessionError || !session) {
          return reply.status(400).send({ error: 'Session not found or not owned by user' });
        }
      }

      // Generate API key
      const apiKey = EncryptionUtils.generateApiKey();
      const hashedKey = EncryptionUtils.hashApiKey(apiKey);

      // Create exported API record
      const { data: exportedApi, error } = await supabase
        .from('exported_apis')
        .insert({
          user_id: user.id,
          name,
          description,
          api_key_hash: hashedKey,
          export_type,
          session_id: export_type === 'session' ? session_id : null,
          base_model,
          allowed_models,
          rate_limit,
          expires_at: expires_at ? new Date(expires_at).toISOString() : null
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating exported API:', error);
        return reply.status(500).send({ error: 'Failed to create exported API' });
      }

      // Return the API key only once (it won't be stored in plain text)
      return reply.send({
        ...exportedApi,
        api_key: apiKey // Only returned on creation
      });
    } catch (error) {
      console.error('Create exported API error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get all exported APIs for the user
  fastify.get('/api/admin/exported-apis', {
    preHandler: verifyAuth
  }, async (request, reply) => {
    try {
      const user = (request as any).user;

      const { data: exportedApis, error } = await supabase
        .from('exported_apis')
        .select(`
          *,
          chat_sessions (
            id,
            name
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching exported APIs:', error);
        return reply.status(500).send({ error: 'Failed to fetch exported APIs' });
      }

      // Remove sensitive data
      const sanitizedApis = exportedApis.map(api => ({
        ...api,
        api_key_hash: undefined, // Don't expose hash
        api_key_preview: api.api_key_hash ? `sk-${api.api_key_hash.substring(0, 8)}...` : null
      }));

      return reply.send(sanitizedApis);
    } catch (error) {
      console.error('Get exported APIs error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get specific exported API
  fastify.get<{
    Params: { id: string };
  }>('/api/admin/exported-apis/:id', {
    preHandler: verifyAuth
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      const { id } = request.params;

      const { data: exportedApi, error } = await supabase
        .from('exported_apis')
        .select(`
          *,
          chat_sessions (
            id,
            name
          )
        `)
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error || !exportedApi) {
        return reply.status(404).send({ error: 'Exported API not found' });
      }

      // Remove sensitive data
      const sanitizedApi = {
        ...exportedApi,
        api_key_hash: undefined,
        api_key_preview: exportedApi.api_key_hash ? `sk-${exportedApi.api_key_hash.substring(0, 8)}...` : null
      };

      return reply.send(sanitizedApi);
    } catch (error) {
      console.error('Get exported API error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Update exported API
  fastify.put<{
    Params: { id: string };
    Body: UpdateExportedApiRequest;
  }>('/api/admin/exported-apis/:id', {
    preHandler: verifyAuth
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      const { id } = request.params;
      const updates = request.body;

      // Verify ownership
      const { data: existing, error: fetchError } = await supabase
        .from('exported_apis')
        .select('id')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !existing) {
        return reply.status(404).send({ error: 'Exported API not found' });
      }

      // Prepare update data
      const updateData: any = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      if (updates.expires_at) {
        updateData.expires_at = new Date(updates.expires_at).toISOString();
      }

      const { data: updatedApi, error } = await supabase
        .from('exported_apis')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating exported API:', error);
        return reply.status(500).send({ error: 'Failed to update exported API' });
      }

      return reply.send(updatedApi);
    } catch (error) {
      console.error('Update exported API error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Delete exported API
  fastify.delete<{
    Params: { id: string };
  }>('/api/admin/exported-apis/:id', {
    preHandler: verifyAuth
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      const { id } = request.params;

      const { error } = await supabase
        .from('exported_apis')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting exported API:', error);
        return reply.status(500).send({ error: 'Failed to delete exported API' });
      }

      return reply.send({ message: 'Exported API deleted successfully' });
    } catch (error) {
      console.error('Delete exported API error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Get API usage statistics
  fastify.get<{
    Params: { id: string };
    Querystring: { 
      start_date?: string;
      end_date?: string;
      limit?: number;
    };
  }>('/api/admin/exported-apis/:id/usage', {
    preHandler: verifyAuth
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      const { id } = request.params;
      const { start_date, end_date, limit = 100 } = request.query;

      // Verify ownership
      const { data: exportedApi, error: fetchError } = await supabase
        .from('exported_apis')
        .select('api_key_hash')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !exportedApi) {
        return reply.status(404).send({ error: 'Exported API not found' });
      }

      // Build query
      let query = supabase
        .from('api_usage')
        .select('*')
        .eq('api_key_hash', exportedApi.api_key_hash)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (start_date) {
        query = query.gte('created_at', new Date(start_date).toISOString());
      }

      if (end_date) {
        query = query.lte('created_at', new Date(end_date).toISOString());
      }

      const { data: usage, error } = await query;

      if (error) {
        console.error('Error fetching API usage:', error);
        return reply.status(500).send({ error: 'Failed to fetch API usage' });
      }

      // Calculate summary statistics
      const summary = {
        total_requests: usage.length,
        total_tokens: usage.reduce((sum, u) => sum + (u.total_tokens || 0), 0),
        total_prompt_tokens: usage.reduce((sum, u) => sum + (u.prompt_tokens || 0), 0),
        total_completion_tokens: usage.reduce((sum, u) => sum + (u.completion_tokens || 0), 0),
        models_used: [...new Set(usage.map(u => u.model_used))],
        request_types: [...new Set(usage.map(u => u.request_type))]
      };

      return reply.send({
        summary,
        usage: usage.map(u => ({
          ...u,
          api_key_hash: undefined // Don't expose hash
        }))
      });
    } catch (error) {
      console.error('Get API usage error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Regenerate API key
  fastify.post<{
    Params: { id: string };
  }>('/api/admin/exported-apis/:id/regenerate-key', {
    preHandler: verifyAuth
  }, async (request, reply) => {
    try {
      const user = (request as any).user;
      const { id } = request.params;

      // Verify ownership
      const { data: existing, error: fetchError } = await supabase
        .from('exported_apis')
        .select('id')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !existing) {
        return reply.status(404).send({ error: 'Exported API not found' });
      }

      // Generate new API key
      const newApiKey = EncryptionUtils.generateApiKey();
      const newHashedKey = EncryptionUtils.hashApiKey(newApiKey);

      const { data: updatedApi, error } = await supabase
        .from('exported_apis')
        .update({
          api_key_hash: newHashedKey,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error regenerating API key:', error);
        return reply.status(500).send({ error: 'Failed to regenerate API key' });
      }

      return reply.send({
        ...updatedApi,
        api_key: newApiKey // Return new key only once
      });
    } catch (error) {
      console.error('Regenerate API key error:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}