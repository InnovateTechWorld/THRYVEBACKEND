# OpenRouter User Key Integration Guide

## 1. Key Creation & Management

### Create Initial User Key
```typescript
POST /api/payment/subscription
Headers: {
  'Authorization': `Bearer ${userToken}`
}
Body: {
  "planId": "free-plan-id" // For free plan
}

// Success Response
{
  "success": true,
  "message": "Free plan activated successfully",
  "data": {
    "planId": "free-plan-id",
    "status": "active"
  }
}
```

### Update User Key
```typescript
POST /api/payment/openrouter-sync
Headers: {
  'Authorization': `Bearer ${userToken}`
}

// Success Response
{
  "success": true,
  "message": "OpenRouter usage synced successfully",
  "data": {
    "usage": 0,
    "limit": 100,
    "remaining": 100,
    "disabled": false,
    "lastSynced": "2025-06-08T17:08:14Z"
  }
}

// Error Response
{
  "success": false,
  "error": "USER_KEY_NOT_FOUND",
  "message": "OpenRouter key not found. Please contact support."
}
```

## 2. Subscription Management

### Get Available Plans
```typescript
GET /api/payment/plans
Headers: {
  'Authorization': `Bearer ${userToken}`
}

// Response
{
  "success": true,
  "data": [
    {
      "id": "free",
      "name": "Free Plan",
      "price": 0,
      "credits": 10,
      "free_models_only": true
    },
    {
      "id": "pro",
      "name": "Pro Plan",
      "price": 29.99,
      "credits": 1000,
      "free_models_only": false,
      "allowed_models": ["openai/gpt-4", "anthropic/claude-2"]
    }
  ]
}
```

### Get Current Subscription
```typescript
GET /api/payment/subscription
Headers: {
  'Authorization': `Bearer ${userToken}`
}

// Response
{
  "success": true,
  "data": {
    "plan_name": "Pro Plan",
    "plan_price": 29.99,
    "subscription_status": "active",
    "current_period_end": "2025-07-08T17:08:14Z",
    "available_credits": 950,
    "total_purchased": 1000,
    "total_used": 50
  }
}
```

### Upgrade Subscription
```typescript
POST /api/payment/initiate
Headers: {
  'Authorization': `Bearer ${userToken}`
}
Body: {
  "type": "subscription",
  "planId": "pro",
  "currency": "USD",
  "redirectUrl": "https://your-app.com/callback"
}

// Response
{
  "success": true,
  "data": {
    "paymentLink": "https://payment.url",
    "amountLocal": 29.99,
    "currency": "USD",
    "amountUSD": 29.99,
    "exchangeRate": 1
  }
}
```

## 3. Model Access & Credits

### Check Model Access
```typescript
GET /models
Headers: {
  'Authorization': `Bearer ${userToken}`
}

// Success Response
{
  "data": [
    {
      "id": "openai/gpt-4",
      "name": "GPT-4",
      "description": "Most capable model",
      "pricing": {
        "input": 0.01,
        "output": 0.03
      },
      "context_length": 8192,
      "supported_parameters": ["temperature", "top_p"],
      "capabilities": {
        "supports_images": true,
        "max_tokens": 4096
      }
    }
  ]
}

// Error Response
{
  "error": {
    "code": "MODEL_NOT_ALLOWED",
    "message": "Model not available in current plan",
    "details": {
      "currentPlan": "Free Plan",
      "allowedModels": ["openai/gpt-3.5-turbo"]
    }
  }
}
```

### Credit Management
```typescript
// Add Credits (Top-up)
POST /api/payment/initiate
Headers: {
  'Authorization': `Bearer ${userToken}`
}
Body: {
  "type": "topup",
  "amount": 100,
  "currency": "USD",
  "redirectUrl": "https://your-app.com/callback"
}

// Check Balance
GET /api/payment/credits
Headers: {
  'Authorization': `Bearer ${userToken}`
}

// Response
{
  "success": true,
  "data": {
    "available_credits": 950,
    "total_purchased": 1000,
    "total_used": 50
  }
}
```

## 4. Error Handling

### Common Error Codes
```typescript
enum OpenRouterError {
  // Key Errors
  KEY_NOT_FOUND = 'KEY_NOT_FOUND',
  KEY_DISABLED = 'KEY_DISABLED',
  KEY_CREATION_FAILED = 'OPENROUTER_KEY_CREATION_FAILED',

  // Credit Errors
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',
  CREDIT_ALLOCATION_FAILED = 'OPENROUTER_CREDIT_ALLOCATION_FAILED',
  USAGE_SYNC_FAILED = 'OPENROUTER_USAGE_SYNC_FAILED',

  // Model Access Errors
  MODEL_NOT_ALLOWED = 'MODEL_NOT_ALLOWED',
  PLAN_RESTRICTION = 'PLAN_RESTRICTION'
}
```

### Error Handling Flow
```typescript
async function handleApiCall() {
  try {
    // 1. Check Credits
    const usage = await fetch('/api/payment/openrouter-usage');
    if (usage.data.openrouter.remaining < 1) {
      showTopUpDialog();
      return;
    }

    // 2. Make API Call
    const response = await fetch('/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${userToken}` },
      body: JSON.stringify({
        model: 'openai/gpt-4',
        messages: [{ role: 'user', content: 'Hello' }]
      })
    });

    // 3. Handle Response
    if (!response.ok) {
      const error = await response.json();
      
      switch(error.code) {
        case 'CREDIT_INSUFFICIENT':
          showTopUpDialog({
            available: error.details.available,
            required: error.details.required
          });
          break;

        case 'MODEL_NOT_ALLOWED':
          showUpgradeDialog({
            currentPlan: error.details.currentPlan,
            requiredPlan: 'Pro Plan'
          });
          break;

        case 'USER_KEY_NOT_FOUND':
          redirectToSettings('/settings/api-keys');
          break;

        case 'KEY_DISABLED':
          showError('Your API key has been disabled. Please contact support.');
          break;

        default:
          showError('An error occurred. Please try again.');
      }
    }
  } catch (error) {
    handleError(error);
  }
}

// Implement monitoring
setInterval(async () => {
  const usage = await fetch('/api/payment/openrouter-usage');
  if (usage.data.openrouter.remaining < 100) {
    showLowCreditsWarning();
  }
}, 300000); // Every 5 minutes
```

## 5. Best Practices

1. **Credit Management**:
   - Monitor credit usage regularly
   - Set up alerts for low credit balance
   - Implement automatic top-up thresholds
   - Handle credit errors gracefully with user feedback

2. **Model Access**:
   - Check model availability before making requests
   - Show clear upgrade paths for restricted models
   - Cache model access information to reduce API calls

3. **Error Handling**:
