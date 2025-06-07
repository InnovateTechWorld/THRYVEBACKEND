// Complete type declaration for flutterwave-node-v3
declare module 'flutterwave-node-v3' {
  interface CustomerData {
    email: string;
    phone_number?: string;
    name?: string;
  }

  interface CustomizationData {
    title?: string;
    description?: string;
    logo?: string;
  }

  interface PaymentInitPayload {
    tx_ref: string;
    amount: number;
    currency: string;
    redirect_url: string;
    customer: CustomerData;
    customizations?: CustomizationData;
    payment_options?: string;
    meta?: any;
    callback_url?: string;
    payment_plan?: string;
  }

  interface FlutterwaveResponse {
    status: string;
    message: string;
    data?: any;
    meta?: any;
  }

  interface VerifyPaymentPayload {
    id: string;
  }

  interface BankData {
    id: number;
    code: string;
    name: string;
  }

  interface AccountVerificationPayload {
    account_number: string;
    account_bank: string;
  }

  interface TransferPayload {
    account_bank: string;
    account_number: string;
    amount: number;
    narration: string;
    currency: string;
    reference: string;
    callback_url?: string;
    debit_currency?: string;
  }

  interface SubscriptionPlanPayload {
    amount: number;
    name: string;
    interval: string;
    currency: string;
  }

  class Flutterwave {
    constructor(publicKey: string, secretKey: string);
    
    Payment: {
      initiate(payload: PaymentInitPayload): Promise<FlutterwaveResponse>;
      verify(payload: VerifyPaymentPayload): Promise<FlutterwaveResponse>;
    };
    
    Bank: {
      country(payload: { country: string }): Promise<FlutterwaveResponse>;
    };
    
    Misc: {
      verify_Account(payload: AccountVerificationPayload): Promise<FlutterwaveResponse>;
    };
    
    Transfer: {
      initiate(payload: TransferPayload): Promise<FlutterwaveResponse>;
      get_a_transfer(payload: { id: string }): Promise<FlutterwaveResponse>;
    };

    PaymentPlan: {
      create(payload: SubscriptionPlanPayload): Promise<FlutterwaveResponse>;
    };

    Subscription: {
      get(payload: { email: string }): Promise<FlutterwaveResponse>;
      cancel(payload: { id: string }): Promise<FlutterwaveResponse>;
      activate(payload: { id: string }): Promise<FlutterwaveResponse>;
    };
  }

  export = Flutterwave;
}