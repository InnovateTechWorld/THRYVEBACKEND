import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { EncryptionUtils } from '../utils/encryption';

interface ExportedApiAdminParams {
  id: string;
}

interface ExportedApiAdminBody {
  name?: string;
  description?: string;
  export_type?: 'context' | 'session';
  session_id?: string;
  base_model?: string;
  allowed_models?: string[];
  rate_limit?: number;
  include_memories?: boolean;
  include_notes?: boolean;
  is_active?: boolean; // For PUT to update active status
}

// For POST (creation), some fields are mandatory
interface CreateExportedApiAdminBody {
  name: string;
  description?: string;
  export_type: 'context' | 'session';
  session_id?: string; // Required if export_type is 'session'
  base_model: string;
  allowed_models: string[];
  rate_limit: number;
  include_memories?: boolean;
  include_notes?: boolean;
}


export default async function adminRoutes(fastify: FastifyInstance, options: { supabase: SupabaseClient }) {
  const { supabase } = options;

  // Prefix all routes in this plugin with /api/admin
  // This will be done in server.ts when registering the plugin.

  // GET all exported APIs for the authenticated user
  fastify.get('/exported-apis', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.id;
    try {
      const { data, error } = await supabase
        .from('exported_apis')
        .select(`
          id, name, description, export_type, session_id, base_model, allowed_models,
          rate_limit, is_active, include_memories, include_notes, created_at, updated_at, api_key_hash
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const apisWithPreview = (data || []).map(api => ({
        ...api,
        api_key_preview: api.api_key_hash ? `${api.api_key_hash.substring(0, 8)}...` : 'N/A'
      }));
      reply.code(200).send(apisWithPreview);
    } catch (error: any) {
      fastify.log.error({ msg: 'Failed to fetch exported APIs for admin', err: error, userId });
      reply.code(500).send({ error: 'Failed to fetch exported APIs', details: error.message });
    }
  });

  // PUT (update) an exported API
  fastify.put(
    '/exported-apis/:id',
    async (request: FastifyRequest<{ Params: ExportedApiAdminParams, Body: ExportedApiAdminBody }>, reply: FastifyReply) => {
      const userId = request.user.id;
      const { id } = request.params;
      const updatePayload: { [key: string]: any } = { ...request.body, updated_at: new Date().toISOString() };

      // Remove undefined fields from payload to avoid overwriting with null
      Object.keys(updatePayload).forEach(key => updatePayload[key] === undefined && delete updatePayload[key]);


      try {
        const { data, error } = await supabase
          .from('exported_apis')
          .update(updatePayload)
          .eq('id', id)
          .eq('user_id', userId) // Ensure user owns this API
          .select()
          .single();

        if (error) throw error;
        if (!data) return reply.code(404).send({ error: 'API not found or not owned by user' });
        
        const apiWithPreview = {
            ...data,
            api_key_preview: data.api_key_hash ? `${data.api_key_hash.substring(0, 8)}...` : 'N/A'
        };
        reply.code(200).send(apiWithPreview);
      } catch (error: any) {
        fastify.log.error({ msg: 'Failed to update exported API for admin', err: error, userId, apiId: id });
        reply.code(500).send({ error: 'Failed to update exported API', details: error.message });
      }
    }
  );

  // DELETE an exported API
  fastify.delete(
    '/exported-apis/:id',
    async (request: FastifyRequest<{ Params: ExportedApiAdminParams }>, reply: FastifyReply) => {
      const userId = request.user.id;
      const { id } = request.params;
      try {
        const { error } = await supabase
          .from('exported_apis')
          .delete()
          .eq('id', id)
          .eq('user_id', userId); // Ensure user owns this API

        if (error) throw error;
        reply.code(204).send();
      } catch (error: any) {
        fastify.log.error({ msg: 'Failed to delete exported API for admin', err: error, userId, apiId: id });
        reply.code(500).send({ error: 'Failed to delete exported API', details: error.message });
      }
    }
  );

  // POST (create) a new exported API
  fastify.post(
    '/exported-apis',
    async (request: FastifyRequest<{ Body: CreateExportedApiAdminBody }>, reply: FastifyReply) => {
      const userId = request.user.id;
      const {
        name, description, export_type, session_id, base_model,
        allowed_models, rate_limit, include_memories, include_notes
      } = request.body;

      if (export_type === 'session' && !session_id) {
        return reply.code(400).send({ error: "session_id is required when export_type is 'session'" });
      }

      try {
        const apiKey = EncryptionUtils.generateApiKey();
        const hashedKey = EncryptionUtils.hashApiKey(apiKey);

        const { data, error } = await supabase
          .from('exported_apis')
          .insert({
            user_id: userId,
            name,
            description: description || '',
            api_key_hash: hashedKey,
            export_type,
            session_id: export_type === 'session' ? session_id : null,
            base_model,
            allowed_models,
            rate_limit,
            is_active: true, // Default to active
            include_memories: include_memories || false,
            include_notes: include_notes || false
          })
          .select()
          .single();

        if (error) throw error;

        reply.code(201).send({
          ...data,
          api_key: apiKey, // Only returned on creation
          api_key_preview: data.api_key_hash ? `${data.api_key_hash.substring(0, 8)}...` : 'N/A'
        });
      } catch (error: any) {
        fastify.log.error({ msg: 'Failed to create exported API for admin', err: error, userId });
        reply.code(500).send({ error: 'Failed to create exported API', details: error.message });
      }
    }
  );
}