"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = paymentRoutes;
const flutterwaveService_1 = require("../lib/flutterwaveService");
const openRouterManager_1 = require("../lib/openRouterManager");
const currencyConverter_1 = require("../lib/currencyConverter");
// Error codes for OpenRouter integration
var PaymentError;
(function (PaymentError) {
    PaymentError["SUBSCRIPTION_OPENROUTER_SETUP_FAILED"] = "SUBSCRIPTION_OPENROUTER_SETUP_FAILED";
    PaymentError["TOPUP_OPENROUTER_UPDATE_FAILED"] = "TOPUP_OPENROUTER_UPDATE_FAILED";
    PaymentError["USER_EMAIL_MISSING"] = "USER_EMAIL_MISSING";
    PaymentError["OPENROUTER_KEY_ENSURE_FAILED"] = "OPENROUTER_KEY_ENSURE_FAILED";
})(PaymentError || (PaymentError = {}));
async function paymentRoutes(fastify, options) {
    const { supabase, openRouterProvisioningKey } = options;
    // Initialize services
    const flutterwaveService = new flutterwaveService_1.FlutterwaveService(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY, process.env.FLW_WEBHOOK_SECRET);
    const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
    /**
     * Get available subscription plans (public endpoint)
     */
    fastify.get('/api/payment/plans', async (request, reply) => {
        try {
            const { data: plans, error } = await supabase
                .from('subscription_plans')
                .select('*')
                .order('price', { ascending: true });
            if (error) {
                fastify.log.error({ msg: 'Failed to fetch subscription plans', error });
                return reply.code(500).send({ error: 'Failed to fetch subscription plans' });
            }
            return reply.send({
                success: true,
                data: plans
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error fetching subscription plans', error: error.message });
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    /**
     * Get supported currencies and their payment methods
     */
    fastify.get('/api/payment/currencies', async (request, reply) => {
        try {
            const currencies = currencyConverter_1.CurrencyConverter.getSupportedCurrencies().map(currency => ({
                code: currency.code,
                name: currency.name,
                symbol: currency.symbol,
                supportedMethods: currency.supported_by,
                rateToUSD: currency.rate
            }));
            return reply.send({
                success: true,
                data: currencies
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error fetching currencies', error: error.message });
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    /**
     * Get user's current subscription
     */
    fastify.get('/api/payment/subscription', async (request, reply) => {
        try {
            const userId = request.user.id;
            // ✅ FIXED: Query actual table with join instead of RPC
            const { data: subscription, error } = await supabase
                .from('user_subscriptions')
                .select(`
        *,
        subscription_plans (
          id,
          name,
          price,
          credits,
          memory_limit,
          session_api_limit,
          context_api_limit,
          free_models_only
        )
      `)
                .eq('user_id', userId)
                .eq('status', 'active')
                .single();
            if (error && error.code !== 'PGRST116') {
                fastify.log.error({ msg: 'Failed to fetch user subscription', error, userId });
                return reply.code(500).send({ error: 'Failed to fetch subscription' });
            }
            // ✅ Enhanced debug logging
            console.log('=== SUBSCRIPTION QUERY DEBUG ===');
            console.log('User ID:', userId);
            console.log('Subscription found:', !!subscription);
            console.log('Subscription data:', subscription);
            console.log('================================');
            return reply.send({
                success: true,
                data: subscription || null
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error fetching user subscription', error: error.message });
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    /**
     * Get user's credit balance
     */
    fastify.get('/api/payment/credits', async (request, reply) => {
        try {
            const userId = request.user.id;
            const { data: credits, error } = await supabase
                .from('user_credit_balances')
                .select('*')
                .eq('user_id', userId)
                .single();
            if (error && error.code !== 'PGRST116') { // Not found is OK
                fastify.log.error({ msg: 'Failed to fetch user credits', error, userId });
                return reply.code(500).send({ error: 'Failed to fetch credits' });
            }
            return reply.send({
                success: true,
                data: credits || {
                    available_credits: 0,
                    total_purchased: 0,
                    total_used: 0
                }
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error fetching user credits', error: error.message });
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    /**
     * Get payment methods for country/currency
     */
    fastify.get('/api/payment/methods', async (request, reply) => {
        try {
            const query = request.query;
            const { country, currency } = query;
            if (!country || !currency) {
                return reply.code(400).send({ error: 'Country and currency are required' });
            }
            // Check if currency is supported
            if (!currencyConverter_1.CurrencyConverter.isSupported(currency)) {
                return reply.code(400).send({
                    error: 'Currency not supported',
                    supportedCurrencies: currencyConverter_1.CurrencyConverter.getSupportedCurrencies().map(c => c.code)
                });
            }
            // Get payment methods based on currency support
            const supportedMethods = currencyConverter_1.CurrencyConverter.getSupportedPaymentMethods(currency);
            const methods = supportedMethods.map(method => {
                const methodInfo = { type: method };
                switch (method) {
                    case 'card':
                        methodInfo.name = 'Debit/Credit Card';
                        methodInfo.icon = '💳';
                        break;
                    case 'applepay':
                        methodInfo.name = 'Apple Pay';
                        methodInfo.icon = '🍎';
                        break;
                    case 'googlepay':
                        methodInfo.name = 'Google Pay';
                        methodInfo.icon = '🟢';
                        break;
                }
                return methodInfo;
            });
            return reply.send({
                success: true,
                data: {
                    country: country.toUpperCase(),
                    currency: currency.toUpperCase(),
                    currencySymbol: currencyConverter_1.CurrencyConverter.getSymbol(currency),
                    methods
                }
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error fetching payment methods', error: error.message });
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    /**
     * Initiate a payment (subscription or top-up)
     */
    fastify.post('/api/payment/initiate', async (request, reply) => {
        try {
            const userId = request.user.id;
            const userEmail = request.user.email;
            const body = request.body;
            let { type, planId, amount, currency, country, redirectUrl } = body;
            // Basic validation
            if (!type || !currency || !redirectUrl) {
                return reply.code(400).send({ error: 'Missing required fields: type, currency, redirectUrl' });
            }
            // Check if currency is supported
            if (!currencyConverter_1.CurrencyConverter.isSupported(currency)) {
                return reply.code(400).send({
                    error: 'Currency not supported',
                    supportedCurrencies: currencyConverter_1.CurrencyConverter.getSupportedCurrencies().map(c => c.code)
                });
            }
            if (type === 'subscription' && !planId) {
                return reply.code(400).send({ error: 'Plan ID required for subscription' });
            }
            // For subscription, get amount from plan if not provided
            if (type === 'subscription' && !amount) {
                const { data: plan, error: planError } = await supabase
                    .from('subscription_plans')
                    .select('price')
                    .eq('id', planId)
                    .single();
                if (planError || !plan) {
                    return reply.code(404).send({ error: 'Subscription plan not found' });
                }
                amount = plan.price;
            }
            // For topup, amount is required
            if (type === 'topup' && (!amount || amount <= 0)) {
                return reply.code(400).send({ error: 'Valid amount required for topup' });
            }
            if (!amount || amount <= 0) {
                return reply.code(400).send({ error: 'Amount must be greater than 0' });
            }
            // Check for user email
            if (!userEmail) {
                return reply.code(401).send({ error: 'User email not found' });
            }
            // Convert amount if not in USD (for OpenRouter credits)
            const amountInUSD = currency.toUpperCase() === 'USD'
                ? amount
                : currencyConverter_1.CurrencyConverter.toUSD(amount, currency);
            const paymentData = {
                userId,
                email: userEmail,
                amount,
                currency: currency.toUpperCase(),
                type,
                planId,
                redirectUrl,
                country: country?.toUpperCase()
            };
            const result = await flutterwaveService.initializePayment(paymentData, supabase, fastify.log);
            return reply.send({
                success: true,
                data: {
                    ...result,
                    amountLocal: amount,
                    currency: currency.toUpperCase(),
                    amountUSD: amountInUSD,
                    exchangeRate: currencyConverter_1.CurrencyConverter.getExchangeRate(currency, 'USD')
                }
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error initiating payment', error: error.message });
            return reply.code(500).send({ error: 'Failed to initiate payment' });
        }
    });
    /**
     * ✅ FIXED: Verify payment with correct database field names
     */
    // Replace your entire /api/payment/verify endpoint with this:
    // Update your verification section around line 396
    // Replace your entire verification endpoint starting around line 323
    // Replace your verification endpoint with this fixed version:
    fastify.post('/api/payment/verify', async (request, reply) => {
        const body = request.body;
        const { transaction_id, tx_ref, status } = body;
        const userId = request.user.id;
        try {
            fastify.log.info({
                msg: 'Verifying payment',
                transaction_id,
                tx_ref,
                status,
                userId
            });
            // ✅ VALIDATION: Ensure we have tx_ref
            if (!tx_ref) {
                return reply.code(400).send({
                    success: false,
                    error: 'Transaction reference (tx_ref) is required'
                });
            }
            // ✅ STEP 1: Find transaction by reference (regardless of user initially)
            fastify.log.info('🔍 Starting transaction search:', {
                searchReference: tx_ref.trim(),
                userId,
                timestamp: new Date().toISOString()
            });
            const { data: existingTransaction, error: fetchError } = await supabase
                .from('payment_transactions')
                .select('*') // ✅ Simple select without join
                .eq('flutterwave_reference', tx_ref.trim())
                .single();
            // ✅ Enhanced debug logging
            console.log('=== TRANSACTION QUERY DEBUG ===');
            console.log('Searched Reference:', tx_ref.trim());
            console.log('Found Transaction:', !!existingTransaction);
            console.log('Query Error:', fetchError);
            console.log('================================');
            if (fetchError) {
                console.error('FULL ERROR OBJECT:', JSON.stringify(fetchError, null, 2));
                return reply.code(404).send({
                    success: false,
                    error: 'Transaction not found',
                    debug: {
                        searchedReference: tx_ref.trim(),
                        errorCode: fetchError.code,
                        errorMessage: fetchError.message
                    }
                });
            }
            if (!existingTransaction) {
                fastify.log.error('❌ Transaction not found (no error but no data):', {
                    searchedReference: tx_ref.trim(),
                    userId
                });
                return reply.code(404).send({
                    success: false,
                    error: 'Transaction not found'
                });
            }
            // ✅ Get subscription plan details separately if needed
            let subscriptionPlan = null;
            if (existingTransaction.plan_id) {
                const { data: plan } = await supabase
                    .from('subscription_plans')
                    .select('*')
                    .eq('id', existingTransaction.plan_id)
                    .single();
                subscriptionPlan = plan;
            }
            fastify.log.info('✅ Transaction found successfully:', {
                transactionId: existingTransaction.id,
                reference: existingTransaction.flutterwave_reference,
                userId: existingTransaction.user_id,
                status: existingTransaction.status,
                createdAt: existingTransaction.created_at
            });
            // ✅ STEP 2: Robust user verification with multiple fallbacks
            const transactionUserId = existingTransaction.user_id?.toString().trim();
            const requestUserId = userId?.toString().trim();
            // Check various user ID formats that might occur due to JWT refresh
            const userIdsMatch = transactionUserId === requestUserId || // Exact match
                transactionUserId?.toLowerCase() === requestUserId?.toLowerCase() || // Case insensitive
                transactionUserId?.replace(/[^a-zA-Z0-9-]/g, '') === requestUserId?.replace(/[^a-zA-Z0-9-]/g, ''); // Remove special chars
            if (!userIdsMatch) {
                fastify.log.error('User ID mismatch detected:', {
                    transactionUserId,
                    requestUserId,
                    txRef: tx_ref.trim(),
                    // Check if this is a JWT refresh issue vs actual security issue
                    possibleJwtRefresh: transactionUserId?.length === requestUserId?.length
                });
                // ✅ SECURITY: In production, always validate user ownership
                // But provide helpful error message for debugging
                return reply.code(403).send({
                    success: false,
                    error: 'Transaction not authorized for current user session',
                    hint: 'This may be due to session refresh. Please try logging out and back in.'
                });
            }
            // ✅ STEP 3: Check if already processed
            if (existingTransaction.status === 'completed') {
                fastify.log.info('Payment already processed:', {
                    transactionId: existingTransaction.id,
                    status: existingTransaction.status
                });
                return reply.code(200).send({
                    success: true,
                    verified: true,
                    alreadyProcessed: true,
                    data: {
                        transactionId: existingTransaction.flutterwave_transaction_id,
                        amount: existingTransaction.amount_local,
                        currency: existingTransaction.local_currency,
                        type: existingTransaction.type,
                        plan: existingTransaction.subscription_plans
                    }
                });
            }
            // ✅ STEP 4: Verify with Flutterwave
            const verificationId = transaction_id || tx_ref;
            const verification = await flutterwaveService.verifyPayment(verificationId, supabase, fastify.log);
            if (!verification.verified) {
                fastify.log.error('Flutterwave verification failed:', {
                    verificationId,
                    response: verification
                });
                return reply.code(400).send({
                    success: false,
                    error: 'Payment verification failed with payment provider'
                });
            }
            if (verification.data?.status !== 'successful') {
                fastify.log.warn('Payment not successful:', {
                    status: verification.data?.status,
                    verificationId
                });
                return reply.code(400).send({
                    success: false,
                    verified: false,
                    error: 'Payment was not successful',
                    status: verification.data?.status
                });
            }
            // ✅ STEP 5: Update transaction status
            const updateData = {
                status: 'completed',
                completed_at: new Date().toISOString(),
                flutterwave_transaction_id: verification.data.id,
                metadata: {
                    ...existingTransaction.metadata,
                    gateway_response: verification.data,
                    verification_timestamp: new Date().toISOString()
                }
            };
            const { error: updateError } = await supabase
                .from('payment_transactions')
                .update(updateData)
                .eq('id', existingTransaction.id);
            if (updateError) {
                fastify.log.error('Failed to update transaction status:', updateError);
                // Continue processing even if update fails
            }
            // ✅ STEP 6: Process payment based on type
            try {
                if (existingTransaction.type === 'subscription') {
                    await processSubscriptionPayment(existingTransaction, transactionUserId, supabase, fastify.log);
                }
                else if (existingTransaction.type === 'topup') {
                    await processCreditTopup(existingTransaction, transactionUserId, supabase, fastify.log);
                }
            }
            catch (processingError) {
                fastify.log.error('Payment processing failed:', processingError);
                // Transaction is verified and updated, but processing failed
                // This should be handled by background job or manual intervention
            }
            fastify.log.info({
                msg: 'Payment verified and processed successfully',
                transactionId: verification.data.id,
                userId: transactionUserId,
                type: existingTransaction.type,
                amount: existingTransaction.amount_local
            });
            return reply.code(200).send({
                success: true,
                verified: true,
                data: {
                    transactionId: verification.data.id,
                    amount: existingTransaction.amount_local,
                    currency: existingTransaction.local_currency,
                    type: existingTransaction.type,
                    plan: existingTransaction.subscription_plans,
                    creditsAdded: existingTransaction.credit_amount
                }
            });
        }
        catch (error) {
            fastify.log.error('Payment verification error:', {
                error: error.message,
                stack: error.stack,
                tx_ref,
                transaction_id,
                userId
            });
            return reply.code(500).send({
                success: false,
                error: 'Internal server error during payment verification'
            });
        }
    });
    fastify.get('/api/payment/debug/transactions', async (request, reply) => {
        try {
            const userId = request.user.id;
            // Get ALL transactions for this user to see what exists
            const { data: allTransactions, error } = await supabase
                .from('payment_transactions')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(10);
            if (error) {
                fastify.log.error('Debug transactions query error:', error);
                return reply.code(500).send({ error: error.message });
            }
            fastify.log.info('Debug transactions result:', {
                userId,
                totalFound: allTransactions?.length || 0,
                transactions: allTransactions?.map(tx => ({
                    id: tx.id,
                    reference: tx.flutterwave_reference,
                    status: tx.status,
                    created_at: tx.created_at
                }))
            });
            return reply.send({
                success: true,
                userId,
                totalTransactions: allTransactions?.length || 0,
                transactions: allTransactions?.map(tx => ({
                    id: tx.id,
                    flutterwave_reference: tx.flutterwave_reference,
                    flutterwave_transaction_id: tx.flutterwave_transaction_id,
                    status: tx.status,
                    type: tx.type,
                    amount: tx.amount,
                    currency: tx.currency,
                    created_at: tx.created_at,
                    // Show all field names to verify schema
                    allFields: Object.keys(tx)
                })) || []
            });
        }
        catch (error) {
            fastify.log.error('Debug endpoint error:', error);
            return reply.code(500).send({ error: error.message });
        }
    });
    /**
     * Create or update subscription
     */
    fastify.post('/api/payment/subscription', async (request, reply) => {
        try {
            const userId = request.user.id;
            const body = request.body;
            const { planId } = body;
            if (!planId) {
                return reply.code(400).send({ error: 'Plan ID is required' });
            }
            // Get plan details
            const { data: plan, error: planError } = await supabase
                .from('subscription_plans')
                .select('*')
                .eq('id', planId)
                .single();
            if (planError || !plan) {
                return reply.code(404).send({ error: 'Subscription plan not found' });
            }
            // Check if it's a free plan
            if (plan.price === 0) {
                // Free plan - activate immediately
                const { error: subError } = await supabase
                    .from('user_subscriptions')
                    .upsert({
                    user_id: userId,
                    plan_id: planId,
                    status: 'active',
                    current_period_start: new Date().toISOString(),
                    current_period_end: null, // Free plan doesn't expire
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id'
                });
                if (subError) {
                    fastify.log.error({ msg: 'Failed to activate free plan', error: subError });
                    return reply.code(500).send({ error: 'Failed to activate subscription' });
                }
                // ✅ ADDED: Create OpenRouter key for free plan users
                try {
                    const userEmail = request.user.email;
                    if (userEmail) {
                        fastify.log.info('🔑 Creating OpenRouter key for free plan user:', { userId, planId });
                        const createResponse = await openRouterManager.createUserApiKeyWithZeroCredits(userId, userEmail, supabase, fastify.log);
                        if (createResponse.success) {
                            fastify.log.info('✅ OpenRouter key created for free plan user:', { userId });
                        }
                        else {
                            fastify.log.warn('⚠️ Failed to create OpenRouter key for free plan user:', {
                                userId,
                                error: createResponse.error
                            });
                        }
                    }
                }
                catch (openRouterError) {
                    fastify.log.warn('⚠️ OpenRouter key creation failed for free plan:', {
                        userId,
                        error: openRouterError.message
                    });
                }
                return reply.send({
                    success: true,
                    message: 'Free plan activated successfully',
                    data: { planId, status: 'active' }
                });
            }
            // Paid plan - return payment initiation info
            return reply.send({
                success: true,
                message: 'Payment required for this plan',
                data: {
                    planId,
                    amount: plan.price,
                    currency: 'USD',
                    requiresPayment: true
                }
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error managing subscription', error: error.message });
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    /**
     * Cancel subscription
     */
    fastify.delete('/api/payment/subscription', async (request, reply) => {
        try {
            const userId = request.user.id;
            const { error } = await supabase
                .from('user_subscriptions')
                .update({
                status: 'cancelled',
                // ❌ REMOVED: is_active: false (column doesn't exist)
                cancelled_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
                .eq('user_id', userId)
                .eq('status', 'active'); // ✅ FIXED: Use status instead of is_active
            if (error) {
                fastify.log.error({ msg: 'Failed to cancel subscription', error, userId });
                return reply.code(500).send({ error: 'Failed to cancel subscription' });
            }
            return reply.send({
                success: true,
                message: 'Subscription cancelled successfully'
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error cancelling subscription', error: error.message });
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    /**
     * Get transaction history
     */
    fastify.get('/api/payment/transactions', async (request, reply) => {
        try {
            const userId = request.user.id;
            const { data: transactions, error } = await supabase
                .from('payment_transactions')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            if (error) {
                fastify.log.error({ msg: 'Failed to fetch transactions', error, userId });
                return reply.code(500).send({ error: 'Failed to fetch transactions' });
            }
            // Format transactions with currency conversion
            const formattedTransactions = transactions.map(tx => ({
                ...tx,
                formattedAmount: currencyConverter_1.CurrencyConverter.format(tx.amount_local, tx.local_currency),
                formattedAmountUSD: currencyConverter_1.CurrencyConverter.format(tx.amount_usd, 'USD')
            }));
            return reply.send({
                success: true,
                data: formattedTransactions
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error fetching transactions', error: error.message });
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    /**
     * Get user's OpenRouter usage and key information
     */
    fastify.get('/api/payment/openrouter-usage', async (request, reply) => {
        try {
            const userId = request.user.id;
            const userEmail = request.user.email;
            if (!userEmail) {
                return reply.code(400).send({
                    success: false,
                    error: PaymentError.USER_EMAIL_MISSING,
                    message: 'User email is required for OpenRouter operations'
                });
            }
            fastify.log.info('📊 Fetching OpenRouter usage for user:', { userId, userEmail });
            // Get user's OpenRouter key information
            const keyInfoResponse = await openRouterManager.getUserKeyInfo(userId, supabase, fastify.log);
            if (!keyInfoResponse.success) {
                return reply.code(404).send({
                    success: false,
                    error: keyInfoResponse.error?.code || 'OPENROUTER_KEY_NOT_FOUND',
                    message: keyInfoResponse.error?.message || 'No OpenRouter key found for user'
                });
            }
            // Get local credit data for comparison
            const { data: localCredits } = await supabase
                .from('user_credit_balances')
                .select('available_credits, total_purchased, total_used, openrouter_balance, openrouter_total_used, openrouter_last_sync')
                .eq('user_id', userId)
                .single();
            // Compare and get sync status
            const syncResponse = await openRouterManager.compareAndSyncCredits(userId, supabase, fastify.log);
            const usageData = {
                userId,
                userEmail,
                openrouter: {
                    usage: keyInfoResponse.data.usage,
                    limit: keyInfoResponse.data.limit,
                    remaining: keyInfoResponse.data.remaining,
                    disabled: keyInfoResponse.data.disabled,
                    lastSynced: keyInfoResponse.data.lastSynced
                },
                local: {
                    availableCredits: localCredits?.available_credits || 0,
                    totalPurchased: localCredits?.total_purchased || 0,
                    totalUsed: localCredits?.total_used || 0,
                    openrouterBalance: localCredits?.openrouter_balance || 0,
                    openrouterTotalUsed: localCredits?.openrouter_total_used || 0,
                    lastSyncTime: localCredits?.openrouter_last_sync
                },
                sync: {
                    status: syncResponse.success ? 'success' : 'failed',
                    data: syncResponse.data || null,
                    error: syncResponse.error || null
                }
            };
            fastify.log.info('✅ OpenRouter usage data retrieved:', {
                userId,
                usage: usageData.openrouter.usage,
                remaining: usageData.openrouter.remaining
            });
            return reply.send({
                success: true,
                data: usageData
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error fetching OpenRouter usage', error: error.message, userId: request.user.id });
            return reply.code(500).send({
                success: false,
                error: 'INTERNAL_ERROR',
                message: 'Failed to fetch OpenRouter usage'
            });
        }
    });
    /**
     * Manually sync usage from OpenRouter
     */
    fastify.post('/api/payment/openrouter-sync', async (request, reply) => {
        try {
            const userId = request.user.id;
            const userEmail = request.user.email;
            if (!userEmail) {
                return reply.code(400).send({
                    success: false,
                    error: PaymentError.USER_EMAIL_MISSING,
                    message: 'User email is required for OpenRouter operations'
                });
            }
            fastify.log.info('🔄 Manual OpenRouter sync requested:', { userId, userEmail });
            // Perform credit sync
            const syncResponse = await openRouterManager.syncUserCredits(userId, supabase, fastify.log);
            if (!syncResponse.success) {
                return reply.code(400).send({
                    success: false,
                    error: syncResponse.error?.code || 'SYNC_FAILED',
                    message: syncResponse.error?.message || 'Failed to sync with OpenRouter'
                });
            }
            // Perform comparison and auto-correction if needed
            const compareResponse = await openRouterManager.compareAndSyncCredits(userId, supabase, fastify.log);
            const syncResult = {
                usage: syncResponse.data.usage,
                limit: syncResponse.data.limit,
                remaining: syncResponse.data.remaining,
                disabled: syncResponse.data.disabled,
                lastSynced: syncResponse.data.lastSynced,
                comparison: compareResponse.success ? compareResponse.data : null
            };
            fastify.log.info('✅ Manual OpenRouter sync completed:', {
                userId,
                usage: syncResult.usage,
                remaining: syncResult.remaining,
                syncStatus: compareResponse.success
            });
            return reply.send({
                success: true,
                message: 'OpenRouter usage synced successfully',
                data: syncResult
            });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error during manual OpenRouter sync', error: error.message, userId: request.user.id });
            return reply.code(500).send({
                success: false,
                error: 'INTERNAL_ERROR',
                message: 'Failed to sync OpenRouter usage'
            });
        }
    });
    /**
     * Get billing dashboard data
     */
    fastify.get('/api/payment/dashboard', async (request, reply) => {
        try {
            const userId = request.user.id;
            // ✅ FIXED: Query actual tables instead of user_billing_summary view
            // Get subscription data directly
            const { data: subscription } = await supabase
                .from('user_subscriptions')
                .select(`
        *,
        subscription_plans (
          id,
          name,
          price,
          credits
        )
      `)
                .eq('user_id', userId)
                .eq('status', 'active')
                .single();
            // Get credits data directly
            const { data: credits } = await supabase
                .from('user_credit_balances')
                .select('*')
                .eq('user_id', userId)
                .single();
            // Get transaction summary
            const { data: transactions } = await supabase
                .from('payment_transactions')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'completed');
            // Calculate totals
            const totalTransactions = transactions?.length || 0;
            const totalSpent = transactions?.reduce((sum, tx) => sum + (tx.amount_usd || 0), 0) || 0;
            // Get recent transactions
            const { data: recentTransactions } = await supabase
                .from('payment_transactions')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(5);
            // ✅ Build the billing summary manually
            const billingData = {
                user_id: userId,
                email: request.user.email,
                plan_name: subscription?.subscription_plans?.name || null,
                plan_price: subscription?.subscription_plans?.price || null,
                subscription_status: subscription?.status || null,
                current_period_end: subscription?.current_period_end || null,
                available_credits: credits?.available_credits || 0,
                total_purchased: credits?.total_purchased || 0,
                total_used: credits?.total_used || 0,
                total_transactions: totalTransactions,
                total_spent: totalSpent.toString()
            };
            // ✅ Enhanced debug logging
            console.log('=== DASHBOARD DATA DEBUG ===');
            console.log('User ID:', userId);
            console.log('Subscription found:', !!subscription);
            console.log('Credits found:', !!credits);
            console.log('Billing Data:', JSON.stringify(billingData, null, 2));
            console.log('================================');
            return reply.send({
                success: true,
                data: {
                    billing: billingData,
                    recentTransactions: recentTransactions || [],
                    supportedCurrencies: currencyConverter_1.CurrencyConverter.getSupportedCurrencies().slice(0, 10)
                }
            });
        }
        catch (error) {
            console.error('Dashboard error:', error);
            fastify.log.error({ msg: 'Error fetching billing dashboard', error: error.message });
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    fastify.post('/api/payment/create-openrouter-key', {
        schema: {
            body: {
                type: 'object',
                properties: {},
                additionalProperties: false
            }
        }
    }, async (request, reply) => {
        try {
            const userId = request.user.id;
            const userEmail = request.user.email;
            if (!userEmail) {
                return reply.code(400).send({
                    error: 'USER_EMAIL_MISSING',
                    message: 'User email is required to create OpenRouter key'
                });
            }
            // Get user's current credit balance
            const { data: credits } = await supabase
                .from('user_credit_balances')
                .select('total_purchased')
                .eq('user_id', userId)
                .single();
            const totalCredits = credits?.total_purchased || 0;
            // ✅ FIXED: Use direct creation method instead of ensure
            const keyResult = await openRouterManager.createUserApiKey(userId, userEmail, totalCredits, supabase, fastify.log);
            if (keyResult.success) {
                fastify.log.info('✅ OpenRouter key created successfully for user', {
                    userId,
                    totalCredits,
                    keyCreated: !!keyResult.data?.key
                });
                return reply.send({
                    success: true,
                    message: 'OpenRouter key created successfully',
                    creditLimit: totalCredits,
                    keyLength: keyResult.data?.key?.length // Don't expose actual key
                });
            }
            else {
                fastify.log.error('❌ Failed to create OpenRouter key:', keyResult.error);
                return reply.code(500).send({
                    error: keyResult.error?.code || 'OPENROUTER_KEY_CREATION_FAILED',
                    message: keyResult.error?.message || 'Failed to create OpenRouter key'
                });
            }
        }
        catch (error) {
            fastify.log.error('❌ Failed to create OpenRouter key manually:', error);
            return reply.code(500).send({
                error: 'OPENROUTER_KEY_CREATION_FAILED',
                message: error.message
            });
        }
    });
    /**
     * Webhook endpoint for Flutterwave (no auth needed)
     */
    fastify.post('/api/payment/webhook', async (request, reply) => {
        try {
            const rawBody = JSON.stringify(request.body);
            const signature = request.headers['verif-hash'];
            // Verify webhook signature
            if (!flutterwaveService.verifyWebhookSignature(rawBody, signature)) {
                fastify.log.warn({ msg: 'Invalid webhook signature' });
                return reply.code(400).send({ error: 'Invalid signature' });
            }
            const webhookData = request.body;
            const success = await flutterwaveService.processWebhook(webhookData, supabase, fastify.log);
            if (!success) {
                return reply.code(500).send({ error: 'Failed to process webhook' });
            }
            return reply.send({ success: true });
        }
        catch (error) {
            fastify.log.error({ msg: 'Error processing webhook', error: error.message });
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
    // ✅ HELPER FUNCTIONS
    // Replace the processSubscriptionPayment function around line 900 with this fixed version:
    // Replace your processSubscriptionPayment function completely with this fixed version:
    async function processSubscriptionPayment(transaction, userId, supabase, logger) {
        try {
            logger.info('🔥 Starting subscription processing:', {
                userId,
                transactionId: transaction.id,
                planId: transaction.plan_id
            });
            // ✅ FIX 1: Get user email correctly
            let userEmail = '';
            // Try getting from users table first
            const { data: userProfile, error: profileError } = await supabase
                .from('users')
                .select('email')
                .eq('id', userId)
                .single();
            if (userProfile?.email) {
                userEmail = userProfile.email;
                logger.info('✅ Got user email from users table:', {
                    userId,
                    email: userEmail.substring(0, 3) + '***' + userEmail.substring(userEmail.length - 4)
                });
            }
            else {
                logger.warn('⚠️ User email not found in users table, trying auth table:', {
                    userId,
                    profileError
                });
                // Fallback: Try getting from auth.users table
                const { data: authUserData, error: authError } = await supabase.auth.admin.getUserById(userId);
                if (authUserData?.user?.email) {
                    userEmail = authUserData.user.email;
                    logger.info('✅ Got user email from auth table:', {
                        userId,
                        email: userEmail.substring(0, 3) + '***' + userEmail.substring(userEmail.length - 4)
                    });
                }
                else {
                    logger.error('❌ Could not retrieve user email from any source:', {
                        userId,
                        authError
                    });
                    throw new Error('User email not found - cannot process subscription');
                }
            }
            // ✅ FIX 2: Get subscription plan details
            const { data: plan, error: planError } = await supabase
                .from('subscription_plans')
                .select('*')
                .eq('id', transaction.plan_id)
                .single();
            if (planError || !plan) {
                logger.error('❌ Subscription plan not found:', { planId: transaction.plan_id, planError });
                throw new Error('Subscription plan not found');
            }
            logger.info('✅ Subscription plan retrieved:', {
                planId: plan.id,
                planName: plan.name,
                planPrice: plan.price,
                planCredits: plan.credits
            });
            // ✅ FIX 3: Create or update subscription with correct fields
            const subscriptionData = {
                user_id: userId,
                plan_id: transaction.plan_id,
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: calculatePeriodEnd(plan.billing_cycle || 'monthly'),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            const { data: subscriptionResult, error: subscriptionError } = await supabase
                .from('user_subscriptions')
                .upsert(subscriptionData, {
                onConflict: 'user_id'
            })
                .select('*');
            if (subscriptionError) {
                logger.error('❌ Failed to create/update subscription:', subscriptionError);
                throw subscriptionError;
            }
            logger.info('✅ Subscription created/updated successfully:', {
                userId,
                planId: transaction.plan_id,
                subscriptionResult
            });
            // ✅ FIX 4: Handle credits and OpenRouter key for ALL plans
            const creditAmount = parseFloat(plan.credits) || 0;
            logger.info('🎯 Processing subscription plan credits:', {
                userId,
                planName: plan.name,
                planPrice: plan.price,
                creditAmount,
                isFreeplan: plan.price === 0
            });
            if (creditAmount > 0) {
                // PAID PLAN WITH CREDITS
                logger.info('💰 Processing paid plan with credits:', {
                    userId,
                    creditAmount,
                    planName: plan.name
                });
                const { data: currentCredits } = await supabase
                    .from('user_credit_balances')
                    .select('available_credits, total_purchased, total_used')
                    .eq('user_id', userId)
                    .single();
                // Calculate new amounts
                const newAvailableCredits = (currentCredits?.available_credits || 0) + creditAmount;
                const newTotalPurchased = (currentCredits?.total_purchased || 0) + creditAmount;
                // Update credit balance
                const { data: creditResult, error: creditsError } = await supabase
                    .from('user_credit_balances')
                    .upsert({
                    user_id: userId,
                    available_credits: newAvailableCredits,
                    total_purchased: newTotalPurchased,
                    total_used: currentCredits?.total_used || 0,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id'
                })
                    .select('*');
                if (creditsError) {
                    logger.error('❌ Credits update failed:', creditsError);
                    throw creditsError;
                }
                // Log the credit transaction
                const { error: transactionError } = await supabase
                    .from('credit_transactions')
                    .insert({
                    user_id: userId,
                    amount: creditAmount,
                    transaction_type: 'purchase',
                    source: 'subscription',
                    reference: transaction.id,
                    balance_after: newAvailableCredits,
                    created_at: new Date().toISOString()
                });
                if (transactionError) {
                    logger.warn('Failed to log credit transaction:', transactionError);
                    // Don't throw - credit update was successful
                }
                logger.info('✅ Subscription credits updated successfully:', {
                    userId,
                    creditsAdded: creditAmount,
                    newAvailableCredits: creditResult[0]?.available_credits,
                    newTotalPurchased: creditResult[0]?.total_purchased
                });
                // ✅ FIX 5: Create OpenRouter key with credits for PAID plans
                try {
                    const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
                    logger.info('🔑 Creating/updating OpenRouter key for paid subscription:', {
                        userId,
                        userEmail: userEmail.substring(0, 3) + '***' + userEmail.substring(userEmail.length - 4),
                        newCreditLimit: creditResult[0]?.available_credits
                    });
                    // ✅ CRITICAL: Use ensureUserApiKey to create OR update existing key
                    const ensureResponse = await openRouterManager.ensureUserApiKey(userId, userEmail, creditResult[0]?.available_credits || creditAmount, supabase, logger);
                    if (!ensureResponse.success) {
                        logger.error('❌ OpenRouter key setup failed for paid plan:', {
                            userId,
                            error: ensureResponse.error
                        });
                        // Don't throw - subscription was successful, OpenRouter can be fixed later
                    }
                    else {
                        logger.info('✅ OpenRouter key setup completed successfully for paid plan:', { userId });
                    }
                }
                catch (openRouterError) {
                    logger.error('❌ OpenRouter integration failed during paid subscription:', {
                        userId,
                        error: openRouterError.message,
                        creditAmount
                    });
                    // Don't throw - subscription was successful
                }
            }
            else if (plan.price === 0) {
                // FREE PLAN - Create zero-credit OpenRouter key
                logger.info('🆓 Processing free plan subscription:', {
                    userId,
                    planName: plan.name
                });
                try {
                    const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
                    logger.info('🔑 Creating zero-credit OpenRouter key for free plan:', {
                        userId,
                        userEmail: userEmail.substring(0, 3) + '***' + userEmail.substring(userEmail.length - 4)
                    });
                    // ✅ Use createUserApiKeyWithZeroCredits for free plans
                    const createResponse = await openRouterManager.createUserApiKeyWithZeroCredits(userId, userEmail, supabase, logger);
                    if (!createResponse.success) {
                        logger.warn('⚠️ Failed to create OpenRouter key for free plan:', {
                            userId,
                            error: createResponse.error
                        });
                    }
                    else {
                        logger.info('✅ OpenRouter key created successfully for free plan:', { userId });
                    }
                }
                catch (openRouterError) {
                    logger.warn('⚠️ OpenRouter key setup failed for free plan:', {
                        userId,
                        error: openRouterError.message
                    });
                }
            }
            else {
                // PAID PLAN WITH NO CREDITS (shouldn't happen but handle it)
                logger.warn('⚠️ Paid plan with no credits - creating basic OpenRouter key:', {
                    userId,
                    planName: plan.name,
                    planPrice: plan.price
                });
                try {
                    const openRouterManager = new openRouterManager_1.OpenRouterManager(openRouterProvisioningKey);
                    const ensureResponse = await openRouterManager.ensureUserApiKey(userId, userEmail, 0, // No credits for this edge case
                    supabase, logger);
                    if (!ensureResponse.success) {
                        logger.warn('⚠️ Failed to ensure OpenRouter key for no-credit paid plan:', {
                            userId,
                            error: ensureResponse.error
                        });
                    }
                    else {
                        logger.info('✅ OpenRouter key ensured for no-credit paid plan:', { userId });
                    }
                }
                catch (openRouterError) {
                    logger.warn('⚠️ OpenRouter key setup failed for no-credit paid plan:', {
                        userId,
                        error: openRouterError.message
                    });
                }
            }
            logger.info('🎉 Subscription processing completed successfully:', {
                userId,
                planName: plan.name,
                creditsAdded: creditAmount
            });
            return { success: true, planName: plan.name, creditsAdded: creditAmount };
        }
        catch (error) {
            logger.error('🔥 Subscription processing failed:', {
                userId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
    /**
     * Process credit top-up
     */
    async function processCreditTopup(transaction, userId, supabase, logger) {
        try {
            logger.info('🔄 Starting credit topup processing:', {
                userId,
                transactionId: transaction.id,
                creditAmount: transaction.credit_amount,
                type: transaction.type
            });
            // ✅ FIX 1: Get user email correctly (same approach as subscription processing)
            let userEmail = '';
            // Try getting from users table first
            const { data: userProfile, error: profileError } = await supabase
                .from('users')
                .select('email')
                .eq('id', userId)
                .single();
            if (userProfile?.email) {
                userEmail = userProfile.email;
                logger.info('✅ Got user email from users table for topup:', {
                    userId,
                    email: userEmail.substring(0, 3) + '***' + userEmail.substring(userEmail.length - 4)
                });
            }
            else {
                logger.warn('⚠️ User email not found in users table, trying auth table for topup:', {
                    userId,
                    profileError
                });
                // Fallback: Try getting from auth.users table
                const { data: authUserData, error: authError } = await supabase.auth.admin.getUserById(userId);
                if (authUserData?.user?.email) {
                    userEmail = authUserData.user.email;
                    logger.info('✅ Got user email from auth table for topup:', {
                        userId,
                        email: userEmail.substring(0, 3) + '***' + userEmail.substring(userEmail.length - 4)
                    });
                }
                else {
                    logger.error('❌ Could not retrieve user email from any source for topup:', {
                        userId,
                        authError
                    });
                    throw new Error('User email not found - cannot process topup');
                }
            }
            // ✅ Get current credits
            const { data: currentCredits } = await supabase
                .from('user_credit_balances')
                .select('available_credits, total_purchased, total_used')
                .eq('user_id', userId)
                .single();
            console.log('=== TOPUP CREDITS DEBUG ===');
            console.log('Current Credits:', currentCredits);
            console.log('Credit Amount to Add:', transaction.credit_amount);
            console.log('Credit Amount (openrouter):', transaction.openrouter_credit_amount);
            console.log('User Email Found:', !!userEmail);
            console.log('================================');
            // Calculate new amounts
            const creditAmount = parseFloat(transaction.credit_amount || transaction.openrouter_credit_amount || '0');
            const newAvailableCredits = (currentCredits?.available_credits || 0) + creditAmount;
            const newTotalPurchased = (currentCredits?.total_purchased || 0) + creditAmount;
            // ✅ Update user_credit_balances table
            const { data: updatedCredits, error: creditsError } = await supabase
                .from('user_credit_balances')
                .upsert({
                user_id: userId,
                available_credits: newAvailableCredits,
                total_purchased: newTotalPurchased,
                total_used: currentCredits?.total_used || 0,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            })
                .select('*');
            if (creditsError) {
                console.log('=== CREDITS UPDATE ERROR ===');
                console.log('Error:', JSON.stringify(creditsError, null, 2));
                console.log('Update Data:', {
                    user_id: userId,
                    available_credits: newAvailableCredits,
                    total_purchased: newTotalPurchased,
                    total_used: currentCredits?.total_used || 0
                });
                console.log('================================');
                logger.error('❌ Failed to add topup credits:', creditsError);
                throw creditsError;
            }
            logger.info('✅ Topup credits added successfully:', {
                userId,
                creditsAdded: creditAmount,
                newAvailableCredits: newAvailableCredits,
                newTotalPurchased: newTotalPurchased,
                updatedCredits: updatedCredits[0]
            });
            // ✅ Log the credit transaction
            const { error: transactionError } = await supabase
                .from('credit_transactions')
                .insert({
                user_id: userId,
                amount: creditAmount,
                transaction_type: 'purchase',
                source: 'topup',
                reference: transaction.id,
                balance_after: newAvailableCredits,
                created_at: new Date().toISOString()
            });
            if (transactionError) {
                logger.warn('Failed to log credit transaction for topup:', transactionError);
                // Don't throw - credit update was successful
            }
            // ✅ FIX 2: Update OpenRouter key limit after successful credit topup
            try {
                logger.info('🔑 Updating OpenRouter key for credit topup:', {
                    userId,
                    userEmail: userEmail.substring(0, 3) + '***' + userEmail.substring(userEmail.length - 4),
                    creditAmount,
                    newCreditLimit: newAvailableCredits
                });
                // ✅ Use ensureUserApiKey to update the credit limit
                const ensureResponse = await openRouterManager.ensureUserApiKey(userId, userEmail, newAvailableCredits, // Set the new total credit limit
                supabase, logger);
                if (!ensureResponse.success) {
                    logger.error('❌ OpenRouter credit update failed for topup:', {
                        userId,
                        error: ensureResponse.error,
                        creditAmount,
                        newTotalCredits: newAvailableCredits
                    });
                    // For topups, this is critical since user paid specifically for credits
                    logger.error('🚨 CRITICAL: Topup succeeded locally but failed on OpenRouter - manual intervention required:', {
                        userId,
                        transactionId: transaction.id,
                        creditAmount,
                        localCredits: newAvailableCredits
                    });
                    // Don't throw - user got their local credits, admin can fix OpenRouter later
                }
                else {
                    logger.info('✅ OpenRouter credits updated successfully for topup:', {
                        userId,
                        creditAmount,
                        newTotalCredits: newAvailableCredits
                    });
                    // ✅ Sync credits to ensure consistency
                    const syncResponse = await openRouterManager.syncUserCredits(userId, supabase, logger);
                    if (syncResponse.success) {
                        logger.info('✅ OpenRouter credits synced after topup:', {
                            userId,
                            syncData: syncResponse.data
                        });
                    }
                    else {
                        logger.warn('⚠️ Credit sync failed after topup but update succeeded:', {
                            userId,
                            error: syncResponse.error
                        });
                    }
                }
            }
            catch (openRouterError) {
                logger.error('❌ OpenRouter integration failed during topup:', {
                    userId,
                    error: openRouterError.message,
                    creditAmount,
                    newTotalCredits: newAvailableCredits
                });
                // For topups, this is more critical since user paid specifically for credits
                // But we've already added credits locally, so log this for manual resolution
                logger.error('🚨 CRITICAL: Topup succeeded locally but OpenRouter integration failed - manual intervention required:', {
                    userId,
                    transactionId: transaction.id,
                    creditAmount,
                    localCredits: newAvailableCredits,
                    error: openRouterError.message
                });
                // Don't throw - user got their local credits, admin can fix OpenRouter later
            }
            logger.info('🎉 Credit topup processing completed successfully:', {
                userId,
                creditsAdded: creditAmount,
                newTotalCredits: newAvailableCredits
            });
            return true;
        }
        catch (error) {
            logger.error('❌ Failed to process credit topup:', {
                error: error.message,
                stack: error.stack,
                userId,
                transactionId: transaction.id
            });
            throw error;
        }
    }
    /**
     * Calculate subscription period end date
     */
    function calculatePeriodEnd(billingCycle) {
        const now = new Date();
        switch (billingCycle) {
            case 'monthly':
                now.setMonth(now.getMonth() + 1);
                break;
            case 'yearly':
                now.setFullYear(now.getFullYear() + 1);
                break;
            case 'weekly':
                now.setDate(now.getDate() + 7);
                break;
            default:
                now.setMonth(now.getMonth() + 1);
        }
        return now.toISOString();
    }
}
