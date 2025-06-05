import { SupabaseClient } from '@supabase/supabase-js';
import { FastifyBaseLogger } from 'fastify';
import { EncryptionUtils } from '../utils/encryption';

export interface ExportedApiData {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  api_key_hash: string;
  export_type: 'context' | 'session';
  session_id?: string;
  base_model: string;
  allowed_models: string[];
  rate_limit: number;
  is_active: boolean;
  include_memories: boolean;
  include_notes: boolean;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

// Helper function to verify exported API key
export async function verifyExportedApiKey(
  apiKey: string,
  expectedType: 'context' | 'session',
  supabase: SupabaseClient,
  logger: FastifyBaseLogger
): Promise<ExportedApiData> {
  try {
    const hashedKey = EncryptionUtils.hashApiKey(apiKey);

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

    const exportedApi = data as ExportedApiData;

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
  } catch (error: any) {
    logger.error({ msg: 'API key verification failed', error: error.message, stack: error.stack });
    // Re-throw with a generic message or the original one if it's safe
    throw new Error(`API key verification failed: ${error.message}`);
  }
}

// Helper function to log API usage
export async function logApiUsage(
  apiKey: string, // The raw API key, will be hashed
  userId: string,
  endpoint: string,
  model: string,
  supabase: SupabaseClient,
  logger: FastifyBaseLogger,
  promptTokens: number = 0,
  completionTokens: number = 0,
  responseTimeMs: number = 0
) {
  try {
    const hashedKey = EncryptionUtils.hashApiKey(apiKey);

    const { error } = await supabase.from('api_usage').insert([{
      api_key_hash: hashedKey,
      user_id: userId,
      model_used: model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      request_type: endpoint, // Use request_type since it's NOT NULL
      endpoint: endpoint,     // Also populate endpoint since it exists
      response_time_ms: responseTimeMs,
    }]);

    if (error) {
      logger.error({ msg: 'Failed to log API usage', err: error, apiKeyHash: hashedKey, userId, endpoint });
    } else {
      logger.info({ msg: 'API usage logged successfully', endpoint, model, tokens: promptTokens + completionTokens });
    }
  } catch (error: any) {
    logger.error({ msg: 'Exception in logApiUsage', err: error.message, stack: error.stack });
  }
}