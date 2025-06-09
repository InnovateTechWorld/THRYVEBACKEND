"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyExportedApiKey = verifyExportedApiKey;
exports.logApiUsage = logApiUsage;
const encryption_1 = require("../utils/encryption");
// Helper function to verify exported API key
async function verifyExportedApiKey(apiKey, expectedType, supabase, logger) {
    try {
        const hashedKey = encryption_1.EncryptionUtils.hashApiKey(apiKey);
        const { data, error } = await supabase
            .from('exported_apis')
            .select('*')
            .eq('api_key_hash', hashedKey)
            .eq('is_active', true)
            .single();
        if (error || !data) {
            logger.warn({ msg: 'Invalid API key or not found', apiKeyHash: hashedKey, errorDetails: error?.message });
            throw new Error('Invalid API key');
        }
        const exportedApi = data;
        if (exportedApi.expires_at && new Date(exportedApi.expires_at) < new Date()) {
            logger.warn({ msg: 'API key has expired', apiKeyId: exportedApi.id });
            throw new Error('API key has expired');
        }
        if (exportedApi.export_type !== expectedType) {
            logger.warn({
                msg: 'Invalid API key type',
                apiKeyId: exportedApi.id,
                expected: expectedType,
                got: exportedApi.export_type
            });
            throw new Error(`Invalid API key type. Expected ${expectedType}, got ${exportedApi.export_type}`);
        }
        return exportedApi;
    }
    catch (error) {
        logger.error({ msg: 'API key verification failed', error: error.message, stack: error.stack });
        // Re-throw with a generic message or the original one if it's safe
        throw new Error(`API key verification failed: ${error.message}`);
    }
}
// Helper function to log API usage
async function logApiUsage(apiKey, // The raw API key, will be hashed
userId, endpoint, model, supabase, logger, promptTokens = 0, completionTokens = 0, responseTimeMs = 0) {
    try {
        const hashedKey = encryption_1.EncryptionUtils.hashApiKey(apiKey);
        const { error } = await supabase.from('api_usage').insert([{
                api_key_hash: hashedKey,
                user_id: userId,
                model_used: model,
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: promptTokens + completionTokens,
                request_type: endpoint, // Use request_type since it's NOT NULL
                endpoint: endpoint, // Also populate endpoint since it exists
                response_time_ms: responseTimeMs,
            }]);
        if (error) {
            logger.error({ msg: 'Failed to log API usage', err: error, apiKeyHash: hashedKey, userId, endpoint });
        }
        else {
            logger.info({ msg: 'API usage logged successfully', endpoint, model, tokens: promptTokens + completionTokens });
        }
    }
    catch (error) {
        logger.error({ msg: 'Exception in logApiUsage', err: error.message, stack: error.stack });
    }
}
