# Payment & Subscription API Documentation

## Overview

This document describes the comprehensive payment and subscription system for the AI Platform, including subscription management, credit purchases, OpenRouter API key provisioning, and billing features.

## Authentication

All payment endpoints (except webhooks) require Bearer token authentication:

```
Authorization: Bearer <supabase_jwt_token>
```

## Base URL

```
Production: https://your-domain.com
Development: http://localhost:3000
```

## Subscription Plans

### GET `/api/payment/plans`

Get all available subscription plans.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Free",
      "price": 0.00,
      "credits": 0.00,
      "memory_limit": 10,
      "session_api_limit": 2,
      "context_api_limit": 1,
      "free_models_only": true
    },
    {
      "id": "uuid",
      "name": "Pro",
      "price": 10.00,
      "credits": 8.00,
      "memory_limit": 30,
      "session_api_limit": 15,
      "context_api_limit": -1,
      "free_models_only": false
    },
    {
      "id": "uuid",
      "name": "Power",
      "price": 25.00,
      "credits": 20.00,
      "memory_limit": 50,
      "session_api_limit": -1,
      "context_api_limit": -1,
      "free_models_only": false
    }
  ]
}
```

**Plan Features Explained:**
- `memory_limit`: Maximum number of memories user can store
- `session_api_limit`: Maximum number of session APIs user can export (-1 = unlimited)
- `context_api_limit`: Maximum number of context APIs user can export (-1 = unlimited)
- `free_models_only`: Whether user is restricted to free models only
- `credits`: Amount of credits included with plan subscription

## User Subscription Management

### GET `/api/payment/subscription`

Get user's current subscription details.

**Response:**
```json
{
  "success": true,
  "data": {
    "subscription_id": "uuid",
    "plan_name": "Pro",
    "plan_price": 10.00,
    "credits": 8.00,
    "memory_limit": 30,
    "session_api_limit": 15,
    "context_api_limit": -1,
    "free_models_only": false,
    "status": "active",
    "current_period_end": "2024-02-01T00:00:00Z"
  }
}
```

### POST `/api/payment/subscription`

Create or activate a subscription.

**Request Body:**
```json
{
  "planId": "uuid"
}
```

**Response (Free Plan):**
```json
{
  "success": true,
  "message": "Free plan activated successfully",
  "data": {
    "planId": "uuid",
    "status": "active"
  }
}
```

**Response (Paid Plan):**
```json
{
  "success": true,
  "message": "Payment required for this plan",
  "data": {
    "planId": "uuid",
    "amount": 10.00,
    "currency": "USD",
    "requiresPayment": true
  }
}
```

### DELETE `/api/payment/subscription`

Cancel user's current subscription.

**Response:**
```json
{
  "success": true,
  "message": "Subscription cancelled successfully"
}
```

## Credit Management

### GET `/api/payment/credits`

Get user's current credit balance.

**Response:**
```json
{
  "success": true,
  "data": {
    "available_credits": 15.50,
    "total_purchased": 25.00,
    "total_used": 9.50
  }
}
```

## Payment Processing

### GET `/api/payment/methods`

Get available payment methods for a country and currency.

**Query Parameters:**
- `country` (required): ISO 3166-1 alpha-2 country code (e.g., "NG", "US", "GB")
- `currency` (required): ISO 4217 currency code (e.g., "USD", "NGN", "GBP")

**Example Request:**
```
GET /api/payment/methods?country=NG&currency=NGN
```

**Response:**
```json
{
  "success": true,
  "data": {
    "country": "NG",
    "currency": "NGN",
    "methods": [
      {
        "type": "card",
        "name": "Debit/Credit Card",
        "currencies": ["NGN", "USD"]
      },
      {
        "type": "bank_transfer",
        "name": "Bank Transfer",
        "currencies": ["NGN"]
      },
      {
        "type": "ussd",
        "name": "USSD",
        "currencies": ["NGN"]
      },
      {
        "type": "mobile_money",
        "name": "Mobile Money",
        "currencies": ["NGN"]
      }
    ]
  }
}
```

### POST `/api/payment/initiate`

Initiate a payment for subscription or credit top-up.

**Request Body:**
```json
{
  "type": "subscription", // or "topup"
  "planId": "uuid", // required for subscription
  "amount": 10.00,
  "currency": "USD",
  "country": "US", // optional
  "redirectUrl": "https://yourapp.com/payment/callback"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentUrl": "https://checkout.flutterwave.com/v3/hosted/pay/...",
    "reference": "subscription_user123_1699123456789"
  }
}
```

### POST `/api/payment/verify`

Verify a completed payment and process the transaction.

**Request Body:**
```json
{
  "reference": "subscription_user123_1699123456789"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment verified and processed successfully",
  "data": {
    "reference": "subscription_user123_1699123456789",
    "type": "subscription",
    "amount": 10.00,
    "status": "completed"
  }
}
```

## Transaction History

### GET `/api/payment/transactions`

Get user's payment transaction history.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "flutterwave_reference": "subscription_user123_1699123456789",
      "type": "subscription",
      "amount": 10.00,
      "currency": "USD",
      "platform_fee": 1.50,
      "credit_amount": 10.00,
      "status": "successful",
      "payment_method": "card",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

## Billing Dashboard

### GET `/api/payment/dashboard`

Get comprehensive billing information for the user.

**Response:**
```json
{
  "success": true,
  "data": {
    "billing": {
      "user_id": "uuid",
      "email": "user@example.com",
      "plan_name": "Pro",
      "plan_price": 10.00,
      "subscription_status": "active",
      "current_period_end": "2024-02-01T00:00:00Z",
      "available_credits": 15.50,
      "total_purchased": 25.00,
      "total_used": 9.50,
      "total_transactions": 3,
      "total_spent": 35.00
    },
    "recentTransactions": [
      {
        "id": "uuid",
        "type": "purchase",
        "amount": 8.00,
        "balance_after": 15.50,
        "description": "Pro plan credits",
        "created_at": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

## Webhooks

### POST `/api/payment/webhook`

Flutterwave webhook endpoint for payment status updates.

**Headers:**
```
x-flutterwave-signature: webhook_signature
Content-Type: application/json
```

**Request Body (Flutterwave format):**
```json
{
  "event": "charge.completed",
  "data": {
    "id": 12345,
    "tx_ref": "subscription_user123_1699123456789",
    "status": "successful",
    "amount": 10.00,
    "currency": "USD",
    "payment_type": "card"
  }
}
```

## Error Responses

All endpoints return standardized error responses:

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

**Common HTTP Status Codes:**
- `400`: Bad Request - Invalid input parameters
- `401`: Unauthorized - Missing or invalid authentication
- `403`: Forbidden - Subscription limits exceeded
- `404`: Not Found - Resource not found
- `500`: Internal Server Error - Server-side error

**Subscription Limit Error Response:**
```json
{
  "error": "Subscription limit exceeded",
  "message": "Memory limit reached. You can store up to 10 memories on your current plan.",
  "upgradeMessage": "Please upgrade your plan to continue",
  "currentPlan": "Free",
  "limits": {
    "can_create_memory": false,
    "can_export_session": true,
    "can_export_context": false,
    "current_memories": 10,
    "current_session_exports": 1,
    "current_context_exports": 1,
    "memory_limit": 10,
    "session_limit": 2,
    "context_limit": 1
  },
  "upgradeUrl": "/api/payment/plans"
}
```

## Integration Examples

### Frontend Payment Flow

```javascript
// 1. Get available plans
const plansResponse = await fetch('/api/payment/plans', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const plans = await plansResponse.json();

// 2. Initiate payment for a plan
const paymentResponse = await fetch('/api/payment/initiate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'subscription',
    planId: 'pro-plan-uuid',
    amount: 10.00,
    currency: 'USD',
    redirectUrl: window.location.origin + '/payment/callback'
  })
});

const payment = await paymentResponse.json();

// 3. Redirect to payment URL
window.location.href = payment.data.paymentUrl;

// 4. After payment completion, verify on callback page
const verifyResponse = await fetch('/api/payment/verify', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    reference: urlParams.get('tx_ref')
  })
});
```

### Credit Top-up Flow

```javascript
// 1. Get current credits
const creditsResponse = await fetch('/api/payment/credits', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const credits = await creditsResponse.json();

// 2. Initiate credit top-up
const topupResponse = await fetch('/api/payment/initiate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'topup',
    amount: 20.00,
    currency: 'USD',
    redirectUrl: window.location.origin + '/payment/callback'
  })
});
```

### Subscription Limits Check

```javascript
// Check if user can perform an action
try {
  const response = await fetch('/api/memory/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(memoryData)
  });

  if (response.status === 403) {
    const error = await response.json();
    if (error.error === 'Subscription limit exceeded') {
      // Show upgrade prompt
      showUpgradeModal(error.limits, error.upgradeUrl);
    }
  }
} catch (error) {
  console.error('Error creating memory:', error);
}
```

## Currency Support

**Supported Currencies by Region:**
- **Nigeria**: NGN, USD
- **Ghana**: GHS, USD  
- **Kenya**: KES, USD
- **Uganda**: UGX, USD
- **Rwanda**: RWF, USD
- **South Africa**: ZAR, USD
- **United States**: USD
- **United Kingdom**: GBP, USD
- **Global Default**: USD

## Business Rules

### Platform Fees
- **15%** platform fee on all transactions
- Users receive **full amount** in credits
- Platform retains 15% as service fee

### Subscription Billing
- **Monthly billing cycle** for paid plans
- **Immediate activation** for successful payments
- **Grace period**: 3 days after expiration before downgrade
- **Automatic downgrade** to Free plan if payment fails

### Credit System
- **Credits never expire**
- **No refunds** for unused credits
- **Credit pooling**: Subscription credits + purchased credits
- **Usage tracking**: Real-time deduction for API calls

### API Key Management
- **Individual OpenRouter keys** for each user
- **Dynamic credit limits** based on user balance
- **Automatic provisioning** on subscription activation
- **Key disabling** on subscription cancellation

## Rate Limits

**API Endpoints:**
- Payment initiation: 5 requests per minute per user
- Payment verification: 10 requests per minute per user
- General endpoints: 100 requests per minute per user

**Webhook Endpoint:**
- No rate limiting (Flutterwave managed)

## Security Considerations

1. **Webhook Verification**: All webhooks verified using Flutterwave signature
2. **API Key Encryption**: User API keys encrypted at rest
3. **Transaction Integrity**: Idempotent payment processing
4. **Audit Trail**: Complete transaction history logging
5. **Rate Limiting**: Protection against abuse
6. **Input Validation**: Comprehensive request validation

## Testing

**Test Environment Variables:**
```env
FLW_PUBLIC_KEY="FLWPUBK_TEST-..."
FLW_SECRET_KEY="FLWSECK_TEST-..."
FLW_WEBHOOK_SECRET="test_webhook_secret"
```

**Test Payment Flow:**
1. Use test card numbers provided by Flutterwave
2. All test transactions are in sandbox mode
3. No real money is processed in test environment

## Support

For integration support or issues:
- **Email**: support@yourplatform.com
- **Documentation**: https://docs.yourplatform.com
- **API Status**: https://status.yourplatform.com