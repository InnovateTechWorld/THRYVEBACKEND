"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = analyticsRoutes;
async function analyticsRoutes(fastify, options) {
    const { supabase } = options;
    // Get overall API usage analytics for the authenticated user
    fastify.get('/api/usage/analytics', async (request, reply) => {
        const userId = request.user.id;
        try {
            const { data: usageData, error: usageError } = await supabase
                .from('api_usage')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            if (usageError)
                throw usageError;
            if (!usageData)
                return reply.send({ summary: {}, modelUsage: {}, dailyUsage: {}, recentActivity: [] });
            const totalRequests = usageData.length;
            const totalTokens = usageData.reduce((sum, record) => sum + (record.total_tokens || 0), 0);
            const totalPromptTokens = usageData.reduce((sum, record) => sum + (record.prompt_tokens || 0), 0);
            const totalCompletionTokens = usageData.reduce((sum, record) => sum + (record.completion_tokens || 0), 0);
            const modelUsage = usageData.reduce((acc, record) => {
                const model = record.model_used || 'unknown';
                if (!acc[model]) {
                    acc[model] = {
                        requests: 0,
                        tokens: 0,
                        prompt_tokens: 0,
                        completion_tokens: 0
                    };
                }
                acc[model].requests += 1;
                acc[model].tokens += record.total_tokens || 0;
                acc[model].prompt_tokens += record.prompt_tokens || 0;
                acc[model].completion_tokens += record.completion_tokens || 0;
                return acc;
            }, {});
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const recentUsage = usageData.filter(record => new Date(record.created_at) >= thirtyDaysAgo);
            const dailyUsage = recentUsage.reduce((acc, record) => {
                const date = new Date(record.created_at).toISOString().split('T')[0];
                if (!acc[date]) {
                    acc[date] = { requests: 0, tokens: 0 };
                }
                acc[date].requests += 1;
                acc[date].tokens += record.total_tokens || 0;
                return acc;
            }, {});
            reply.code(200).send({
                summary: {
                    total_requests: totalRequests, // snake_case to match frontend
                    total_tokens: totalTokens, // snake_case to match frontend
                    prompt_tokens: totalPromptTokens, // snake_case to match frontend
                    completion_tokens: totalCompletionTokens // snake_case to match frontend
                },
                modelUsage,
                dailyUsage,
                recentActivity: usageData.slice(0, 50)
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Usage analytics error', err: error, userId });
            reply.code(500).send({ error: error.message });
        }
    });
    fastify.get('/api/usage/analytics/internal-chat', async (request, reply) => {
        const userId = request.user.id;
        try {
            fastify.log.info({ msg: 'Analytics query for internal chat', userId });
            const { data: allUsage, error: usageError } = await supabase
                .from('api_usage')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            if (usageError)
                throw usageError;
            // FIX: Filter by request_type instead of api_key_hash
            const internalChatUsage = (allUsage || []).filter(usage => usage.request_type === '/chat/message');
            fastify.log.info({
                msg: 'Internal chat filtering result',
                userId,
                totalRecords: allUsage?.length || 0,
                internalChatRecords: internalChatUsage.length,
                sampleInternalChat: internalChatUsage.slice(0, 3)
            });
            // Calculate summary statistics
            const totalRequests = internalChatUsage.length;
            const totalTokens = internalChatUsage.reduce((sum, record) => sum + (record.total_tokens || 0), 0);
            const totalPromptTokens = internalChatUsage.reduce((sum, record) => sum + (record.prompt_tokens || 0), 0);
            const totalCompletionTokens = internalChatUsage.reduce((sum, record) => sum + (record.completion_tokens || 0), 0);
            const avgResponseTime = internalChatUsage.length > 0
                ? internalChatUsage.reduce((sum, record) => sum + (record.response_time_ms || 0), 0) / internalChatUsage.length
                : 0;
            // Calculate hourly usage (last 24 hours)
            const twentyFourHoursAgo = new Date();
            twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
            const recentUsage = internalChatUsage.filter(record => new Date(record.created_at) >= twentyFourHoursAgo);
            const hourlyUsage = recentUsage.reduce((acc, record) => {
                const hour = new Date(record.created_at).toISOString().slice(0, 13) + ':00:00';
                if (!acc[hour]) {
                    acc[hour] = { requests: 0, tokens: 0 };
                }
                acc[hour].requests += 1;
                acc[hour].tokens += record.total_tokens || 0;
                return acc;
            }, {});
            reply.code(200).send({
                apiInfo: {
                    id: 'internal-chat',
                    name: 'Internal Chat',
                    type: 'chat'
                },
                summary: {
                    total_requests: totalRequests,
                    total_tokens: totalTokens,
                    prompt_tokens: totalPromptTokens,
                    completion_tokens: totalCompletionTokens,
                    avg_response_time_ms: Math.round(avgResponseTime)
                },
                hourlyUsage,
                recentActivity: internalChatUsage.slice(0, 100)
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Internal chat analytics error', err: error, userId });
            reply.code(500).send({ error: error.message });
        }
    });
    // Get analytics for a specific exported API
    fastify.get('/api/usage/analytics/:apiId', async (request, reply) => {
        const userId = request.user.id;
        const { apiId } = request.params;
        try {
            const { data: apiData, error: apiError } = await supabase
                .from('exported_apis')
                .select('api_key_hash, name, export_type')
                .eq('id', apiId)
                .eq('user_id', userId)
                .single();
            if (apiError || !apiData) {
                return reply.code(404).send({ error: 'API not found or not owned by user' });
            }
            const { data: usageData, error: usageError } = await supabase
                .from('api_usage')
                .select('*')
                .eq('api_key_hash', apiData.api_key_hash)
                .order('created_at', { ascending: false });
            if (usageError)
                throw usageError;
            if (!usageData)
                return reply.send({ apiInfo: {}, summary: {}, hourlyUsage: {}, recentActivity: [] });
            const totalRequests = usageData.length;
            const totalTokens = usageData.reduce((sum, record) => sum + (record.total_tokens || 0), 0);
            const totalPromptTokens = usageData.reduce((sum, record) => sum + (record.prompt_tokens || 0), 0);
            const totalCompletionTokens = usageData.reduce((sum, record) => sum + (record.completion_tokens || 0), 0);
            const avgResponseTime = usageData.length > 0
                ? usageData.reduce((sum, record) => sum + (record.response_time_ms || 0), 0) / usageData.length
                : 0;
            const twentyFourHoursAgo = new Date();
            twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
            const recentUsage = usageData.filter(record => new Date(record.created_at) >= twentyFourHoursAgo);
            const hourlyUsage = recentUsage.reduce((acc, record) => {
                const hour = new Date(record.created_at).toISOString().slice(0, 13) + ':00:00';
                if (!acc[hour]) {
                    acc[hour] = { requests: 0, tokens: 0 };
                }
                acc[hour].requests += 1;
                acc[hour].tokens += record.total_tokens || 0;
                return acc;
            }, {});
            reply.code(200).send({
                apiInfo: {
                    id: apiId,
                    name: apiData.name,
                    type: apiData.export_type
                },
                summary: {
                    // Use snake_case to match the overall analytics endpoint
                    total_requests: totalRequests,
                    total_tokens: totalTokens,
                    prompt_tokens: totalPromptTokens,
                    completion_tokens: totalCompletionTokens,
                    avg_response_time_ms: Math.round(avgResponseTime)
                },
                hourlyUsage,
                recentActivity: usageData.slice(0, 100)
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'API specific analytics error', err: error, userId, apiId });
            reply.code(500).send({ error: error.message });
        }
    });
}
