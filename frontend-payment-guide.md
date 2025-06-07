# Frontend Payment Integration Guide

## Overview
Your Fast Backend AI App now supports **international payments** in **60+ currencies** using **Flutterwave Standard API** with **cards, Apple Pay, and Google Pay**.

## 🔧 Payment Flow Architecture

### **1. Payment Initialization**
```javascript
// Frontend: Initiate payment
const initiatePayment = async (type, amount, currency, planId = null) => {
  try {
    const response = await fetch('/api/payment/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        type, // 'subscription' or 'topup'
        amount,
        currency: currency.toUpperCase(), // e.g., 'NGN', 'USD', 'EUR'
        planId, // Required for subscriptions
        redirectUrl: `${window.location.origin}/payment-callback`,
        country: 'NG' // User's country code
      })
    });

    const result = await response.json();
    
    if (result.success) {
      // Redirect user to Flutterwave hosted payment page
      window.location.href = result.data.paymentUrl;
      
      // Store reference for later verification
      localStorage.setItem('pendingPayment', JSON.stringify({
        reference: result.data.reference,
        transaction_id: result.data.transaction_id, // ✅ Important for verification
        type,
        amount: result.data.amountLocal,
        currency: result.data.currency,
        amountUSD: result.data.amountUSD
      }));
    }
  } catch (error) {
    console.error('Payment initiation failed:', error);
  }
};
```

### **2. Payment Callback Handling**
```javascript
// Frontend: Handle payment callback (payment-callback page)
const handlePaymentCallback = async () => {
  try {
    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const tx_ref = urlParams.get('tx_ref');
    const transaction_id = urlParams.get('transaction_id');

    // Get stored payment data
    const pendingPayment = JSON.parse(localStorage.getItem('pendingPayment') || '{}');

    if (status === 'successful' && (transaction_id || tx_ref)) {
      // ✅ FIXED: Use transaction_id for verification (not tx_ref)
      const verificationId = transaction_id || tx_ref;
      
      const response = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          transaction_id, // ✅ Primary identifier
          tx_ref, // ✅ Fallback identifier
          status
        })
      });

      const result = await response.json();
      
      if (result.success && result.verified) {
        // Payment successful
        localStorage.removeItem('pendingPayment');
        showSuccessMessage('Payment completed successfully!');
        
        // Redirect based on payment type
        if (pendingPayment.type === 'subscription') {
          window.location.href = '/dashboard?tab=subscription';
        } else {
          window.location.href = '/dashboard?tab=credits';
        }
      } else {
        showErrorMessage('Payment verification failed');
      }
    } else {
      showErrorMessage('Payment was not successful');
    }
  } catch (error) {
    console.error('Payment verification failed:', error);
    showErrorMessage('Payment verification error');
  }
};
```

### **3. Currency Selection Component**
```javascript
// Frontend: Currency selector with real-time rates
const CurrencySelector = () => {
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [amount, setAmount] = useState(10);

  useEffect(() => {
    // Fetch supported currencies
    fetch('/api/payment/currencies')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setCurrencies(data.data);
        }
      });
  }, []);

  const calculateLocalAmount = (usdAmount) => {
    const currency = currencies.find(c => c.code === selectedCurrency);
    if (!currency) return usdAmount;
    return (usdAmount / currency.rateToUSD).toFixed(2);
  };

  return (
    <div className="currency-selector">
      <label>Select Currency:</label>
      <select 
        value={selectedCurrency} 
        onChange={(e) => setSelectedCurrency(e.target.value)}
      >
        {currencies.map(currency => (
          <option key={currency.code} value={currency.code}>
            {currency.symbol} {currency.code} - {currency.name}
          </option>
        ))}
      </select>
      
      <div className="amount-display">
        <p>Amount: {calculateLocalAmount(10)} {selectedCurrency}</p>
        <p>≈ $10.00 USD (gets you $10 in AI credits)</p>
      </div>
      
      <div className="payment-methods">
        <h4>Available Payment Methods:</h4>
        {currencies.find(c => c.code === selectedCurrency)?.supportedMethods.map(method => (
          <span key={method} className="payment-method">
            {method === 'card' && '💳 Cards'}
            {method === 'applepay' && '🍎 Apple Pay'}
            {method === 'googlepay' && '🟢 Google Pay'}
          </span>
        ))}
      </div>
    </div>
  );
};
```

### **4. Payment Methods Display**
```javascript
// Frontend: Get available payment methods for user's location
const getPaymentMethods = async (country, currency) => {
  try {
    const response = await fetch(
      `/api/payment/methods?country=${country}&currency=${currency}`,
      {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      }
    );
    
    const result = await response.json();
    
    if (result.success) {
      return result.data.methods;
    }
  } catch (error) {
    console.error('Failed to fetch payment methods:', error);
  }
  return [];
};
```

### **5. Subscription Management**
```javascript
// Frontend: Subscribe to a plan
const subscribeToPlan = async (planId) => {
  try {
    const response = await fetch('/api/payment/subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ planId })
    });

    const result = await response.json();
    
    if (result.success) {
      if (result.data.requiresPayment) {
        // Paid plan - initiate payment
        await initiatePayment(
          'subscription', 
          result.data.amount, 
          result.data.currency, 
          planId
        );
      } else {
        // Free plan - activated immediately
        showSuccessMessage('Free plan activated!');
        window.location.reload();
      }
    }
  } catch (error) {
    console.error('Subscription failed:', error);
  }
};

// Frontend: Cancel subscription
const cancelSubscription = async () => {
  try {
    const response = await fetch('/api/payment/subscription', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });

    const result = await response.json();
    
    if (result.success) {
      showSuccessMessage('Subscription cancelled successfully');
      window.location.reload();
    }
  } catch (error) {
    console.error('Cancellation failed:', error);
  }
};
```

### **6. Credit Top-up Component**
```javascript
// Frontend: Credit top-up with currency conversion
const CreditTopup = () => {
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [usdAmount, setUsdAmount] = useState(10);
  const [currencies, setCurrencies] = useState([]);

  const handleTopup = async () => {
    const currency = currencies.find(c => c.code === selectedCurrency);
    const localAmount = usdAmount / currency.rateToUSD;
    
    await initiatePayment('topup', localAmount, selectedCurrency);
  };

  return (
    <div className="credit-topup">
      <h3>Top Up AI Credits</h3>
      
      <div className="amount-selector">
        <label>USD Amount (Credits):</label>
        <select value={usdAmount} onChange={(e) => setUsdAmount(Number(e.target.value))}>
          <option value={5}>$5 (5 credits)</option>
          <option value={10}>$10 (10 credits)</option>
          <option value={25}>$25 (25 credits)</option>
          <option value={50}>$50 (50 credits)</option>
          <option value={100}>$100 (100 credits)</option>
        </select>
      </div>

      <CurrencySelector 
        selectedCurrency={selectedCurrency}
        onCurrencyChange={setSelectedCurrency}
        usdAmount={usdAmount}
      />

      <button onClick={handleTopup} className="pay-button">
        Pay Now
      </button>
    </div>
  );
};
```

### **7. Transaction History**
```javascript
// Frontend: Display user's transaction history
const TransactionHistory = () => {
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    fetch('/api/payment/transactions', {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setTransactions(data.data);
      }
    });
  }, []);

  return (
    <div className="transaction-history">
      <h3>Transaction History</h3>
      
      {transactions.map(tx => (
        <div key={tx.id} className="transaction-item">
          <div className="tx-info">
            <span className="type">{tx.payment_type}</span>
            <span className="amount">{tx.formattedAmount}</span>
            <span className="usd-amount">≈ {tx.formattedAmountUSD}</span>
          </div>
          <div className="tx-status">
            <span className={`status ${tx.status}`}>{tx.status}</span>
            <span className="date">{new Date(tx.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
```

## 🌍 Supported Countries & Currencies

### **Major Currencies with Full Support (Cards + Apple Pay + Google Pay):**
- **USD** 🇺🇸 - United States Dollar
- **EUR** 🇪🇺 - Euro
- **GBP** 🇬🇧 - British Pound
- **CAD** 🇨🇦 - Canadian Dollar
- **AUD** 🇦🇺 - Australian Dollar
- **NGN** 🇳🇬 - Nigerian Naira
- **GHS** 🇬🇭 - Ghanaian Cedi
- **KES** 🇰🇪 - Kenyan Shilling (Cards only)
- **ZAR** 🇿🇦 - South African Rand (Cards only)

### **Asian Currencies:**
- **JPY** 🇯🇵 - Japanese Yen
- **CNY** 🇨🇳 - Chinese Yuan
- **INR** 🇮🇳 - Indian Rupee
- **SGD** 🇸🇬 - Singapore Dollar
- **MYR** 🇲🇾 - Malaysian Ringgit
- **THB** 🇹🇭 - Thai Baht
- **PHP** 🇵🇭 - Philippine Peso

### **Middle East & Africa:**
- **AED** 🇦🇪 - UAE Dirham
- **SAR** 🇸🇦 - Saudi Riyal
- **EGP** 🇪🇬 - Egyptian Pound
- **MAD** 🇲🇦 - Moroccan Dirham

## 💡 Frontend Best Practices

### **1. Error Handling**
```javascript
const handlePaymentError = (error) => {
  const errorMessages = {
    'Currency not supported': 'Please select a different currency',
    'Payment verification failed': 'Payment could not be verified. Please contact support.',
    'Transaction not found': 'Payment reference not found. Please try again.',
    'Internal server error': 'Server error. Please try again later.'
  };

  const message = errorMessages[error.message] || 'Payment failed. Please try again.';
  showErrorMessage(message);
};
```

### **2. Loading States**
```javascript
const [isProcessing, setIsProcessing] = useState(false);

const handlePayment = async () => {
  setIsProcessing(true);
  try {
    await initiatePayment(type, amount, currency, planId);
  } catch (error) {
    handlePaymentError(error);
  } finally {
    setIsProcessing(false);
  }
};
```

### **3. Real-time Currency Updates**
```javascript
// Update exchange rates every 30 minutes
useEffect(() => {
  const interval = setInterval(() => {
    fetchCurrencies();
  }, 30 * 60 * 1000);

  return () => clearInterval(interval);
}, []);
```

## 🔒 Security Considerations

1. **Never store payment credentials** in frontend
2. **Always verify payments** on the backend
3. **Use HTTPS** for all payment-related requests
4. **Validate user input** before sending to backend
5. **Handle payment callbacks securely** using transaction_id

## 📱 Mobile Optimization

### **Apple Pay Integration**
```javascript
// Check if Apple Pay is available
if (window.ApplePaySession && ApplePaySession.canMakePayments()) {
  // Show Apple Pay button
  showApplePayButton();
}
```

### **Google Pay Integration**
```javascript
// Check if Google Pay is available
if (window.google && window.google.payments) {
  // Show Google Pay button
  showGooglePayButton();
}
```

## 🎯 Implementation Checklist

- [ ] **Payment Initialization**: Set up currency selection and amount calculation
- [ ] **Callback Handling**: Create payment-callback page with proper verification
- [ ] **Error Handling**: Implement comprehensive error messages
- [ ] **Loading States**: Add loading indicators during payment processing
- [ ] **Transaction History**: Display user's payment history
- [ ] **Subscription Management**: Handle plan upgrades/downgrades
- [ ] **Mobile Optimization**: Test on iOS/Android devices
- [ ] **Currency Display**: Show real-time exchange rates
- [ ] **Payment Methods**: Display available methods per currency
- [ ] **Security**: Implement proper token management

## 🚀 Go Live Checklist

1. **Switch to Live API Keys** in `.env`
2. **Update Webhook URL** to production domain
3. **Test with real cards** in staging environment
4. **Set up monitoring** for payment failures
5. **Configure customer support** for payment issues

Your frontend is now ready to handle international payments with Flutterwave's Standard API! 🌍💳