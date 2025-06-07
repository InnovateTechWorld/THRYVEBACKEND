import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SupabaseClient } from '@supabase/supabase-js';
import { FlutterwaveService } from '../lib/flutterwaveService';
import { OpenRouterManager } from '../lib/openRouterManager';
import { CurrencyConverter } from '../lib/currencyConverter';

interface PaymentRouteOptions {
  supabase: SupabaseClient;
}

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email?: string;
  };
}

interface InitiatePaymentBody {
  type: 'subscription' | 'topup';
  planId?: string;
  amount?: number;
  currency: string;
  country?: string;
  redirectUrl: string;
}

interface PaymentVerifyBody {
  tx_ref?: string;
  transaction_id?: string;
  status?: string;
}

interface SubscriptionBody {
  planId: string;
}

interface PaymentMethodsQuery {
  country: string;
  currency: string;
}

export default async function paymentRoutes(
  fastify: FastifyInstance,
  options: PaymentRouteOptions
) {
  const { supabase } = options;

  // Initialize services
  const flutterwaveService = new FlutterwaveService(
    process.env.FLW_PUBLIC_KEY!,
    process.env.FLW_SECRET_KEY!,
    process.env.FLW_WEBHOOK_SECRET!
  );

  const openRouterManager = new OpenRouterManager(
    process.env.OPENROUTER_PROVISIONING_KEY!
  );

  /**
   * Get available subscription plans (public endpoint)
   */
  fastify.get('/api/payment/plans', async (request: FastifyRequest, reply: FastifyReply) => {
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

    } catch (error: any) {
      fastify.log.error({ msg: 'Error fetching subscription plans', error: error.message });
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get supported currencies and their payment methods
   */
  fastify.get('/api/payment/currencies', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const currencies = CurrencyConverter.getSupportedCurrencies().map(currency => ({
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

    } catch (error: any) {
      fastify.log.error({ msg: 'Error fetching currencies', error: error.message });
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get user's current subscription
   */
  fastify.get('/api/payment/subscription', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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

  } catch (error: any) {
    fastify.log.error({ msg: 'Error fetching user subscription', error: error.message });
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

  /**
   * Get user's credit balance
   */
  fastify.get('/api/payment/credits', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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

    } catch (error: any) {
      fastify.log.error({ msg: 'Error fetching user credits', error: error.message });
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get payment methods for country/currency
   */
  fastify.get<{ Querystring: PaymentMethodsQuery }>('/api/payment/methods', async (request: AuthenticatedRequest, reply) => {
    try {
      const query = request.query as PaymentMethodsQuery;
      const { country, currency } = query;

      if (!country || !currency) {
        return reply.code(400).send({ error: 'Country and currency are required' });
      }

      // Check if currency is supported
      if (!CurrencyConverter.isSupported(currency)) {
        return reply.code(400).send({ 
          error: 'Currency not supported',
          supportedCurrencies: CurrencyConverter.getSupportedCurrencies().map(c => c.code)
        });
      }

      // Get payment methods based on currency support
      const supportedMethods = CurrencyConverter.getSupportedPaymentMethods(currency);
      const methods = supportedMethods.map(method => {
        const methodInfo: any = { type: method };
        
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
          currencySymbol: CurrencyConverter.getSymbol(currency),
          methods
        }
      });

    } catch (error: any) {
      fastify.log.error({ msg: 'Error fetching payment methods', error: error.message });
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Initiate a payment (subscription or top-up)
   */
  fastify.post<{ Body: InitiatePaymentBody }>('/api/payment/initiate', async (request: AuthenticatedRequest, reply) => {
    try {
      const userId = request.user.id;
      const userEmail = request.user.email;
      
      const body = request.body as InitiatePaymentBody;
      let { type, planId, amount, currency, country, redirectUrl } = body;

      // Basic validation
      if (!type || !currency || !redirectUrl) {
        return reply.code(400).send({ error: 'Missing required fields: type, currency, redirectUrl' });
      }

      // Check if currency is supported
      if (!CurrencyConverter.isSupported(currency)) {
        return reply.code(400).send({ 
          error: 'Currency not supported',
          supportedCurrencies: CurrencyConverter.getSupportedCurrencies().map(c => c.code)
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
        : CurrencyConverter.toUSD(amount, currency);

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

      const result = await flutterwaveService.initializePayment(
        paymentData,
        supabase,
        fastify.log
      );

      return reply.send({
        success: true,
        data: {
          ...result,
          amountLocal: amount,
          currency: currency.toUpperCase(),
          amountUSD: amountInUSD,
          exchangeRate: CurrencyConverter.getExchangeRate(currency, 'USD')
        }
      });

    } catch (error: any) {
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

fastify.post<{ Body: PaymentVerifyBody }>('/api/payment/verify', async (request: AuthenticatedRequest, reply) => {
  const body = request.body as PaymentVerifyBody;
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
    const userIdsMatch = 
      transactionUserId === requestUserId ||                                    // Exact match
      transactionUserId?.toLowerCase() === requestUserId?.toLowerCase() ||      // Case insensitive
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
    
    const verification = await flutterwaveService.verifyPayment(
      verificationId,
      supabase,
      fastify.log
    );
    
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
      } else if (existingTransaction.type === 'topup') {
        await processCreditTopup(existingTransaction, transactionUserId, supabase, fastify.log);
      }
    } catch (processingError) {
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

  } catch (error: any) {
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

  fastify.get('/api/payment/debug/transactions', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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

    } catch (error: any) {
      fastify.log.error('Debug endpoint error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Create or update subscription
   */
  fastify.post<{ Body: SubscriptionBody }>('/api/payment/subscription', async (request: AuthenticatedRequest, reply) => {
    try {
      const userId = request.user.id;
      
      const body = request.body as SubscriptionBody;
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
    // ❌ REMOVED: is_active: true (column doesn't exist)
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

    } catch (error: any) {
      fastify.log.error({ msg: 'Error managing subscription', error: error.message });
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Cancel subscription
   */
  fastify.delete('/api/payment/subscription', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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

    } catch (error: any) {
      fastify.log.error({ msg: 'Error cancelling subscription', error: error.message });
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get transaction history
   */
  fastify.get('/api/payment/transactions', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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
        formattedAmount: CurrencyConverter.format(tx.amount_local, tx.local_currency),
        formattedAmountUSD: CurrencyConverter.format(tx.amount_usd, 'USD')
      }));

      return reply.send({
        success: true,
        data: formattedTransactions
      });

    } catch (error: any) {
      fastify.log.error({ msg: 'Error fetching transactions', error: error.message });
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get billing dashboard data
   */
  fastify.get('/api/payment/dashboard', async (request: AuthenticatedRequest, reply: FastifyReply) => {
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
        supportedCurrencies: CurrencyConverter.getSupportedCurrencies().slice(0, 10)
      }
    });

  } catch (error: any) {
    console.error('Dashboard error:', error);
    fastify.log.error({ msg: 'Error fetching billing dashboard', error: error.message });
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

  /**
   * Webhook endpoint for Flutterwave (no auth needed)
   */
  fastify.post('/api/payment/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const rawBody = JSON.stringify(request.body);
      const signature = request.headers['verif-hash'] as string;

      // Verify webhook signature
      if (!flutterwaveService.verifyWebhookSignature(rawBody, signature)) {
        fastify.log.warn({ msg: 'Invalid webhook signature' });
        return reply.code(400).send({ error: 'Invalid signature' });
      }

      const webhookData = request.body as any;
      
      const success = await flutterwaveService.processWebhook(
        webhookData,
        supabase,
        fastify.log
      );

      if (!success) {
        return reply.code(500).send({ error: 'Failed to process webhook' });
      }

      return reply.send({ success: true });

    } catch (error: any) {
      fastify.log.error({ msg: 'Error processing webhook', error: error.message });
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // ✅ HELPER FUNCTIONS

 
// Replace the processSubscriptionPayment function around line 900 with this fixed version:

async function processSubscriptionPayment(
  transaction: any,
  userId: string,
  supabase: any,
  logger: any
) {
  try {
    logger.info('🔄 Starting subscription processing:', {
      userId,
      transactionId: transaction.id,
      planId: transaction.plan_id,
      type: transaction.type
    });

    // ✅ FIXED: Extract plan_id from multiple possible locations
    let planId = transaction.plan_id;
    
    // If plan_id is not directly available, extract from metadata
    if (!planId && transaction.metadata?.payload_sent?.meta?.plan_id) {
      planId = transaction.metadata.payload_sent.meta.plan_id;
      logger.info('📦 Extracted plan_id from metadata:', planId);
    }

    // ✅ ENHANCED DEBUG: Check if plan_id exists
    if (!planId) {
      console.error('❌ No plan_id found in transaction or metadata:', {
        directPlanId: transaction.plan_id,
        metadataPlanId: transaction.metadata?.payload_sent?.meta?.plan_id,
        fullTransaction: transaction
      });
      throw new Error('No plan_id found in transaction or metadata');
    }

    // ✅ Get plan details to ensure it exists
    const { data: planDetails, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError || !planDetails) {
      logger.error('❌ Plan not found:', { planId, planError });
      throw new Error(`Subscription plan not found: ${planId}`);
    }

    logger.info('✅ Plan details retrieved:', {
      planId,
      planName: planDetails.name,
      billingCycle: planDetails.billing_cycle
    });

    // ✅ FIXED: Include ALL required fields including plan_id
    const subscriptionData = {
      user_id: userId,
      plan_id: planId, // ✅ Use extracted plan_id
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: calculatePeriodEnd(planDetails.billing_cycle || 'monthly'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // ✅ ENHANCED DEBUG: Log what we're about to insert
    console.log('=== SUBSCRIPTION INSERT DEBUG ===');
    console.log('Extracted Plan ID:', planId);
    console.log('Plan Details:', planDetails);
    console.log('Subscription Data:', JSON.stringify(subscriptionData, null, 2));
    console.log('================================');

    logger.info('🔄 Updating subscription with data:', subscriptionData);

    const { data: subResult, error: subscriptionError } = await supabase
      .from('user_subscriptions')
      .upsert(subscriptionData, {
        onConflict: 'user_id'
      })
      .select('*');

    if (subscriptionError) {
      console.log('=== SUBSCRIPTION ERROR DEBUG ===');
      console.log('Error Code:', subscriptionError.code);
      console.log('Error Message:', subscriptionError.message);
      console.log('Error Details:', subscriptionError.details);
      console.log('Data Being Inserted:', JSON.stringify(subscriptionData, null, 2));
      console.log('================================');
      
      logger.error('❌ Subscription update failed:', {
        error: subscriptionError,
        errorCode: subscriptionError.code,
        errorMessage: subscriptionError.message,
        data: subscriptionData
      });
      throw subscriptionError;
    }

    logger.info('✅ Subscription updated successfully:', subResult);

    // ✅ Credits processing using plan details
    const creditAmount = parseFloat(planDetails.credits) || 0;

    
logger.info('💰 Credit processing info:', {
      planPrice: planDetails.price,
      planCredits: creditAmount,
      platformFee: parseFloat(planDetails.price) - creditAmount,
      feePercentage: ((parseFloat(planDetails.price) - creditAmount) / parseFloat(planDetails.price) * 100).toFixed(1) + '%'
    });

    if (creditAmount > 0) {
      logger.info('🔄 Adding subscription credits:', {
        userId,
        creditsToAdd: creditAmount,
        planName: planDetails.name,
        source: 'subscription_plan'
      });


      const { data: currentCredits } = await supabase
        .from('user_credit_balances')
        .select('available_credits, total_purchased')
        .eq('user_id', userId)
        .single();

      const creditData = {
        user_id: userId,
        available_credits: (currentCredits?.available_credits || 0) + creditAmount,
        total_purchased: (currentCredits?.total_purchased || 0) + creditAmount,
        updated_at: new Date().toISOString()
      };

      const { data: creditResult, error: creditsError } = await supabase
        .from('user_credit_balances')
        .upsert(creditData, {
          onConflict: 'user_id'
        })
        .select('*');

      if (creditsError) {
        console.log('=== CREDITS ERROR DEBUG ===');
        console.log('Credits Error:', JSON.stringify(creditsError, null, 2));
        console.log('Credit Data:', JSON.stringify(creditData, null, 2));
        console.log('================================');
        
        logger.error('❌ Credits update failed:', creditsError);
        // Don't throw - subscription was successful
      } else {
        logger.info('✅ Subscription credits updated successfully:', {
          userId,
          creditsAdded: creditAmount,
          newAvailableCredits: creditResult[0]?.available_credits,
          newTotalPurchased: creditResult[0]?.total_purchased
        });
      }
    } else {
      logger.info('ℹ️ No credits included in this subscription plan (Free plan)');
    }

    logger.info('✅ Subscription processing completed successfully:', {
      userId,
      planId,
      planName: planDetails.name,
      credits: creditAmount
    });

  } catch (error: any) {
    logger.error('❌ Subscription processing failed:', {
      error: error.message,
      stack: error.stack,
      userId,
      transactionId: transaction.id
    });
    throw error;
  }
}


  /**
   * Process credit top-up
   */
  async function processCreditTopup(
  transaction: any,
  userId: string,
  supabase: any,
  logger: any
) {
  try {
    logger.info('🔄 Starting credit topup processing:', {
      userId,
      transactionId: transaction.id,
      creditAmount: transaction.credit_amount,
      type: transaction.type
    });

    // ✅ FIXED: Use correct table name 'user_credit_balances' (not 'user_credits')
    const { data: currentCredits } = await supabase
      .from('user_credit_balances') // ✅ FIXED: Correct table name
      .select('available_credits, total_purchased, total_used')
      .eq('user_id', userId)
      .single();

    console.log('=== TOPUP CREDITS DEBUG ===');
    console.log('Current Credits:', currentCredits);
    console.log('Credit Amount to Add:', transaction.credit_amount);
    console.log('Credit Amount (openrouter):', transaction.openrouter_credit_amount);
    console.log('================================');

    // Calculate new amounts
    const creditAmount = parseFloat(transaction.credit_amount || transaction.openrouter_credit_amount || '0');
    const newAvailableCredits = (currentCredits?.available_credits || 0) + creditAmount;
    const newTotalPurchased = (currentCredits?.total_purchased || 0) + creditAmount;

    // ✅ FIXED: Update user_credit_balances table with correct field names
    const { data: updatedCredits, error: creditsError } = await supabase
      .from('user_credit_balances') // ✅ FIXED: Correct table name
      .upsert({
        user_id: userId,
        available_credits: newAvailableCredits, // ✅ FIXED: Correct field name
        total_purchased: newTotalPurchased,     // ✅ FIXED: Correct field name
        total_used: currentCredits?.total_used || 0, // Keep existing usage
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

    return true;

  } catch (error: any) {
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
  function calculatePeriodEnd(billingCycle: string): string {
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