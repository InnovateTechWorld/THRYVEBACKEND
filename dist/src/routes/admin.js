"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = adminRoutes;
const encryption_1 = require("../utils/encryption");
const openRouterManager_1 = require("../lib/openRouterManager");
async function adminRoutes(fastify, options) {
    const { supabase, openRouterProvisioningKey } = options;
    // Prefix all routes in this plugin with /api/admin
    // This will be done in server.ts when registering the plugin.
    // GET all exported APIs for the authenticated user
    fastify.get('/exported-apis', async (request, reply) => {
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
            if (error)
                throw error;
            const apisWithPreview = (data || []).map(api => ({
                ...api,
                api_key_preview: api.api_key_hash ? `${api.api_key_hash.substring(0, 8)}...` : 'N/A'
            }));
            reply.code(200).send(apisWithPreview);
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed to fetch exported APIs for admin', err: error, userId });
            reply.code(500).send({ error: 'Failed to fetch exported APIs', details: error.message });
        }
    });
    // PUT (update) an exported API
    fastify.put('/exported-apis/:id', async (request, reply) => {
        const userId = request.user.id;
        const { id } = request.params;
        const updatePayload = { ...request.body, updated_at: new Date().toISOString() };
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
            if (error)
                throw error;
            if (!data)
                return reply.code(404).send({ error: 'API not found or not owned by user' });
            const apiWithPreview = {
                ...data,
                api_key_preview: data.api_key_hash ? `${data.api_key_hash.substring(0, 8)}...` : 'N/A'
            };
            reply.code(200).send(apiWithPreview);
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed to update exported API for admin', err: error, userId, apiId: id });
            reply.code(500).send({ error: 'Failed to update exported API', details: error.message });
        }
    });
    // DELETE an exported API
    fastify.delete('/exported-apis/:id', async (request, reply) => {
        const userId = request.user.id;
        const { id } = request.params;
        try {
            const { error } = await supabase
                .from('exported_apis')
                .delete()
                .eq('id', id)
                .eq('user_id', userId); // Ensure user owns this API
            if (error)
                throw error;
            reply.code(204).send();
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed to delete exported API for admin', err: error, userId, apiId: id });
            reply.code(500).send({ error: 'Failed to delete exported API', details: error.message });
        }
    });
    // POST (create) a new exported API
    fastify.post('/exported-apis', async (request, reply) => {
        const userId = request.user.id;
        const { name, description, export_type, session_id, base_model, allowed_models, rate_limit, include_memories, include_notes } = request.body;
        if (export_type === 'session' && !session_id) {
            return reply.code(400).send({ error: "session_id is required when export_type is 'session'" });
        }
        try {
            const apiKey = encryption_1.EncryptionUtils.generateApiKey();
            const hashedKey = encryption_1.EncryptionUtils.hashApiKey(apiKey);
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
            if (error)
                throw error;
            reply.code(201).send({
                ...data,
                api_key: apiKey, // Only returned on creation
                api_key_preview: data.api_key_hash ? `${data.api_key_hash.substring(0, 8)}...` : 'N/A'
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed to create exported API for admin', err: error, userId });
            reply.code(500).send({ error: 'Failed to create exported API', details: error.message });
        }
    });
    // ============ OpenRouter Admin Routes ============
    // GET /openrouter/users - List all users with OpenRouter keys
    fastify.get('/openrouter/users', async (request, reply) => {
        const userId = request.user.id;
        try {
            const { data, error } = await supabase
                .from('user_openrouter_keys')
                .select(`
          user_id,
          openrouter_credits,
          is_active,
          created_at,
          updated_at,
          profiles!inner(email, full_name)
        `)
                .order('created_at', { ascending: false });
            if (error)
                throw error;
            const usersWithStats = (data || []).map(user => {
                // Handle profiles relationship - it might be an array or single object
                const profile = Array.isArray(user.profiles) ? user.profiles[0] : user.profiles;
                return {
                    user_id: user.user_id,
                    email: profile?.email || 'N/A',
                    full_name: profile?.full_name || 'N/A',
                    openrouter_credits: user.openrouter_credits,
                    is_active: user.is_active,
                    created_at: user.created_at,
                    updated_at: user.updated_at
                };
            });
            reply.code(200).send(usersWithStats);
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed to fetch OpenRouter users for admin', err: error, userId });
            reply.code(500).send({ error: 'Failed to fetch OpenRouter users', details: error.message });
        }
    });
    // POST /openrouter/users/:userId/allocate - Allocate credits to user
    fastify.post('/openrouter/users/:userId/allocate', async (request, reply) => {
        const adminUserId = request.user.id;
        const { userId } = request.params;
        const { credits, source, reference } = request.body;
        if (!credits || credits <= 0) {
            return reply.code(400).send({ error: 'Credits must be a positive number' });
        }
        try {
            const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
            const result = await openRouterManager.allocateCreditsToUser(userId, credits, source || 'admin_allocation', reference || `admin_${adminUserId}_${Date.now()}`, supabase, fastify.log);
            if (!result.success) {
                return reply.code(400).send({
                    error: 'Failed to allocate credits',
                    details: result.error?.message
                });
            }
            reply.code(200).send({
                message: 'Credits allocated successfully',
                user_id: userId,
                credits_allocated: credits,
                new_total: result.data?.newTotal
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed to allocate credits for admin', err: error, adminUserId, userId });
            reply.code(500).send({ error: 'Failed to allocate credits', details: error.message });
        }
    });
    // PUT /openrouter/users/:userId/limit - Update credit limit
    fastify.put('/openrouter/users/:userId/limit', async (request, reply) => {
        const adminUserId = request.user.id;
        const { userId } = request.params;
        const { limit } = request.body;
        if (!limit || limit < 0) {
            return reply.code(400).send({ error: 'Limit must be a non-negative number' });
        }
        try {
            const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
            const result = await openRouterManager.updateUserKeyLimit(userId, limit, supabase, fastify.log);
            if (!result.success) {
                return reply.code(400).send({
                    error: 'Failed to update credit limit',
                    details: result.error?.message
                });
            }
            reply.code(200).send({
                message: 'Credit limit updated successfully',
                user_id: userId,
                new_limit: limit
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed to update credit limit for admin', err: error, adminUserId, userId });
            reply.code(500).send({ error: 'Failed to update credit limit', details: error.message });
        }
    });
    // POST /openrouter/users/:userId/sync - Force sync usage
    fastify.post('/openrouter/users/:userId/sync', async (request, reply) => {
        const adminUserId = request.user.id;
        const { userId } = request.params;
        try {
            const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
            const result = await openRouterManager.syncUserCredits(userId, supabase, fastify.log);
            if (!result.success) {
                return reply.code(400).send({
                    error: 'Failed to sync user credits',
                    details: result.error?.message
                });
            }
            reply.code(200).send({
                message: 'User credits synced successfully',
                user_id: userId,
                usage_info: result.data
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed to sync user credits for admin', err: error, adminUserId, userId });
            reply.code(500).send({ error: 'Failed to sync user credits', details: error.message });
        }
    });
    // PUT /openrouter/users/:userId/disable - Disable user key
    fastify.put('/openrouter/users/:userId/disable', async (request, reply) => {
        const adminUserId = request.user.id;
        const { userId } = request.params;
        try {
            const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
            const result = await openRouterManager.disableUserApiKey(userId, supabase, fastify.log);
            if (!result.success) {
                return reply.code(400).send({
                    error: 'Failed to disable user key',
                    details: result.error?.message
                });
            }
            reply.code(200).send({
                message: 'User OpenRouter key disabled successfully',
                user_id: userId
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed to disable user key for admin', err: error, adminUserId, userId });
            reply.code(500).send({ error: 'Failed to disable user key', details: error.message });
        }
    });
    // PUT /openrouter/users/:userId/enable - Enable user key (reactivate)
    fastify.put('/openrouter/users/:userId/enable', async (request, reply) => {
        const adminUserId = request.user.id;
        const { userId } = request.params;
        try {
            // Update database to reactivate the key
            const { data, error } = await supabase
                .from('user_openrouter_keys')
                .update({
                is_active: true,
                updated_at: new Date().toISOString()
            })
                .eq('user_id', userId)
                .select()
                .single();
            if (error)
                throw error;
            if (!data)
                return reply.code(404).send({ error: 'User OpenRouter key not found' });
            reply.code(200).send({
                message: 'User OpenRouter key enabled successfully',
                user_id: userId
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed to enable user key for admin', err: error, adminUserId, userId });
            reply.code(500).send({ error: 'Failed to enable user key', details: error.message });
        }
    });
    // DELETE /openrouter/users/:userId/key - Delete user key
    fastify.delete('/openrouter/users/:userId/key', async (request, reply) => {
        const adminUserId = request.user.id;
        const { userId } = request.params;
        try {
            // Get key hash first for OpenRouter deletion
            const { data: keyData, error: fetchError } = await supabase
                .from('user_openrouter_keys')
                .select('openrouter_key_hash')
                .eq('user_id', userId)
                .single();
            if (fetchError || !keyData) {
                return reply.code(404).send({ error: 'User OpenRouter key not found' });
            }
            const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
            // Delete from OpenRouter
            const deleteResult = await openRouterManager.deleteUserApiKey(keyData.openrouter_key_hash, fastify.log);
            // Delete from database regardless of OpenRouter result (cleanup)
            const { error: dbError } = await supabase
                .from('user_openrouter_keys')
                .delete()
                .eq('user_id', userId);
            if (dbError)
                throw dbError;
            reply.code(200).send({
                message: 'User OpenRouter key deleted successfully',
                user_id: userId,
                openrouter_deletion: deleteResult.success ? 'successful' : 'failed'
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed to delete user key for admin', err: error, adminUserId, userId });
            reply.code(500).send({ error: 'Failed to delete user key', details: error.message });
        }
    });
    // ============ Bulk Operations ============
    // POST /openrouter/bulk/allocate - Bulk credit allocation
    fastify.post('/openrouter/bulk/allocate', async (request, reply) => {
        const adminUserId = request.user.id;
        const { userIds, credits, source, reference } = request.body;
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return reply.code(400).send({ error: 'userIds must be a non-empty array' });
        }
        if (!credits || credits <= 0) {
            return reply.code(400).send({ error: 'Credits must be a positive number' });
        }
        try {
            const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
            const results = [];
            const errors = [];
            for (const userId of userIds) {
                try {
                    const result = await openRouterManager.allocateCreditsToUser(userId, credits, source || 'bulk_admin_allocation', reference || `bulk_admin_${adminUserId}_${Date.now()}`, supabase, fastify.log);
                    if (result.success) {
                        results.push({
                            user_id: userId,
                            status: 'success',
                            credits_allocated: credits,
                            new_total: result.data?.newTotal
                        });
                    }
                    else {
                        errors.push({
                            user_id: userId,
                            status: 'failed',
                            error: result.error?.message || 'Unknown error'
                        });
                    }
                }
                catch (error) {
                    errors.push({
                        user_id: userId,
                        status: 'failed',
                        error: error.message
                    });
                }
            }
            reply.code(200).send({
                message: 'Bulk credit allocation completed',
                total_users: userIds.length,
                successful: results.length,
                failed: errors.length,
                results,
                errors
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed bulk credit allocation for admin', err: error, adminUserId });
            reply.code(500).send({ error: 'Failed bulk credit allocation', details: error.message });
        }
    });
    // POST /openrouter/bulk/sync - Bulk usage sync
    fastify.post('/openrouter/bulk/sync', async (request, reply) => {
        const adminUserId = request.user.id;
        const { userIds } = request.body;
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return reply.code(400).send({ error: 'userIds must be a non-empty array' });
        }
        try {
            const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
            const results = [];
            const errors = [];
            for (const userId of userIds) {
                try {
                    const result = await openRouterManager.syncUserCredits(userId, supabase, fastify.log);
                    if (result.success) {
                        results.push({
                            user_id: userId,
                            status: 'success',
                            usage_info: result.data
                        });
                    }
                    else {
                        errors.push({
                            user_id: userId,
                            status: 'failed',
                            error: result.error?.message || 'Unknown error'
                        });
                    }
                }
                catch (error) {
                    errors.push({
                        user_id: userId,
                        status: 'failed',
                        error: error.message
                    });
                }
            }
            reply.code(200).send({
                message: 'Bulk usage sync completed',
                total_users: userIds.length,
                successful: results.length,
                failed: errors.length,
                results,
                errors
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed bulk usage sync for admin', err: error, adminUserId });
            reply.code(500).send({ error: 'Failed bulk usage sync', details: error.message });
        }
    });
    // POST /openrouter/bulk/disable - Bulk disable keys
    fastify.post('/openrouter/bulk/disable', async (request, reply) => {
        const adminUserId = request.user.id;
        const { userIds } = request.body;
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return reply.code(400).send({ error: 'userIds must be a non-empty array' });
        }
        try {
            const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
            const results = [];
            const errors = [];
            for (const userId of userIds) {
                try {
                    const result = await openRouterManager.disableUserApiKey(userId, supabase, fastify.log);
                    if (result.success) {
                        results.push({
                            user_id: userId,
                            status: 'success',
                            message: 'Key disabled successfully'
                        });
                    }
                    else {
                        errors.push({
                            user_id: userId,
                            status: 'failed',
                            error: result.error?.message || 'Unknown error'
                        });
                    }
                }
                catch (error) {
                    errors.push({
                        user_id: userId,
                        status: 'failed',
                        error: error.message
                    });
                }
            }
            reply.code(200).send({
                message: 'Bulk disable operation completed',
                total_users: userIds.length,
                successful: results.length,
                failed: errors.length,
                results,
                errors
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Failed bulk disable operation for admin', err: error, adminUserId });
            reply.code(500).send({ error: 'Failed bulk disable operation', details: error.message });
        }
    });
}
