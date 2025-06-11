"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = defaultModelRoutes;
async function defaultModelRoutes(fastify, options) {
    const { supabase } = options;
    // GET /default-model - Get user's default model
    fastify.get('/default-model', async (request, reply) => {
        const userId = request.user.id;
        try {
            const { data, error } = await supabase
                .from('user_default_models')
                .select('model_id, created_at, updated_at')
                .eq('user_id', userId)
                .maybeSingle();
            if (error) {
                fastify.log.error({ msg: 'Error fetching default model', err: error, userId });
                return reply.code(500).send({ error: 'Failed to fetch default model' });
            }
            const response = {
                model_id: data?.model_id || null,
                created_at: data?.created_at,
                updated_at: data?.updated_at
            };
            reply.code(200).send(response);
        }
        catch (error) {
            fastify.log.error({ msg: 'Error in get default model route', err: error, userId });
            reply.code(500).send({ error: error.message });
        }
    });
    // POST/PUT /default-model - Set/Update user's default model
    fastify.post('/default-model', {
        schema: {
            body: {
                type: 'object',
                required: ['model_id'],
                properties: {
                    model_id: { type: 'string', minLength: 1 }
                }
            }
        }
    }, async (request, reply) => {
        const userId = request.user.id;
        const { model_id } = request.body;
        try {
            // Validate model_id format (optional - add your own validation)
            if (!model_id.trim()) {
                return reply.code(400).send({ error: 'model_id cannot be empty' });
            }
            // Use upsert to insert or update
            const { data, error } = await supabase
                .from('user_default_models')
                .upsert({
                user_id: userId,
                model_id: model_id.trim(),
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            })
                .select('model_id, created_at, updated_at')
                .single();
            if (error) {
                fastify.log.error({ msg: 'Error setting default model', err: error, userId, model_id });
                return reply.code(500).send({ error: 'Failed to set default model' });
            }
            fastify.log.info({ msg: 'Default model set successfully', userId, model_id });
            reply.code(200).send({
                message: 'Default model set successfully',
                model_id: data.model_id,
                created_at: data.created_at,
                updated_at: data.updated_at
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error in set default model route', err: error, userId });
            reply.code(500).send({ error: error.message });
        }
    });
    // PUT /default-model - Alternative update endpoint (same as POST)
    fastify.put('/default-model', {
        schema: {
            body: {
                type: 'object',
                required: ['model_id'],
                properties: {
                    model_id: { type: 'string', minLength: 1 }
                }
            }
        }
    }, async (request, reply) => {
        const userId = request.user.id;
        const { model_id } = request.body;
        try {
            if (!model_id.trim()) {
                return reply.code(400).send({ error: 'model_id cannot be empty' });
            }
            const { data, error } = await supabase
                .from('user_default_models')
                .upsert({
                user_id: userId,
                model_id: model_id.trim(),
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            })
                .select('model_id, created_at, updated_at')
                .single();
            if (error) {
                fastify.log.error({ msg: 'Error updating default model', err: error, userId, model_id });
                return reply.code(500).send({ error: 'Failed to update default model' });
            }
            fastify.log.info({ msg: 'Default model updated successfully', userId, model_id });
            reply.code(200).send({
                message: 'Default model updated successfully',
                model_id: data.model_id,
                created_at: data.created_at,
                updated_at: data.updated_at
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error in update default model route', err: error, userId });
            reply.code(500).send({ error: error.message });
        }
    });
    // DELETE /default-model - Remove user's default model
    fastify.delete('/default-model', async (request, reply) => {
        const userId = request.user.id;
        try {
            const { error } = await supabase
                .from('user_default_models')
                .delete()
                .eq('user_id', userId);
            if (error) {
                fastify.log.error({ msg: 'Error deleting default model', err: error, userId });
                return reply.code(500).send({ error: 'Failed to delete default model' });
            }
            fastify.log.info({ msg: 'Default model deleted successfully', userId });
            reply.code(200).send({
                message: 'Default model removed successfully'
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error in delete default model route', err: error, userId });
            reply.code(500).send({ error: error.message });
        }
    });
}
