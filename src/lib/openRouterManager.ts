import { SupabaseClient } from '@supabase/supabase-js';
import { FastifyBaseLogger } from 'fastify';
import { EncryptionUtils } from '../utils/encryption';

export interface OpenRouterKeyData {
  id: string;
  hash: string;
  label: string;
  name: string;
  disabled: boolean;
  limit: number;
  usage: number;
  created_at: string;
  updated_at: string;
}

export interface CreateKeyResponse {
  key: string;
  data: OpenRouterKeyData;
}

export class OpenRouterManager {
  private provisioningKey: string;
  private baseUrl: string = 'https://openrouter.ai/api/v1/keys';

  constructor(provisioningKey: string) {
    if (!provisioningKey) {
      throw new Error('OpenRouter provisioning key is required');
    }
    this.provisioningKey = provisioningKey;
  }

  /**
   * Create a new OpenRouter API key for a user
   */
  async createUserApiKey(
    userId: string, 
    name: string, 
    creditLimit: number = 0,
    supabase: SupabaseClient,
    logger: FastifyBaseLogger
  ): Promise<string> {
    try {
      logger.info({ msg: 'Creating OpenRouter API key', userId, name, creditLimit });

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.provisioningKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name,
          label: `user-${userId}`,
          limit: creditLimit
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error({ msg: 'Failed to create OpenRouter key', status: response.status, error: errorData });
        throw new Error(`Failed to create OpenRouter key: ${response.status} ${errorData}`);
      }

const result = await response.json() as CreateKeyResponse;      
      // Encrypt and store the API key
      const encryptedKey = EncryptionUtils.encrypt(result.key);
      const keyHash = EncryptionUtils.hashApiKey(result.key);

      const { error: dbError } = await supabase
        .from('user_openrouter_keys')
        .upsert({
          user_id: userId,
          openrouter_key_hash: keyHash,
          encrypted_api_key: encryptedKey,
          credit_limit: creditLimit,
          usage_amount: 0,
          is_active: true
        });

      if (dbError) {
        logger.error({ msg: 'Failed to store OpenRouter key in database', error: dbError });
        // Try to clean up the created key
        await this.deleteUserApiKey(result.data.hash, logger);
        throw new Error('Failed to store API key in database');
      }

      logger.info({ msg: 'OpenRouter API key created and stored successfully', userId, keyHash });
      return result.key;

    } catch (error: any) {
      logger.error({ msg: 'Error creating OpenRouter API key', error: error.message, userId });
      throw error;
    }
  }

  /**
   * Update credit limit for a user's OpenRouter API key
   */
  async updateUserKeyLimit(
    userId: string,
    newLimit: number,
    supabase: SupabaseClient,
    logger: FastifyBaseLogger
  ): Promise<boolean> {
    try {
      // Get user's current key
      const { data: keyData, error: fetchError } = await supabase
        .from('user_openrouter_keys')
        .select('openrouter_key_hash, encrypted_api_key')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (fetchError || !keyData) {
        logger.warn({ msg: 'No active OpenRouter key found for user', userId });
        return false;
      }

      // Get the actual key hash from OpenRouter (we need to map our hash to their hash)
      const decryptedKey = EncryptionUtils.decrypt(keyData.encrypted_api_key);
      const keyHash = await this.getKeyHashFromOpenRouter(decryptedKey, logger);

      if (!keyHash) {
        logger.error({ msg: 'Could not find key hash in OpenRouter', userId });
        return false;
      }

      // Update the key limit in OpenRouter
      const response = await fetch(`${this.baseUrl}/${keyHash}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.provisioningKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          limit: newLimit
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error({ msg: 'Failed to update OpenRouter key limit', status: response.status, error: errorData });
        return false;
      }

      // Update our database record
      const { error: updateError } = await supabase
        .from('user_openrouter_keys')
        .update({ 
          credit_limit: newLimit,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (updateError) {
        logger.error({ msg: 'Failed to update key limit in database', error: updateError });
        return false;
      }

      logger.info({ msg: 'OpenRouter key limit updated successfully', userId, newLimit });
      return true;

    } catch (error: any) {
      logger.error({ msg: 'Error updating OpenRouter key limit', error: error.message, userId });
      return false;
    }
  }

  /**
   * Get OpenRouter key information by searching for the key
   */
  private async getKeyHashFromOpenRouter(apiKey: string, logger: FastifyBaseLogger): Promise<string | null> {
    try {
      // List keys and find the one that matches
      const response = await fetch(this.baseUrl, {
        headers: {
          'Authorization': `Bearer ${this.provisioningKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      
      // We can't directly match the key, but we can match by label
      const keyHash = EncryptionUtils.hashApiKey(apiKey);
      // This is a limitation - we'll store the OpenRouter hash when we create the key
      // For now, we'll need to implement a different approach
      
      return null; // TODO: Implement proper key hash lookup
    } catch (error: any) {
      logger.error({ msg: 'Error searching OpenRouter keys', error: error.message });
      return null;
    }
  }

  /**
   * Disable a user's OpenRouter API key
   */
  async disableUserApiKey(
    userId: string,
    supabase: SupabaseClient,
    logger: FastifyBaseLogger
  ): Promise<boolean> {
    try {
      const { data: keyData, error: fetchError } = await supabase
        .from('user_openrouter_keys')
        .select('openrouter_key_hash')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (fetchError || !keyData) {
        logger.warn({ msg: 'No active OpenRouter key found for user', userId });
        return false;
      }

      // We'll update in our database for now
      const { error: updateError } = await supabase
        .from('user_openrouter_keys')
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (updateError) {
        logger.error({ msg: 'Failed to disable key in database', error: updateError });
        return false;
      }

      logger.info({ msg: 'OpenRouter key disabled successfully', userId });
      return true;

    } catch (error: any) {
      logger.error({ msg: 'Error disabling OpenRouter key', error: error.message, userId });
      return false;
    }
  }

  /**
   * Delete a user's OpenRouter API key
   */
  async deleteUserApiKey(keyHash: string, logger: FastifyBaseLogger): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/${keyHash}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.provisioningKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error({ msg: 'Failed to delete OpenRouter key', status: response.status, error: errorData });
        return false;
      }

      logger.info({ msg: 'OpenRouter key deleted successfully', keyHash });
      return true;

    } catch (error: any) {
      logger.error({ msg: 'Error deleting OpenRouter key', error: error.message, keyHash });
      return false;
    }
  }

  /**
   * Get user's decrypted API key for making requests
   */
  async getUserApiKey(
    userId: string,
    supabase: SupabaseClient,
    logger: FastifyBaseLogger
  ): Promise<string | null> {
    try {
      const { data: keyData, error: fetchError } = await supabase
        .from('user_openrouter_keys')
        .select('encrypted_api_key')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (fetchError || !keyData) {
        logger.warn({ msg: 'No active OpenRouter key found for user', userId });
        return null;
      }

      return EncryptionUtils.decrypt(keyData.encrypted_api_key);

    } catch (error: any) {
      logger.error({ msg: 'Error retrieving user API key', error: error.message, userId });
      return null;
    }
  }

  /**
   * Create or ensure user has an OpenRouter API key
   */
  async ensureUserApiKey(
    userId: string,
    email: string,
    creditLimit: number,
    supabase: SupabaseClient,
    logger: FastifyBaseLogger
  ): Promise<string | null> {
    try {
      // Check if user already has an active key
      let apiKey = await this.getUserApiKey(userId, supabase, logger);
      
      if (apiKey) {
        // Update the credit limit if needed
        await this.updateUserKeyLimit(userId, creditLimit, supabase, logger);
        return apiKey;
      }

      // Create new key
      apiKey = await this.createUserApiKey(
        userId,
        `AI Platform Key - ${email}`,
        creditLimit,
        supabase,
        logger
      );

      return apiKey;

    } catch (error: any) {
      logger.error({ msg: 'Error ensuring user API key', error: error.message, userId });
      return null;
    }
  }
}