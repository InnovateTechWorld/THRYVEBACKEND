"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = userContextRoutes;
async function userContextRoutes(fastify, options) {
    const { supabase } = options;
    // User Memory Management
    fastify.post('/memory', async (request, reply) => {
        const userId = request.user.id;
        const { content } = request.body;
        try {
            const { data, error } = await supabase.from('memory').insert([{ user_id: userId, content }]).select();
            if (error)
                throw error;
            reply.code(201).send(data);
        }
        catch (error) {
            fastify.log.error({ msg: 'Error creating memory', err: error, userId });
            reply.code(500).send({ error: error.message });
        }
    });
    fastify.get('/memory', async (request, reply) => {
        const userId = request.user.id;
        try {
            const { data, error } = await supabase.from('memory').select('*').eq('user_id', userId).order('created_at', { ascending: false });
            if (error)
                throw error;
            reply.code(200).send(data);
        }
        catch (error) {
            fastify.log.error({ msg: 'Error fetching memory', err: error, userId });
            reply.code(500).send({ error: error.message });
        }
    });
    fastify.delete('/memory/:id', async (request, reply) => {
        const userId = request.user.id;
        const { id } = request.params;
        try {
            const { error } = await supabase.from('memory').delete().eq('id', id).eq('user_id', userId);
            if (error)
                throw error;
            reply.code(204).send();
        }
        catch (error) {
            fastify.log.error({ msg: 'Error deleting memory', err: error, userId, memoryId: id });
            reply.code(500).send({ error: error.message });
        }
    });
    // User Notes Management
    fastify.post('/notes', async (request, reply) => {
        const userId = request.user.id;
        const { content } = request.body;
        try {
            const { data, error } = await supabase.from('notes').insert([{ user_id: userId, content }]).select();
            if (error)
                throw error;
            reply.code(201).send(data);
        }
        catch (error) {
            fastify.log.error({ msg: 'Error creating note', err: error, userId });
            reply.code(500).send({ error: error.message });
        }
    });
    fastify.get('/notes', async (request, reply) => {
        const userId = request.user.id;
        try {
            const { data, error } = await supabase.from('notes').select('*').eq('user_id', userId).order('created_at', { ascending: false });
            if (error)
                throw error;
            reply.code(200).send(data);
        }
        catch (error) {
            fastify.log.error({ msg: 'Error fetching notes', err: error, userId });
            reply.code(500).send({ error: error.message });
        }
    });
    fastify.delete('/notes/:id', async (request, reply) => {
        const userId = request.user.id;
        const { id } = request.params;
        try {
            const { error } = await supabase.from('notes').delete().eq('id', id).eq('user_id', userId);
            if (error)
                throw error;
            reply.code(204).send();
        }
        catch (error) {
            fastify.log.error({ msg: 'Error deleting note', err: error, userId, noteId: id });
            reply.code(500).send({ error: error.message });
        }
    });
    // System Prompt Management
    fastify.patch('/system-prompt', async (request, reply) => {
        const userId = request.user.id;
        const { prompt } = request.body;
        try {
            const { data, error } = await supabase.from('system_prompts').upsert({ user_id: userId, prompt }, { onConflict: 'user_id' }).select();
            if (error)
                throw error;
            reply.code(200).send(data);
        }
        catch (error) {
            fastify.log.error({ msg: 'Error updating system prompt', err: error, userId });
            reply.code(500).send({ error: error.message });
        }
    });
    // Add this missing GET endpoint
    fastify.get('/system-prompt', async (request, reply) => {
        const userId = request.user.id;
        try {
            const { data, error } = await supabase
                .from('system_prompts')
                .select('prompt')
                .eq('user_id', userId)
                .single();
            if (error && error.code !== 'PGRST116')
                throw error; // PGRST116 = no rows found
            reply.code(200).send({
                prompt: data?.prompt || 'You are a helpful AI assistant.'
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error fetching system prompt', err: error, userId });
            reply.code(500).send({ error: error.message });
        }
    });
}
