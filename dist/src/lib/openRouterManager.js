"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterManager = exports.OpenRouterError = void 0;
const encryption_1 = require("../utils/encryption");
var OpenRouterError;
(function (OpenRouterError) {
    OpenRouterError["INSUFFICIENT_CREDITS"] = "INSUFFICIENT_CREDITS";
    OpenRouterError["MODEL_NOT_ALLOWED"] = "MODEL_NOT_ALLOWED";
    OpenRouterError["PLAN_RESTRICTION"] = "PLAN_RESTRICTION";
    OpenRouterError["KEY_DISABLED"] = "KEY_DISABLED";
    OpenRouterError["SYNC_FAILED"] = "SYNC_FAILED";
    OpenRouterError["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    OpenRouterError["KEY_NOT_FOUND"] = "KEY_NOT_FOUND";
    OpenRouterError["KEY_CREATION_FAILED"] = "OPENROUTER_KEY_CREATION_FAILED";
    OpenRouterError["LIMIT_UPDATE_FAILED"] = "OPENROUTER_LIMIT_UPDATE_FAILED";
    OpenRouterError["USAGE_SYNC_FAILED"] = "OPENROUTER_USAGE_SYNC_FAILED";
    OpenRouterError["CREDIT_ALLOCATION_FAILED"] = "OPENROUTER_CREDIT_ALLOCATION_FAILED";
})(OpenRouterError || (exports.OpenRouterError = OpenRouterError = {}));
class OpenRouterManager {
    constructor(provisioningKey) {
        this.baseUrl = 'https://openrouter.ai/api/v1';
        if (!provisioningKey) {
            throw new Error('OpenRouter provisioning key is required');
        }
        this.provisioningKey = provisioningKey;
    }
    checkModelRequiresCredits(modelId) {
        // Free models always end with ':free'
        const isFreeModel = modelId.endsWith(':free');
        // Free models don't require credits
        return !isFreeModel;
    }
    async getAvailableFreeModels(userApiKey, logger) {
        try {
            const keyToUse = userApiKey || this.provisioningKey;
            const response = await fetch(`${this.baseUrl}/models`, {
                headers: { 'Authorization': `Bearer ${keyToUse}` }
            });
            if (!response.ok) {
                logger?.warn({ msg: 'Failed to fetch models for free model list', status: response.status });
                // Return fallback list if API fails
                return [
                    'meta-llama/llama-3.2-3b-instruct:free',
                    'meta-llama/llama-3.2-1b-instruct:free',
                    'google/gemma-2-9b-it:free',
                    'microsoft/phi-3-mini-128k-instruct:free',
                    'qwen/qwen-2-7b-instruct:free'
                ];
            }
            const data = await response.json();
            const freeModels = data.data
                .filter((model) => model.id.endsWith(':free'))
                .map((model) => model.id)
                .sort();
            return freeModels;
        }
        catch (error) {
            logger?.warn({ msg: 'Error fetching free models', error: error.message });
            // Return fallback list
            return [
                'meta-llama/llama-3.2-3b-instruct:free',
                'meta-llama/llama-3.2-1b-instruct:free',
                'google/gemma-2-9b-it:free',
                'microsoft/phi-3-mini-128k-instruct:free',
                'qwen/qwen-2-7b-instruct:free'
            ];
        }
    }
    /**
     * Create a new OpenRouter API key for a user with zero credits (for new users/free plans)
     */
    async createUserApiKeyWithZeroCredits(userId, email, supabase, logger) {
        try {
            logger.info({ msg: 'Creating OpenRouter API key with zero credits', userId, email });
            const response = await fetch(`${this.baseUrl}/keys`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.provisioningKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: `AI Platform - ${email} (Free)`,
                    label: `user-${userId.substring(0, 8)}-free`,
                    limit: 0
                })
            });
            if (!response.ok) {
                const errorText = await response.text();
                logger.error({ msg: 'Failed to create zero-credit key', status: response.status, error: errorText });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.KEY_CREATION_FAILED,
                        message: `Failed to create key: ${response.status}`,
                        details: errorText
                    }
                };
            }
            const result = await response.json();
            // ✅ VALIDATION: Same validation as above
            if (!result.key || !result.data?.hash) {
                logger.error('❌ OpenRouter API response missing required fields', {
                    hasKey: !!result.key,
                    hasHash: !!result.data?.hash
                });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.KEY_CREATION_FAILED,
                        message: 'OpenRouter API response missing required fields',
                        details: 'Missing key or hash in response'
                    }
                };
            }
            // ✅ FIXED: Use correct field mapping
            const openRouterKey = result.key;
            const openRouterHash = result.data.hash;
            const encryptedKey = encryption_1.EncryptionUtils.encrypt(openRouterKey);
            const ourKeyHash = encryption_1.EncryptionUtils.hashApiKey(openRouterKey);
            // ✅ FIXED: Store with proper field mapping
            const { error: dbError } = await supabase
                .from('user_openrouter_keys')
                .upsert({
                user_id: userId,
                openrouter_key_hash: openRouterHash,
                our_key_hash: ourKeyHash,
                encrypted_api_key: encryptedKey,
                openrouter_credits: 0,
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            if (dbError) {
                logger.error({ msg: 'Failed to store zero-credit key in database', error: dbError });
                // Cleanup
                try {
                    await fetch(`${this.baseUrl}/keys/${openRouterHash}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${this.provisioningKey}` }
                    });
                }
                catch (cleanupError) {
                    logger.warn('Failed to cleanup key after database error');
                }
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.INTERNAL_ERROR,
                        message: 'Failed to store API key',
                        details: dbError
                    }
                };
            }
            logger.info({
                msg: 'Zero-credit OpenRouter API key created successfully',
                userId,
                openrouterHash: openRouterHash
            });
            return {
                success: true,
                data: { key: openRouterKey }
            };
        }
        catch (error) {
            logger.error({ msg: 'Error creating zero-credit OpenRouter key', error: error.message });
            return {
                success: false,
                error: {
                    code: OpenRouterError.INTERNAL_ERROR,
                    message: 'Internal error creating key',
                    details: error.message
                }
            };
        }
    }
    /**
     * Create a new OpenRouter API key for a user
     */
    async createUserApiKey(userId, email, creditLimit, supabase, logger) {
        try {
            logger.info({ msg: 'Creating OpenRouter API key', userId, email, creditLimit });
            const response = await fetch(`${this.baseUrl}/keys`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.provisioningKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: `AI Platform - ${email}`,
                    label: `user-${userId.substring(0, 8)}`,
                    limit: creditLimit
                })
            });
            if (!response.ok) {
                const errorText = await response.text();
                logger.error({ msg: 'Failed to create key', status: response.status, error: errorText });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.KEY_CREATION_FAILED,
                        message: `Failed to create key: ${response.status}`,
                        details: errorText
                    }
                };
            }
            const result = await response.json();
            // ✅ DEBUG: Log the actual response structure
            logger.info('OpenRouter API Response Structure:', {
                hasKey: !!result.key,
                hasData: !!result.data,
                hasHash: !!result.data?.hash,
                keyLength: result.key?.length,
                hashValue: result.data?.hash
            });
            // ✅ VALIDATION: Ensure we have the required fields
            if (!result.key) {
                logger.error('❌ OpenRouter API did not return a key');
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.KEY_CREATION_FAILED,
                        message: 'OpenRouter API did not return a key',
                        details: 'Missing key in response'
                    }
                };
            }
            if (!result.data?.hash) {
                logger.error('❌ OpenRouter API did not return a hash');
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.KEY_CREATION_FAILED,
                        message: 'OpenRouter API did not return a hash',
                        details: 'Missing hash in response data'
                    }
                };
            }
            // ✅ FIXED: Use correct field mapping
            const openRouterKey = result.key; // Key is at root level
            const openRouterHash = result.data.hash; // Hash is in data object
            // Encrypt the key for storage
            const encryptedKey = encryption_1.EncryptionUtils.encrypt(openRouterKey);
            const ourKeyHash = encryption_1.EncryptionUtils.hashApiKey(openRouterKey);
            logger.info('🔐 Key encryption completed:', {
                openRouterHash: openRouterHash,
                ourKeyHashGenerated: !!ourKeyHash,
                encryptedKeyGenerated: !!encryptedKey
            });
            // ✅ FIXED: Store in database with proper field mapping
            const { error: dbError } = await supabase
                .from('user_openrouter_keys')
                .upsert({
                user_id: userId,
                openrouter_key_hash: openRouterHash, // ✅ Use hash from OpenRouter API
                our_key_hash: ourKeyHash, // ✅ Our generated hash for internal use
                encrypted_api_key: encryptedKey,
                openrouter_credits: creditLimit,
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            if (dbError) {
                logger.error({ msg: 'Failed to store key in database', error: dbError });
                // ✅ CLEANUP: Try to delete the created key from OpenRouter
                try {
                    await fetch(`${this.baseUrl}/keys/${openRouterHash}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${this.provisioningKey}` }
                    });
                    logger.info('🧹 Cleaned up OpenRouter key after database error');
                }
                catch (cleanupError) {
                    logger.warn('⚠️ Failed to cleanup OpenRouter key after database error');
                }
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.INTERNAL_ERROR,
                        message: 'Failed to store API key',
                        details: dbError
                    }
                };
            }
            logger.info({
                msg: 'OpenRouter API key created and stored successfully',
                userId,
                openrouterHash: openRouterHash,
                creditLimit
            });
            return {
                success: true,
                data: { key: openRouterKey }
            };
        }
        catch (error) {
            logger.error({ msg: 'Error creating OpenRouter key', error: error.message });
            return {
                success: false,
                error: {
                    code: OpenRouterError.INTERNAL_ERROR,
                    message: 'Internal error creating key',
                    details: error.message
                }
            };
        }
    }
    /**
     * Get user's API key for making requests
     */
    async getUserApiKey(userId, supabase, logger) {
        try {
            const { data: keyData, error: keyError } = await supabase
                .from('user_openrouter_keys')
                .select('encrypted_api_key')
                .eq('user_id', userId)
                .eq('is_active', true)
                .single();
            if (keyError || !keyData) {
                logger.warn({ msg: 'No active API key found for user', userId });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.KEY_NOT_FOUND,
                        message: 'No active API key found'
                    }
                };
            }
            const decryptedKey = encryption_1.EncryptionUtils.decrypt(keyData.encrypted_api_key);
            return {
                success: true,
                data: decryptedKey
            };
        }
        catch (error) {
            logger.error({ msg: 'Error getting user API key', error: error.message });
            return {
                success: false,
                error: {
                    code: OpenRouterError.INTERNAL_ERROR,
                    message: 'Failed to retrieve API key',
                    details: error.message
                }
            };
        }
    }
    /**
     * Check and sync user's credit usage
     */
    // In src/lib/openRouterManager.ts
    // Replace the syncUserCredits method around line 483:
    /**
     * Check and sync user's credit usage using direct SQL
     */
    // In src/lib/openRouterManager.ts - Replace the syncUserCredits method:
    /**
     * Check and sync user's credit usage using direct SQL
     */
    async syncUserCredits(userId, supabase, logger) {
        try {
            // Get user's key
            const keyResponse = await this.getUserApiKey(userId, supabase, logger);
            if (!keyResponse.success) {
                return {
                    success: false,
                    error: keyResponse.error
                };
            }
            // Get usage from OpenRouter
            const response = await fetch(`${this.baseUrl}/auth/key`, {
                headers: {
                    'Authorization': `Bearer ${keyResponse.data}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                const errorText = await response.text();
                logger.error({ msg: 'Failed to get usage from OpenRouter', status: response.status, error: errorText });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.USAGE_SYNC_FAILED,
                        message: 'Failed to get usage from OpenRouter',
                        details: errorText
                    }
                };
            }
            const openRouterData = await response.json();
            const usageData = openRouterData.data; // ✅ Extract from data field
            // ✅ Get current local credits to preserve purchased amounts
            const { data: currentCredits } = await supabase
                .from('user_credit_balances')
                .select('available_credits, total_purchased')
                .eq('user_id', userId)
                .single();
            // ✅ Update database - preserve local credits but sync OpenRouter usage
            const { error: updateError } = await supabase
                .from('user_credit_balances')
                .upsert({
                user_id: userId,
                // ✅ PRESERVE your purchased credits
                available_credits: currentCredits?.available_credits || 0,
                total_purchased: currentCredits?.total_purchased || 0,
                // ✅ SYNC total_used with OpenRouter's usage
                total_used: usageData.usage || 0, // ✅ This updates from OpenRouter
                // ✅ Track OpenRouter data separately
                openrouter_usage: usageData.usage || 0,
                openrouter_limit: usageData.limit || 0,
                openrouter_remaining: usageData.limit_remaining || 0,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });
            if (updateError) {
                logger.error({ msg: 'Failed to update user credits in database', error: updateError });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.INTERNAL_ERROR,
                        message: 'Failed to update credits in database',
                        details: updateError.message
                    }
                };
            }
            logger.info({
                msg: 'User usage synced successfully from OpenRouter',
                userId,
                openrouterUsage: usageData.usage,
                openrouterRemaining: usageData.limit_remaining,
                localCreditsPreserved: currentCredits?.available_credits,
                totalUsedSynced: usageData.usage
            });
            return {
                success: true,
                data: {
                    usage: usageData.usage || 0,
                    limit: usageData.limit,
                    remaining: usageData.limit_remaining || null,
                    disabled: usageData.disabled || false,
                    lastSynced: new Date().toISOString()
                }
            };
        }
        catch (error) {
            logger.error({ msg: 'Error syncing user credits', error: error.message });
            return {
                success: false,
                error: {
                    code: OpenRouterError.INTERNAL_ERROR,
                    message: 'Failed to sync credits',
                    details: error.message
                }
            };
        }
    }
    /**
     * Check if user has sufficient credits
     */
    // In src/lib/openRouterManager.ts
    // Replace the checkUserCredits method around line 552:
    /**
     * Check if user has sufficient credits using direct SQL query
     */
    async checkUserCredits(userId, requiredCredits, supabase, logger, modelId) {
        try {
            // If model doesn't require credits, allow access immediately
            if (modelId && !this.checkModelRequiresCredits(modelId)) {
                logger.info({ msg: 'Free model access granted', userId, modelId });
                return {
                    success: true,
                    data: {
                        sufficient: true,
                        available: 0, // Free tier - no credit tracking needed
                        isFreeModel: true
                    }
                };
            }
            // For paid models, perform credit check using direct SQL
            // Sync first to get latest usage
            const syncResult = await this.syncUserCredits(userId, supabase, logger);
            if (!syncResult.success) {
                return {
                    success: false,
                    error: syncResult.error
                };
            }
            // ✅ Use direct SQL query instead of RPC
            const { data: creditData, error: queryError } = await supabase
                .from('user_credit_balances')
                .select('available_credits')
                .eq('user_id', userId)
                .single();
            if (queryError) {
                logger.error({ msg: 'Error querying user credits directly', error: queryError });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.INTERNAL_ERROR,
                        message: 'Failed to check credits',
                        details: queryError.message
                    }
                };
            }
            const availableCredits = creditData?.available_credits || 0;
            const hasSufficientCredits = availableCredits >= requiredCredits;
            if (!hasSufficientCredits) {
                // Enhanced error message with free model suggestions
                const userApiKeyResponse = await this.getUserApiKey(userId, supabase, logger);
                const userApiKey = userApiKeyResponse.success ? userApiKeyResponse.data : undefined;
                const freeModels = await this.getAvailableFreeModels(userApiKey, logger);
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.INSUFFICIENT_CREDITS,
                        message: `Insufficient credits. Required: ${requiredCredits}, Available: ${availableCredits}. Try using a free model instead.`,
                        details: {
                            required: requiredCredits,
                            available: availableCredits,
                            freeModelsAvailable: freeModels,
                            suggestion: `Consider using a free model like: ${freeModels.slice(0, 3).join(', ')}`,
                            freeModelPattern: 'Models ending with ":free" don\'t require credits'
                        }
                    }
                };
            }
            return {
                success: true,
                data: {
                    sufficient: true,
                    available: availableCredits,
                    isFreeModel: false
                }
            };
        }
        catch (error) {
            logger.error({ msg: 'Error checking user credits', error: error.message });
            return {
                success: false,
                error: {
                    code: OpenRouterError.INTERNAL_ERROR,
                    message: 'Failed to check credits',
                    details: error.message
                }
            };
        }
    }
    /**
     * Check if model is allowed for user's plan
     */
    // Replace lines 350-423 in your checkModelAccess method:
    async checkModelAccess(userId, modelId, supabase, logger) {
        try {
            // Free models are always allowed regardless of subscription
            if (!this.checkModelRequiresCredits(modelId)) {
                logger.info({ msg: 'Free model access granted', userId, modelId });
                return {
                    success: true,
                    data: true
                };
            }
            // For paid models, check subscription
            const { data: subscription, error: subError } = await supabase
                .from('user_subscriptions')
                .select(`
        subscription_plans (
          id,
          name,
          free_models_only
        )
      `)
                .eq('user_id', userId)
                .eq('status', 'active')
                .single();
            if (subError && subError.code !== 'PGRST116') {
                logger.error({ msg: 'Error fetching user subscription', error: subError });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.INTERNAL_ERROR,
                        message: 'Failed to check subscription',
                        details: subError.message
                    }
                };
            }
            if (!subscription?.subscription_plans) {
                // No active subscription - only free models allowed
                const userApiKeyResponse = await this.getUserApiKey(userId, supabase, logger);
                const userApiKey = userApiKeyResponse.success ? userApiKeyResponse.data : undefined;
                const freeModels = await this.getAvailableFreeModels(userApiKey, logger);
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.PLAN_RESTRICTION,
                        message: 'This model requires an active subscription. Try a free model instead.',
                        details: {
                            freeModelsAvailable: freeModels,
                            suggestion: `Consider using a free model like: ${freeModels.slice(0, 3).join(', ')}`,
                            freeModelPattern: 'Models ending with ":free" don\'t require a subscription'
                        }
                    }
                };
            }
            // Handle subscription plan details
            let plan;
            if (Array.isArray(subscription.subscription_plans)) {
                if (subscription.subscription_plans.length === 0) {
                    return {
                        success: false,
                        error: {
                            code: OpenRouterError.PLAN_RESTRICTION,
                            message: 'No subscription plan found'
                        }
                    };
                }
                plan = subscription.subscription_plans[0];
            }
            else {
                plan = subscription.subscription_plans;
            }
            // Check if plan only allows free models
            if (plan.free_models_only) {
                const userApiKeyResponse = await this.getUserApiKey(userId, supabase, logger);
                const userApiKey = userApiKeyResponse.success ? userApiKeyResponse.data : undefined;
                const freeModels = await this.getAvailableFreeModels(userApiKey, logger);
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.MODEL_NOT_ALLOWED,
                        message: 'Your plan only allows free models. Upgrade to access paid models.',
                        details: {
                            currentPlan: plan.name,
                            freeModelsAvailable: freeModels,
                            suggestion: `Consider using a free model like: ${freeModels.slice(0, 3).join(', ')}`,
                            freeModelPattern: 'Models ending with ":free" are included in your plan'
                        }
                    }
                };
            }
            // ✅ For paid plans (Pro/Power), allow all paid models
            logger.info({
                msg: 'Paid model access granted for subscription user',
                userId,
                modelId,
                planName: plan.name
            });
            return {
                success: true,
                data: true
            };
        }
        catch (error) {
            logger.error({ msg: 'Error checking model access', error: error.message });
            return {
                success: false,
                error: {
                    code: OpenRouterError.INTERNAL_ERROR,
                    message: 'Failed to check model access',
                    details: error.message
                }
            };
        }
    }
    /**
     * Allocate credits to user's OpenRouter key (for subscriptions and top-ups)
     */
    async allocateCreditsToUser(userId, additionalCredits, source, sourceReference, supabase, logger) {
        try {
            // Get current credit limit
            const { data: keyData, error: keyError } = await supabase
                .from('user_openrouter_keys')
                .select('openrouter_credits')
                .eq('user_id', userId)
                .eq('is_active', true)
                .single();
            if (keyError || !keyData) {
                logger.warn({ msg: 'No active OpenRouter key found for credit allocation', userId });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.KEY_NOT_FOUND,
                        message: 'No active key found for credit allocation'
                    }
                };
            }
            const newTotalCredits = keyData.openrouter_credits + additionalCredits;
            // Log allocation attempt
            const { error: logError } = await supabase
                .from('credit_allocation_log')
                .insert({
                user_id: userId,
                amount: additionalCredits,
                source: source,
                source_reference: sourceReference,
                status: 'processing'
            });
            if (logError) {
                logger.error({ msg: 'Failed to log credit allocation', error: logError });
            }
            // Update OpenRouter key limit
            const updateResponse = await this.updateUserKeyLimit(userId, newTotalCredits, supabase, logger);
            if (!updateResponse.success) {
                // Mark allocation as failed
                await supabase
                    .from('credit_allocation_log')
                    .update({
                    status: 'failed',
                    error: updateResponse.error?.message,
                    updated_at: new Date().toISOString()
                })
                    .eq('user_id', userId)
                    .eq('source_reference', sourceReference);
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.CREDIT_ALLOCATION_FAILED,
                        message: 'Failed to allocate credits to OpenRouter key',
                        details: updateResponse.error
                    }
                };
            }
            // Mark allocation as successful
            await supabase
                .from('credit_allocation_log')
                .update({
                status: 'completed',
                updated_at: new Date().toISOString()
            })
                .eq('user_id', userId)
                .eq('source_reference', sourceReference);
            logger.info({
                msg: 'Credits allocated successfully',
                userId,
                additionalCredits,
                newTotalCredits,
                source,
                sourceReference
            });
            return {
                success: true,
                data: { newTotal: newTotalCredits }
            };
        }
        catch (error) {
            logger.error({ msg: 'Error allocating credits', error: error.message });
            return {
                success: false,
                error: {
                    code: OpenRouterError.INTERNAL_ERROR,
                    message: 'Internal error allocating credits',
                    details: error.message
                }
            };
        }
    }
    /**
     * Update credit limit for user's OpenRouter key
     */
    async updateUserKeyLimit(userId, newLimit, supabase, logger) {
        try {
            const { data: keyData, error: keyError } = await supabase
                .from('user_openrouter_keys')
                .select('openrouter_key_hash')
                .eq('user_id', userId)
                .eq('is_active', true)
                .single();
            if (keyError || !keyData) {
                logger.warn({ msg: 'No active OpenRouter key found for user to update limit', userId });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.KEY_NOT_FOUND,
                        message: 'No active key found to update limit'
                    }
                };
            }
            const response = await fetch(`${this.baseUrl}/keys/${keyData.openrouter_key_hash}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.provisioningKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ limit: newLimit })
            });
            if (!response.ok) {
                const errorText = await response.text();
                logger.error({ msg: 'Failed to update key limit in OpenRouter', status: response.status, error: errorText });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.LIMIT_UPDATE_FAILED,
                        message: 'Failed to update key limit in OpenRouter',
                        details: errorText
                    }
                };
            }
            // Update our database
            const { error: dbError } = await supabase
                .from('user_openrouter_keys')
                .update({
                openrouter_credits: newLimit,
                updated_at: new Date().toISOString()
            })
                .eq('user_id', userId);
            if (dbError) {
                logger.error({ msg: 'Failed to update key limit in database', error: dbError });
                // Note: OpenRouter limit was updated, but DB failed. This needs monitoring.
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.INTERNAL_ERROR,
                        message: 'Failed to update key limit in database',
                        details: dbError.message
                    }
                };
            }
            logger.info({ msg: 'OpenRouter key limit updated successfully', userId, newLimit });
            return { success: true };
        }
        catch (error) {
            logger.error({ msg: 'Error updating key limit', error: error.message });
            return {
                success: false,
                error: {
                    code: OpenRouterError.INTERNAL_ERROR,
                    message: 'Internal error updating limit',
                    details: error.message
                }
            };
        }
    }
    /**
     * Create or ensure user has an OpenRouter API key with proper credit allocation
     */
    async ensureUserApiKey(userId, email, creditLimit, supabase, logger) {
        try {
            // Check if user already has an active key
            const apiKeyResponse = await this.getUserApiKey(userId, supabase, logger);
            if (apiKeyResponse.success) {
                // Key exists, ensure limit is correct and sync usage
                const updateLimitResponse = await this.updateUserKeyLimit(userId, creditLimit, supabase, logger);
                if (!updateLimitResponse.success) {
                    // Log error but don't necessarily fail the ensure process if key exists
                    logger.error({ msg: 'Failed to update limit during ensure', userId, error: updateLimitResponse.error });
                }
                const syncResponse = await this.syncUserCredits(userId, supabase, logger);
                if (!syncResponse.success) {
                    // Log error but don't necessarily fail the ensure process if key exists
                    logger.error({ msg: 'Failed to sync usage during ensure', userId, error: syncResponse.error });
                }
                return apiKeyResponse;
            }
            // Key does not exist, create new key
            const createKeyResponse = await this.createUserApiKey(userId, email, creditLimit, supabase, logger);
            if (!createKeyResponse.success) {
                return {
                    success: false,
                    error: createKeyResponse.error // Propagate creation error
                };
            }
            return {
                success: true,
                data: createKeyResponse.data.key
            };
        }
        catch (error) {
            logger.error({ msg: 'Error ensuring user API key', error: error.message, userId });
            return {
                success: false,
                error: {
                    code: OpenRouterError.INTERNAL_ERROR,
                    message: 'Internal error ensuring key',
                    details: error.message
                }
            };
        }
    }
    /**
     * Disable a user's OpenRouter API key
     */
    async disableUserApiKey(userId, supabase, logger) {
        try {
            const { data: keyData, error: fetchError } = await supabase
                .from('user_openrouter_keys')
                .select('openrouter_key_hash')
                .eq('user_id', userId)
                .eq('is_active', true)
                .single();
            if (fetchError || !keyData) {
                logger.warn({ msg: 'No active OpenRouter key found for user to disable', userId });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.KEY_NOT_FOUND,
                        message: 'No active key found to disable'
                    }
                };
            }
            // Disable key in OpenRouter
            const response = await fetch(`${this.baseUrl}/keys/${keyData.openrouter_key_hash}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.provisioningKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    disabled: true
                })
            });
            if (!response.ok) {
                const errorText = await response.text();
                logger.error({ msg: 'Failed to disable key in OpenRouter', status: response.status, error: errorText });
                // Continue to update DB even if OpenRouter fails
            }
            // Update in our database
            const { error: updateError } = await supabase
                .from('user_openrouter_keys')
                .update({
                is_active: false,
                updated_at: new Date().toISOString()
            })
                .eq('user_id', userId);
            if (updateError) {
                logger.error({ msg: 'Failed to disable key in database', error: updateError });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.INTERNAL_ERROR,
                        message: 'Failed to disable key in database',
                        details: updateError.message
                    }
                };
            }
            logger.info({ msg: 'OpenRouter key disabled successfully', userId });
            return { success: true };
        }
        catch (error) {
            logger.error({ msg: 'Error disabling OpenRouter key', error: error.message, userId });
            return {
                success: false,
                error: {
                    code: OpenRouterError.INTERNAL_ERROR,
                    message: 'Internal error disabling key',
                    details: error.message
                }
            };
        }
    }
    /**
     * Delete a user's OpenRouter API key
     */
    async deleteUserApiKey(keyHash, logger) {
        try {
            const response = await fetch(`${this.baseUrl}/keys/${keyHash}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.provisioningKey}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                const errorData = await response.text();
                logger.error({ msg: 'Failed to delete OpenRouter key', status: response.status, error: errorData });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.INTERNAL_ERROR,
                        message: 'Failed to delete key in OpenRouter',
                        details: errorData
                    }
                };
            }
            // Note: We don't delete from our DB, just mark inactive/deleted if needed elsewhere.
            // Assuming deletion from OpenRouter is sufficient for this context.
            logger.info({ msg: 'OpenRouter key deleted successfully', keyHash });
            return { success: true };
        }
        catch (error) {
            logger.error({ msg: 'Error deleting OpenRouter key', error: error.message, keyHash });
            return {
                success: false,
                error: {
                    code: OpenRouterError.INTERNAL_ERROR,
                    message: 'Internal error deleting key',
                    details: error.message
                }
            };
        }
    }
    /**
     * Compare OpenRouter credits with local database and auto-sync if needed
     */
    async compareAndSyncCredits(userId, supabase, logger) {
        try {
            // Get local credit data
            const { data: localData, error: localError } = await supabase
                .from('user_credit_balances')
                .select('openrouter_balance, openrouter_total_used, openrouter_last_sync')
                .eq('user_id', userId)
                .single();
            if (localError) {
                logger.error({ msg: 'Failed to get local credit data', error: localError });
                return {
                    success: false,
                    error: {
                        code: OpenRouterError.INTERNAL_ERROR,
                        message: 'Failed to get local credit data',
                        details: localError.message
                    }
                };
            }
            // Get OpenRouter usage
            const syncResult = await this.syncUserCredits(userId, supabase, logger);
            if (!syncResult.success) {
                return {
                    success: false,
                    error: syncResult.error
                };
            }
            const openrouterData = syncResult.data;
            const localBalance = localData?.openrouter_balance || 0;
            const openrouterBalance = openrouterData.remaining || 0;
            let action = 'no_action_needed';
            let synced = true;
            // Compare and decide action
            if (Math.abs(localBalance - openrouterBalance) > 1) { // Allow 1 credit difference for rounding
                if (openrouterBalance > localBalance) {
                    action = 'local_updated_from_openrouter';
                    logger.info({
                        msg: 'Local credits updated from OpenRouter',
                        userId,
                        localBalance,
                        openrouterBalance
                    });
                }
                else {
                    action = 'openrouter_updated_from_local';
                    // Update OpenRouter to match local if local is higher
                    if (localBalance > openrouterBalance) {
                        const updateResponse = await this.updateUserKeyLimit(userId, localBalance, supabase, logger);
                        synced = updateResponse.success;
                        if (!synced) {
                            logger.warn({
                                msg: 'Failed to update OpenRouter to match local',
                                userId,
                                localBalance,
                                openrouterBalance
                            });
                        }
                    }
                }
            }
            return {
                success: true,
                data: {
                    openrouterCredits: openrouterBalance,
                    localCredits: localBalance,
                    synced,
                    action
                }
            };
        }
        catch (error) {
            logger.error({ msg: 'Error comparing and syncing credits', error: error.message });
            return {
                success: false,
                error: {
                    code: OpenRouterError.INTERNAL_ERROR,
                    message: 'Failed to compare and sync credits',
                    details: error.message
                }
            };
        }
    }
    /**
     * Get comprehensive user key information
     */
    async getUserKeyInfo(userId, supabase, logger) {
        try {
            // Sync first to get latest usage
            const syncResult = await this.syncUserCredits(userId, supabase, logger);
            if (!syncResult.success) {
                return syncResult;
            }
            return {
                success: true,
                data: syncResult.data
            };
        }
        catch (error) {
            logger.error({ msg: 'Error getting user key info', error: error.message });
            return {
                success: false,
                error: {
                    code: OpenRouterError.INTERNAL_ERROR,
                    message: 'Failed to get key info',
                    details: error.message
                }
            };
        }
    }
}
exports.OpenRouterManager = OpenRouterManager;
