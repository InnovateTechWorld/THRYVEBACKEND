# Payment System Setup Guide

## Overview

This guide walks you through setting up the complete payment and subscription system for the AI Platform, including Flutterwave integration, OpenRouter API key management, and subscription enforcement.

## Prerequisites

1. **Flutterwave Account**: Sign up at [flutterwave.com](https://flutterwave.com)
2. **OpenRouter Provisioning Key**: Contact OpenRouter for API key provisioning access
3. **Supabase Project**: Running Supabase instance with auth enabled
4. **Domain/SSL**: For webhook endpoints (production)

## Step 1: Database Setup

### 1.1 Run Database Schema

Execute the payment system schema to create all required tables:

```bash
# Apply the payment system schema
psql -h your-supabase-host -U postgres -d postgres -f payment_system_schema.sql
```

Or run through Supabase SQL Editor:
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `payment_system_schema.sql`
3. Execute the script

### 1.2 Verify Tables Created

Check that these tables exist:
- `subscription_plans`
- `user_subscriptions`
- `user_openrouter_keys`
- `payment_transactions`
- `user_credit_balances`
- `credit_transactions`
- `payment_methods_cache`

### 1.3 Verify Default Data

Confirm subscription plans are created:

```sql
SELECT * FROM subscription_plans ORDER BY price;
```

Should return:
- Free: $0, 10 memories, 2 session APIs, 1 context API
- Pro: $10, 30 memories, 15 session APIs, unlimited context APIs
- Power: $25, 50 memories, unlimited APIs

## Step 2: Flutterwave Configuration

### 2.1 Get API Keys

1. Login to Flutterwave Dashboard
2. Go to Settings → API Keys
3. Copy your keys:
   - **Public Key**: `FLWPUBK_TEST-...` (test) or `FLWPUBK-...` (live)
   - **Secret Key**: `FLWSECK_TEST-...` (test) or `FLWSECK-...` (live)

### 2.2 Generate Webhook Secret

1. Go to Settings → Webhooks
2. Set webhook URL: `https://yourdomain.com/api/payment/webhook`
3. Copy the webhook secret hash

### 2.3 Test Environment Setup

For testing, use Flutterwave's test environment:
- All transactions are simulated
- Use test card numbers from Flutterwave docs
- No real money is processed

## Step 3: OpenRouter Configuration

### 3.1 Get Provisioning Key

Contact OpenRouter support to get:
- **Provisioning API Key**: For creating sub-keys for users
- **Main API Key**: For fallback requests

### 3.2 Understand Key Hierarchy

```
Your Main OpenRouter Account
├── Provisioning Key (manages sub-keys)
├── User Sub-Key 1 (individual user limits)
├── User Sub-Key 2 (individual user limits)
└── Fallback Key (for users without individual keys)
```

## Step 4: Environment Variables

### 4.1 Add to .env File

```env
# Existing variables...
SUPABASE_URL="your-supabase-url"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_JWT_SECRET="your-jwt-secret"
OPENROUTER_API_KEY="your-fallback-openrouter-key"

# New payment system variables
FLW_PUBLIC_KEY="FLWPUBK_TEST-your-public-key"
FLW_SECRET_KEY="FLWSECK_TEST-your-secret-key"
FLW_WEBHOOK_SECRET="your-webhook-secret"
OPENROUTER_PROVISIONING_KEY="your-provisioning-key"

# URLs
BASE_URL="https://yourdomain.com"
WEBHOOK_BASE_URL="https://yourdomain.com"
```

### 4.2 Production Environment

For production, replace `TEST` keys with live keys:

```env
FLW_PUBLIC_KEY="FLWPUBK-your-live-public-key"
FLW_SECRET_KEY="FLWSECK-your-live-secret-key"
```

## Step 5: Install Dependencies

### 5.1 Install Required Packages

```bash
npm install flutterwave-node-v3
```

### 5.2 Verify TypeScript Support

The project includes TypeScript definitions in `src/types/flutterwave.d.ts`.

## Step 6: Deploy and Test

### 6.1 Start the Server

```bash
npm run dev
```

### 6.2 Test Basic Endpoints

```bash
# Test plans endpoint
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/payment/plans

# Test subscription endpoint
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/payment/subscription
```

### 6.3 Test Payment Flow

1. **Get Available Plans**
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/payment/plans
```

2. **Initiate Payment**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "subscription",
    "planId": "PLAN_UUID",
    "amount": 10.00,
    "currency": "USD",
    "redirectUrl": "http://localhost:3000/callback"
  }' \
  http://localhost:3000/api/payment/initiate
```

3. **Complete Payment Flow**
   - Use the returned `paymentUrl` to complete payment
   - Use test card: `4187427415564246` (Flutterwave test card)
   - Verify with returned reference

## Step 7: Webhook Setup

### 7.1 Configure Webhook URL

In Flutterwave Dashboard:
1. Go to Settings → Webhooks
2. Add webhook URL: `https://yourdomain.com/api/payment/webhook`
3. Select events: `charge.completed`, `transfer.completed`

### 7.2 Test Webhook Locally

For local testing, use ngrok:

```bash
# Install ngrok
npm install -g ngrok

# Expose local server
ngrok http 3000

# Use the ngrok URL for webhooks
# Example: https://abc123.ngrok.io/api/payment/webhook
```

### 7.3 Verify Webhook Signatures

The system automatically verifies webhook signatures using the webhook secret.

## Step 8: Security Configuration

### 8.1 CORS Settings

Ensure CORS is configured for your frontend domain:

```typescript
// In server.ts
app.register(fastifyCors, {
  origin: ['https://yourdomain.com', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-flutterwave-signature']
});
```

### 8.2 Rate Limiting

Configure rate limiting for payment endpoints:

```bash
npm install @fastify/rate-limit
```

### 8.3 SSL Certificate

Ensure SSL is configured for production webhooks.

## Step 9: Monitoring and Logging

### 9.1 Set Up Logging

The system logs all payment activities. Monitor these log events:
- Payment initiations
- Payment verifications
- Webhook processing
- Subscription changes
- API key provisioning

### 9.2 Database Monitoring

Monitor these tables for unusual activity:
- `payment_transactions` - Failed payments
- `user_subscriptions` - Subscription changes
- `credit_transactions` - Credit usage patterns

### 9.3 Error Monitoring

Set up alerts for:
- Failed webhook processing
- API key provisioning failures
- Payment verification errors
- High error rates

## Step 10: Testing Scenarios

### 10.1 Subscription Flow Test

```javascript
// Test complete subscription flow
const testSubscriptionFlow = async () => {
  // 1. Get plans
  const plans = await fetch('/api/payment/plans');
  
  // 2. Subscribe to Pro plan
  const proPlan = plans.data.find(p => p.name === 'Pro');
  
  // 3. Initiate payment
  const payment = await fetch('/api/payment/initiate', {
    method: 'POST',
    body: JSON.stringify({
      type: 'subscription',
      planId: proPlan.id,
      amount: proPlan.price,
      currency: 'USD',
      redirectUrl: window.location.origin + '/callback'
    })
  });
  
  // 4. Complete payment (manually)
  // 5. Verify payment
  const verification = await fetch('/api/payment/verify', {
    method: 'POST',
    body: JSON.stringify({ reference: payment.data.reference })
  });
  
  console.log('Subscription test completed:', verification);
};
```

### 10.2 Credit Top-up Test

```javascript
// Test credit top-up flow
const testCreditTopup = async () => {
  // 1. Check current credits
  const credits = await fetch('/api/payment/credits');
  console.log('Current credits:', credits.data.available_credits);
  
  // 2. Top up credits
  const topup = await fetch('/api/payment/initiate', {
    method: 'POST',
    body: JSON.stringify({
      type: 'topup',
      amount: 20.00,
      currency: 'USD',
      redirectUrl: window.location.origin + '/callback'
    })
  });
  
  // 3. Complete and verify payment
  // 4. Check updated credits
  const updatedCredits = await fetch('/api/payment/credits');
  console.log('Updated credits:', updatedCredits.data.available_credits);
};
```

### 10.3 Limit Enforcement Test

```javascript
// Test subscription limits
const testLimits = async () => {
  // Try to create memory beyond limit
  try {
    const memory = await fetch('/api/memory', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Memory', content: 'Test' })
    });
  } catch (error) {
    if (error.status === 403) {
      console.log('Limit enforcement working:', error.data);
    }
  }
};
```

## Step 11: Production Deployment

### 11.1 Environment Setup

1. **Update Environment Variables**
   - Switch to live Flutterwave keys
   - Update BASE_URL to production domain
   - Ensure HTTPS is enabled

2. **Database Migration**
   - Run schema on production database
   - Verify RLS policies are active
   - Test database connections

3. **SSL Configuration**
   - Ensure valid SSL certificate
   - Test webhook endpoints with SSL

### 11.2 Go-Live Checklist

- [ ] Live Flutterwave keys configured
- [ ] Webhook URL updated in Flutterwave dashboard
- [ ] SSL certificate valid
- [ ] Database schema applied
- [ ] Environment variables set
- [ ] Error monitoring configured
- [ ] Rate limiting enabled
- [ ] CORS configured for production domain
- [ ] Backup and recovery plan in place

### 11.3 Post-Launch Monitoring

Monitor these metrics:
- Payment success rates
- Webhook delivery success
- API response times
- Error rates
- User subscription conversions

## Troubleshooting

### Common Issues

1. **Webhook Not Receiving**
   - Check webhook URL is publicly accessible
   - Verify SSL certificate
   - Check Flutterwave webhook logs

2. **Payment Verification Failing**
   - Verify webhook secret is correct
   - Check signature verification logic
   - Review Flutterwave API responses

3. **OpenRouter Key Provisioning Failing**
   - Verify provisioning key permissions
   - Check OpenRouter account limits
   - Review API key creation logs

4. **Subscription Limits Not Enforcing**
   - Check RLS policies are active
   - Verify middleware is applied to routes
   - Review subscription status in database

### Debug Commands

```bash
# Check payment transactions
psql -c "SELECT * FROM payment_transactions WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10;"

# Check user subscriptions
psql -c "SELECT u.email, s.plan_name, s.status FROM user_subscriptions us JOIN subscription_plans s ON us.plan_id = s.id JOIN auth.users u ON us.user_id = u.id;"

# Check webhook logs
tail -f logs/payment-webhooks.log

# Test webhook signature
curl -X POST https://yourdomain.com/api/payment/webhook \
  -H "x-flutterwave-signature: test_signature" \
  -d '{"event":"charge.completed","data":{"tx_ref":"test"}}'
```

## Support

For issues with:
- **Flutterwave**: support@flutterwave.com
- **OpenRouter**: support@openrouter.ai
- **Supabase**: support@supabase.io

For system-specific issues, check:
- Application logs
- Database logs
- Webhook delivery logs
- Payment transaction history

## Security Best Practices

1. **Never expose secret keys** in client-side code
2. **Always verify webhook signatures** before processing
3. **Use HTTPS** for all webhook endpoints
4. **Implement rate limiting** on payment endpoints
5. **Log all payment activities** for audit trail
6. **Encrypt sensitive data** at rest
7. **Regularly rotate** API keys
8. **Monitor for suspicious** payment patterns

## Performance Optimization

1. **Cache payment methods** by country/currency
2. **Use database indexes** for payment queries
3. **Implement connection pooling** for database
4. **Use CDN** for static payment assets
5. **Monitor API response times**
6. **Optimize webhook processing** for speed

This completes the payment system setup. The system is now ready for production use with comprehensive subscription management, payment processing, and API key provisioning.