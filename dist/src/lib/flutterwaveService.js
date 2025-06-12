"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlutterwaveService = void 0;
const currencyConverter_1 = require("./currencyConverter");
class FlutterwaveService {
    constructor(publicKey, secretKey, webhookSecret) {
        if (!secretKey || !publicKey) {
            throw new Error('Flutterwave public and secret keys are required');
        }
        this.publicKey = publicKey;
        this.secretKey = secretKey;
        this.webhookSecret = webhookSecret;
        this.baseUrl = 'https://api.flutterwave.com/v3';
    }
    /**
     * Initialize payment using Flutterwave Standard API
     * ✅ FIXED: Using correct database field names
     */
    async initializePayment(paymentData, supabase, logger) {
        try {
            const reference = `${paymentData.type}_${paymentData.userId}_${Date.now()}`;
            // ✅ FIXED: Keep amount in user's currency for Flutterwave
            // Only convert to USD for internal credit calculations
            const amountInUSD = paymentData.currency === 'USD'
                ? paymentData.amount
                : currencyConverter_1.CurrencyConverter.toUSD(paymentData.amount, paymentData.currency);
            // ✅ Calculate credit amount based on type (in USD for consistency)
            let creditAmount;
            let platformFeeUSD;
            if (paymentData.type === 'subscription' && paymentData.planId) {
                const { data: planData, error: planError } = await supabase
                    .from('subscription_plans')
                    .select('credits')
                    .eq('id', paymentData.planId)
                    .single();
                if (planError || !planData) {
                    logger.error({ msg: 'Plan not found for subscription', planId: paymentData.planId, error: planError });
                    throw new Error('Subscription plan not found');
                }
                creditAmount = parseFloat(planData.credits) || 0;
                platformFeeUSD = amountInUSD - creditAmount;
                logger.info({
                    msg: 'Subscription transaction - using plan credits',
                    planId: paymentData.planId,
                    paymentAmountUSD: amountInUSD,
                    paymentAmountLocal: paymentData.amount,
                    currency: paymentData.currency,
                    creditsToReceive: creditAmount,
                    platformFee: platformFeeUSD
                });
            }
            else {
                // ✅ FIXED: For top-ups, user specifies USD amount but pays in local currency (same as subscriptions)
                // The amount they want in USD credits (like plan price)
                const creditAmountUSD = paymentData.amount; // This should be the USD amount they want
                // Convert to local currency for payment (same logic as subscriptions)
                creditAmount = paymentData.currency === 'USD'
                    ? paymentData.amount
                    : currencyConverter_1.CurrencyConverter.toUSD(paymentData.amount, paymentData.currency);
                platformFeeUSD = creditAmount * 0.15; // 15% platform fee based on USD credits
                logger.info({
                    msg: 'Top-up transaction - local payment for USD credits',
                    paymentAmountLocal: paymentData.amount, // ✅ What user pays (₦7,462)
                    paymentCurrency: paymentData.currency, // ✅ Local currency (NGN)
                    creditsInUSD: creditAmount, // ✅ USD credits they get ($5)
                    creditsToReceive: creditAmount, // ✅ Credits in USD ($5)
                    platformFeeUSD: platformFeeUSD, // ✅ Platform fee in USD
                    exchangeRate: currencyConverter_1.CurrencyConverter.getExchangeRate(paymentData.currency, 'USD')
                });
            }
            const exchangeRate = paymentData.currency === 'USD'
                ? 1.0
                : currencyConverter_1.CurrencyConverter.getExchangeRate(paymentData.currency, 'USD');
            const supportedMethods = currencyConverter_1.CurrencyConverter.getSupportedPaymentMethods(paymentData.currency);
            const paymentOptions = supportedMethods.join(',');
            // ✅ CRITICAL FIX: Send user's currency and amount to Flutterwave
            const payload = {
                tx_ref: reference,
                amount: paymentData.amount.toString(), // ✅ User's amount in their currency
                currency: paymentData.currency.toUpperCase(), // ✅ User's currency
                redirect_url: paymentData.redirectUrl,
                customer: {
                    email: paymentData.email,
                    name: paymentData.fullName || paymentData.email.split('@')[0],
                    ...(paymentData.phoneNumber && { phonenumber: paymentData.phoneNumber })
                },
                customizations: {
                    title: paymentData.type === 'subscription' ? 'Thryve Subscription' : 'Thryve Credits',
                    description: paymentData.type === 'subscription'
                        ? 'Subscribe to unlock premium AI features'
                        : 'Top up your AI credits',
                    logo: ''
                },
                meta: {
                    user_id: paymentData.userId,
                    type: paymentData.type,
                    plan_id: paymentData.planId || '',
                    platform_fee_usd: platformFeeUSD,
                    credit_amount: creditAmount,
                    exchange_rate: exchangeRate,
                    country: paymentData.country || 'NG',
                    // ✅ Store both amounts for reference
                    amount_usd: amountInUSD,
                    amount_local: paymentData.amount,
                    local_currency: paymentData.currency
                },
                payment_options: paymentOptions,
                configurations: {
                    session_duration: 1440,
                    max_retry_attempt: 3
                }
            };
            logger.info({
                msg: 'Initializing Flutterwave payment',
                reference,
                currency: paymentData.currency, // ✅ User's currency
                amountLocal: paymentData.amount, // ✅ Amount in user's currency
                amountUSD: amountInUSD,
                exchangeRate,
                supportedMethods,
                creditsToReceive: creditAmount,
                platformFee: platformFeeUSD
            });
            // ✅ Store transaction record
            const { data: transaction, error: dbError } = await supabase
                .from('payment_transactions')
                .insert({
                user_id: paymentData.userId,
                flutterwave_reference: reference,
                flutterwave_transaction_id: null,
                type: paymentData.type,
                plan_id: paymentData.planId || null,
                // ✅ Store in user's currency
                amount: paymentData.amount, // ✅ User's currency amount
                currency: paymentData.currency, // ✅ User's currency
                credit_amount: creditAmount,
                // Additional tracking fields
                amount_usd: amountInUSD,
                amount_local: paymentData.amount,
                local_currency: paymentData.currency,
                exchange_rate: exchangeRate,
                openrouter_credit_amount: creditAmount,
                platform_fee: platformFeeUSD,
                status: 'pending',
                country: paymentData.country || 'NG',
                metadata: {
                    customer_info: {
                        email: paymentData.email,
                        name: paymentData.fullName || paymentData.email.split('@')[0],
                        phone: paymentData.phoneNumber
                    },
                    payload_sent: payload
                }
            })
                .select()
                .single();
            if (dbError) {
                logger.error('Failed to store payment transaction:', {
                    error: dbError,
                    reference,
                    userId: paymentData.userId,
                    amount: paymentData.amount,
                    currency: paymentData.currency,
                    type: paymentData.type
                });
                throw new Error(`Failed to record payment transaction: ${dbError.message}`);
            }
            if (!transaction) {
                logger.error('Transaction not returned from database insert:', { reference });
                throw new Error('Failed to create transaction record');
            }
            logger.info('Transaction created successfully:', {
                transactionId: transaction.id,
                reference,
                amountLocal: paymentData.amount,
                currency: paymentData.currency,
                creditsToReceive: creditAmount
            });
            // ✅ Send to Flutterwave API
            const response = await fetch(`${this.baseUrl}/payments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.secretKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            const responseData = await response.json();
            if (!response.ok || responseData.status !== 'success') {
                logger.error({ msg: 'Flutterwave payment initialization failed', response: responseData });
                await supabase
                    .from('payment_transactions')
                    .update({
                    status: 'failed',
                    metadata: {
                        ...transaction.metadata,
                        failure_reason: responseData.message || 'Payment initialization failed',
                        error_response: responseData
                    },
                    updated_at: new Date().toISOString()
                })
                    .eq('id', transaction.id);
                throw new Error(`Payment initialization failed: ${responseData.message || 'Unknown error'}`);
            }
            const paymentUrl = responseData.data.link;
            if (!paymentUrl) {
                throw new Error('No payment link received from Flutterwave');
            }
            // ✅ Update transaction with Flutterwave response
            await supabase
                .from('payment_transactions')
                .update({
                flutterwave_transaction_id: responseData.data.id?.toString() || null,
                metadata: {
                    ...transaction.metadata,
                    flutterwave_response: responseData.data,
                    payment_link: paymentUrl
                },
                updated_at: new Date().toISOString()
            })
                .eq('id', transaction.id);
            logger.info({
                msg: 'Payment initialized successfully',
                reference,
                currency: paymentData.currency,
                amount: paymentData.amount,
                paymentUrl
            });
            return {
                paymentUrl,
                reference,
                transaction_id: responseData.data.id
            };
        }
        catch (error) {
            logger.error({ msg: 'Error initializing payment', error: error.message, stack: error.stack, paymentData });
            throw error;
        }
    }
    /**
     * ✅ FIXED: Verify payment using transaction ID with correct field names
     */
    async verifyPayment(transactionId, supabase, logger) {
        try {
            logger.info({ msg: 'Verifying payment', transactionId });
            const response = await fetch(`${this.baseUrl}/transactions/${transactionId}/verify`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.secretKey}`,
                    'Content-Type': 'application/json'
                }
            });
            const responseData = await response.json();
            if (!response.ok || responseData.status !== 'success') {
                logger.warn({ msg: 'Payment verification failed', transactionId, response: responseData });
                return { verified: false };
            }
            const paymentData = responseData.data;
            // ✅ FIXED: Update transaction status in database with correct field names
            const { error: updateError } = await supabase
                .from('payment_transactions')
                .update({
                status: paymentData.status === 'successful' ? 'completed' : 'failed',
                payment_method: paymentData.payment_type,
                flutterwave_transaction_id: paymentData.id.toString(), // ✅ FIXED
                metadata: {
                    verification_data: paymentData,
                    processor_response: paymentData.processor_response
                },
                completed_at: paymentData.status === 'successful' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            })
                .eq('flutterwave_reference', paymentData.tx_ref); // ✅ FIXED
            if (updateError) {
                logger.error({ msg: 'Failed to update transaction status', error: updateError });
            }
            logger.info({ msg: 'Payment verified successfully', transactionId, status: paymentData.status });
            return {
                verified: paymentData.status === 'successful',
                data: paymentData
            };
        }
        catch (error) {
            logger.error({ msg: 'Error verifying payment', error: error.message, transactionId });
            return { verified: false };
        }
    }
    /**
     * Get supported payment methods with enhanced international currency support
     */
    getPaymentMethods(country, currency) {
        // Check if currency is supported
        if (!currencyConverter_1.CurrencyConverter.isSupported(currency)) {
            return {
                country,
                currency,
                methods: []
            };
        }
        // Get supported payment methods for this currency
        const supportedMethods = currencyConverter_1.CurrencyConverter.getSupportedPaymentMethods(currency);
        const methods = supportedMethods.map(method => {
            switch (method) {
                case 'card':
                    return {
                        type: 'card',
                        name: 'Debit/Credit Card',
                        icon: '💳',
                        supported_currencies: Object.keys(currencyConverter_1.CurrencyConverter.getSupportedCurrencies())
                    };
                case 'applepay':
                    return {
                        type: 'applepay',
                        name: 'Apple Pay',
                        icon: '🍎',
                        supported_currencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'NGN', 'GHS']
                    };
                case 'googlepay':
                    return {
                        type: 'googlepay',
                        name: 'Google Pay',
                        icon: '🟢',
                        supported_currencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'NGN', 'GHS']
                    };
                default:
                    return {
                        type: method,
                        name: method.charAt(0).toUpperCase() + method.slice(1),
                        icon: '💰',
                        supported_currencies: [currency]
                    };
            }
        });
        return {
            country,
            currency,
            methods
        };
    }
    /**
     * Create a payment plan for subscriptions using Flutterwave Standard API
     */
    async createPaymentPlan(planData, supabase, logger) {
        try {
            logger.info({ msg: 'Creating Flutterwave payment plan', planData });
            const payload = {
                amount: planData.amount,
                name: planData.name,
                interval: planData.interval.toLowerCase(),
                currency: planData.currency.toUpperCase(),
                ...(planData.duration && { duration: planData.duration })
            };
            const response = await fetch(`${this.baseUrl}/payment-plans`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.secretKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            const responseData = await response.json();
            if (!response.ok || responseData.status !== 'success') {
                logger.error({ msg: 'Flutterwave payment plan creation failed', response: responseData });
                throw new Error(`Payment plan creation failed: ${responseData.message || 'Unknown error'}`);
            }
            const plan = responseData.data;
            logger.info({ msg: 'Payment plan created successfully', planId: plan.id });
            return {
                id: plan.id,
                name: plan.name,
                amount: plan.amount,
                interval: plan.interval,
                currency: plan.currency,
                plan_token: plan.plan_token,
                status: plan.status,
                created_at: plan.created_at
            };
        }
        catch (error) {
            logger.error({ msg: 'Error creating payment plan', error: error.message, planData });
            throw error;
        }
    }
    /**
     * Verify webhook signature (as per Flutterwave documentation)
     */
    verifyWebhookSignature(payload, signature) {
        if (!this.webhookSecret || !signature) {
            return false;
        }
        try {
            // Flutterwave sends the signature in the 'verif-hash' header
            return signature === this.webhookSecret;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * ✅ FIXED: Process webhook event with correct field names
     */
    async processWebhook(webhookData, supabase, logger) {
        try {
            logger.info({ msg: 'Processing Flutterwave webhook', event: webhookData.event });
            if (webhookData.event === 'charge.completed') {
                const transactionData = webhookData.data;
                // ✅ FIXED: Find the transaction by flutterwave_reference
                const { data: existingTransaction, error: fetchError } = await supabase
                    .from('payment_transactions')
                    .select('*')
                    .eq('flutterwave_reference', transactionData.tx_ref) // ✅ FIXED
                    .single();
                if (fetchError) {
                    logger.error({ msg: 'Transaction not found for webhook', txRef: transactionData.tx_ref });
                    return false;
                }
                // Update transaction status
                const updateData = {
                    status: transactionData.status === 'successful' ? 'completed' : 'failed',
                    payment_method: transactionData.payment_type,
                    flutterwave_transaction_id: transactionData.id.toString(), // ✅ FIXED
                    metadata: {
                        ...existingTransaction.metadata,
                        verification_data: transactionData
                    },
                    updated_at: new Date().toISOString()
                };
                if (transactionData.status === 'successful') {
                    updateData.completed_at = new Date().toISOString();
                }
                const { error: updateError } = await supabase
                    .from('payment_transactions')
                    .update(updateData)
                    .eq('flutterwave_reference', transactionData.tx_ref); // ✅ FIXED
                if (updateError) {
                    logger.error({ msg: 'Failed to update transaction from webhook', error: updateError });
                    return false;
                }
                // If payment successful, update user credits or subscription
                if (transactionData.status === 'successful') {
                    if (existingTransaction.type === 'topup') { // ✅ FIXED
                        await this.updateUserKeyLimit(existingTransaction.user_id, existingTransaction.openrouter_credit_amount, supabase, logger);
                    }
                    else if (existingTransaction.type === 'subscription') { // ✅ FIXED
                        await this.updateUserSubscription(existingTransaction.user_id, existingTransaction.plan_id, supabase, logger);
                    }
                }
                logger.info({ msg: 'Webhook processed successfully', txRef: transactionData.tx_ref });
                return true;
            }
            // Handle subscription events
            if (webhookData.event === 'subscription.cancelled') {
                const subscriptionData = webhookData.data;
                logger.info({ msg: 'Subscription cancelled webhook received', subscriptionData });
                return true;
            }
            return true;
        }
        catch (error) {
            logger.error({ msg: 'Error processing webhook', error: error.message, webhookData });
            return false;
        }
    }
    /**
     * Update user OpenRouter key limit
     */
    async updateUserKeyLimit(userId, creditAmount, supabase, logger) {
        try {
            logger.info({ msg: 'Updating user key limit', userId, creditAmount });
            // Get user's active OpenRouter key
            const { data: userKey, error: keyError } = await supabase
                .from('user_openrouter_keys')
                .select('*')
                .eq('user_id', userId)
                .eq('is_active', true)
                .single();
            if (keyError || !userKey) {
                logger.error({ msg: 'No active OpenRouter key found for user', userId, error: keyError });
                return false;
            }
            // Update credit limit
            const newCreditLimit = (userKey.credit_limit || 0) + creditAmount;
            // Update locally
            const { error: updateError } = await supabase
                .from('user_openrouter_keys')
                .update({
                credit_limit: newCreditLimit,
                updated_at: new Date().toISOString()
            })
                .eq('id', userKey.id);
            if (updateError) {
                logger.error({ msg: 'Failed to update local key limit', error: updateError });
                return false;
            }
            logger.info({ msg: 'User key limit updated successfully', userId, newCreditLimit });
            return true;
        }
        catch (error) {
            logger.error({ msg: 'Error updating user key limit', error: error.message, userId });
            return false;
        }
    }
    /**
     * Update user subscription
     */
    async updateUserSubscription(userId, planId, supabase, logger) {
        try {
            logger.info({ msg: 'Updating user subscription', userId, planId });
            // Update user subscription
            const { error: subError } = await supabase
                .from('user_subscriptions')
                .upsert({
                user_id: userId,
                plan_id: planId,
                status: 'active',
                is_active: true,
                current_period_start: new Date().toISOString(),
                current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });
            if (subError) {
                logger.error({ msg: 'Failed to update subscription', error: subError });
                return false;
            }
            logger.info({ msg: 'User subscription updated successfully', userId, planId });
            return true;
        }
        catch (error) {
            logger.error({ msg: 'Error updating user subscription', error: error.message, userId });
            return false;
        }
    }
}
exports.FlutterwaveService = FlutterwaveService;
