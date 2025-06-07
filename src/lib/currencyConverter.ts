// Currency converter service for international payments
// Using the provided exchange rates as of June 7, 2025

export interface CurrencyRate {
  code: string;
  name: string;
  rate: number; // Rate to USD
  symbol?: string;
  supported_by: ('card' | 'applepay' | 'googlepay')[];
}

export const CURRENCY_RATES: Record<string, CurrencyRate> = {
  // A - I
  AED: { code: 'AED', name: 'UAE Dirham', rate: 0.2722, symbol: 'د.إ', supported_by: ['card', 'applepay', 'googlepay'] },
  ALL: { code: 'ALL', name: 'Albanian Lek', rate: 0.0107, symbol: 'L', supported_by: ['card', 'applepay', 'googlepay'] },
  AUD: { code: 'AUD', name: 'Australian Dollar', rate: 0.6648, symbol: 'A$', supported_by: ['card', 'applepay', 'googlepay'] },
  BGN: { code: 'BGN', name: 'Bulgarian Lev', rate: 0.5447, symbol: 'лв', supported_by: ['card', 'applepay', 'googlepay'] },
  BHD: { code: 'BHD', name: 'Bahraini Dinar', rate: 2.6521, symbol: '.د.ب', supported_by: ['card', 'applepay', 'googlepay'] },
  BND: { code: 'BND', name: 'Brunei Dollar', rate: 0.7397, symbol: 'B$', supported_by: ['card', 'applepay', 'googlepay'] },
  CAD: { code: 'CAD', name: 'Canadian Dollar', rate: 0.7303, symbol: 'C$', supported_by: ['card', 'applepay', 'googlepay'] },
  CHF: { code: 'CHF', name: 'Swiss Franc', rate: 1.1165, symbol: 'CHF', supported_by: ['card', 'applepay', 'googlepay'] },
  CLP: { code: 'CLP', name: 'Chilean Peso', rate: 0.0011, symbol: '$', supported_by: ['card', 'applepay', 'googlepay'] },
  CNY: { code: 'CNY', name: 'Chinese Yuan', rate: 0.1380, symbol: '¥', supported_by: ['card', 'applepay', 'googlepay'] },
  COP: { code: 'COP', name: 'Colombian Peso', rate: 0.00025, symbol: '$', supported_by: ['card', 'applepay', 'googlepay'] },
  CRC: { code: 'CRC', name: 'Costa Rican Colón', rate: 0.0019, symbol: '₡', supported_by: ['card', 'applepay', 'googlepay'] },
  CZK: { code: 'CZK', name: 'Czech Koruna', rate: 0.0435, symbol: 'Kč', supported_by: ['card', 'applepay', 'googlepay'] },
  DKK: { code: 'DKK', name: 'Danish Krone', rate: 0.1456, symbol: 'kr', supported_by: ['card', 'applepay', 'googlepay'] },
  DOP: { code: 'DOP', name: 'Dominican Peso', rate: 0.0170, symbol: 'RD$', supported_by: ['card', 'applepay', 'googlepay'] },
  DZD: { code: 'DZD', name: 'Algerian Dinar', rate: 0.0074, symbol: 'د.ج', supported_by: ['card', 'applepay', 'googlepay'] },
  EGP: { code: 'EGP', name: 'Egyptian Pound', rate: 0.0210, symbol: '£', supported_by: ['card', 'applepay', 'googlepay'] },
  EUR: { code: 'EUR', name: 'Euro', rate: 1.0856, symbol: '€', supported_by: ['card', 'applepay', 'googlepay'] },
  GBP: { code: 'GBP', name: 'British Pound Sterling', rate: 1.2721, symbol: '£', supported_by: ['card', 'applepay', 'googlepay'] },
  GHS: { code: 'GHS', name: 'Ghanaian Cedi', rate: 0.0667, symbol: '₵', supported_by: ['card', 'applepay', 'googlepay'] },
  GMD: { code: 'GMD', name: 'Gambian Dalasi', rate: 0.0145, symbol: 'D', supported_by: ['card', 'applepay', 'googlepay'] },
  GTQ: { code: 'GTQ', name: 'Guatemalan Quetzal', rate: 0.1287, symbol: 'Q', supported_by: ['card', 'applepay', 'googlepay'] },
  HKD: { code: 'HKD', name: 'Hong Kong Dollar', rate: 0.1279, symbol: 'HK$', supported_by: ['card', 'applepay', 'googlepay'] },
  HNL: { code: 'HNL', name: 'Honduran Lempira', rate: 0.0405, symbol: 'L', supported_by: ['card', 'applepay', 'googlepay'] },
  HUF: { code: 'HUF', name: 'Hungarian Forint', rate: 0.0027, symbol: 'Ft', supported_by: ['card', 'applepay', 'googlepay'] },
  IDR: { code: 'IDR', name: 'Indonesian Rupiah', rate: 0.000061, symbol: 'Rp', supported_by: ['card', 'applepay', 'googlepay'] },
  ILS: { code: 'ILS', name: 'Israeli New Shekel', rate: 0.2690, symbol: '₪', supported_by: ['card', 'applepay', 'googlepay'] },
  INR: { code: 'INR', name: 'Indian Rupee', rate: 0.0120, symbol: '₹', supported_by: ['card', 'applepay', 'googlepay'] },
  IQD: { code: 'IQD', name: 'Iraqi Dinar', rate: 0.00076, symbol: 'ع.د', supported_by: ['card', 'applepay', 'googlepay'] },
  ISK: { code: 'ISK', name: 'Icelandic Króna', rate: 0.0072, symbol: 'kr', supported_by: ['card', 'applepay', 'googlepay'] },

  // J - M
  JOD: { code: 'JOD', name: 'Jordanian Dinar', rate: 1.4104, symbol: 'د.ا', supported_by: ['card', 'applepay', 'googlepay'] },
  JPY: { code: 'JPY', name: 'Japanese Yen', rate: 0.0064, symbol: '¥', supported_by: ['card', 'applepay', 'googlepay'] },
  KES: { code: 'KES', name: 'Kenyan Shilling', rate: 0.0077, symbol: 'KSh', supported_by: ['card'] },
  KHR: { code: 'KHR', name: 'Cambodian Riel', rate: 0.00024, symbol: '៛', supported_by: ['card', 'applepay', 'googlepay'] },
  KRW: { code: 'KRW', name: 'South Korean Won', rate: 0.00073, symbol: '₩', supported_by: ['card', 'applepay', 'googlepay'] },
  KWD: { code: 'KWD', name: 'Kuwaiti Dinar', rate: 3.2558, symbol: 'د.ك', supported_by: ['card', 'applepay', 'googlepay'] },
  LBP: { code: 'LBP', name: 'Lebanese Pound', rate: 0.000011, symbol: 'ل.ل', supported_by: ['card', 'applepay', 'googlepay'] },
  LKR: { code: 'LKR', name: 'Sri Lankan Rupee', rate: 0.0033, symbol: 'Rs', supported_by: ['card', 'applepay', 'googlepay'] },
  LYD: { code: 'LYD', name: 'Libyan Dinar', rate: 0.2064, symbol: 'ل.د', supported_by: ['card', 'applepay', 'googlepay'] },
  MAD: { code: 'MAD', name: 'Moroccan Dirham', rate: 0.0998, symbol: 'د.م.', supported_by: ['card', 'applepay', 'googlepay'] },
  MOP: { code: 'MOP', name: 'Macanese Pataca', rate: 0.1237, symbol: 'MOP$', supported_by: ['card', 'applepay', 'googlepay'] },
  MYR: { code: 'MYR', name: 'Malaysian Ringgit', rate: 0.2127, symbol: 'RM', supported_by: ['card', 'applepay', 'googlepay'] },

  // N - S
  NGN: { code: 'NGN', name: 'Nigerian Naira', rate: 0.00067, symbol: '₦', supported_by: ['card', 'applepay', 'googlepay'] },
  NOK: { code: 'NOK', name: 'Norwegian Krone', rate: 0.0945, symbol: 'kr', supported_by: ['card', 'applepay', 'googlepay'] },
  NZD: { code: 'NZD', name: 'New Zealand Dollar', rate: 0.6152, symbol: 'NZ$', supported_by: ['card', 'applepay', 'googlepay'] },
  OMR: { code: 'OMR', name: 'Omani Rial', rate: 2.6008, symbol: 'ر.ع.', supported_by: ['card', 'applepay', 'googlepay'] },
  PAB: { code: 'PAB', name: 'Panamanian Balboa', rate: 1.00, symbol: 'B/.', supported_by: ['card', 'applepay', 'googlepay'] },
  PHP: { code: 'PHP', name: 'Philippine Peso', rate: 0.0170, symbol: '₱', supported_by: ['card', 'applepay', 'googlepay'] },
  PYG: { code: 'PYG', name: 'Paraguayan Guarani', rate: 0.00013, symbol: '₲', supported_by: ['card', 'applepay', 'googlepay'] },
  QAR: { code: 'QAR', name: 'Qatari Rial', rate: 0.2736, symbol: 'ر.ق', supported_by: ['card', 'applepay', 'googlepay'] },
  SAR: { code: 'SAR', name: 'Saudi Riyal', rate: 0.2666, symbol: 'ر.س', supported_by: ['card', 'applepay', 'googlepay'] },
  SEK: { code: 'SEK', name: 'Swedish Krona', rate: 0.0957, symbol: 'kr', supported_by: ['card', 'applepay', 'googlepay'] },
  SGD: { code: 'SGD', name: 'Singapore Dollar', rate: 0.7397, symbol: 'S$', supported_by: ['card', 'applepay', 'googlepay'] },
  SLL: { code: 'SLL', name: 'Sierra Leonean Leone', rate: 0.000049, symbol: 'Le', supported_by: ['card', 'applepay', 'googlepay'] },
  SVC: { code: 'SVC', name: 'Salvadoran Colón', rate: 0.1143, symbol: '₡', supported_by: ['card', 'applepay', 'googlepay'] },
  SYP: { code: 'SYP', name: 'Syrian Pound', rate: 0.00040, symbol: '£S', supported_by: ['applepay', 'googlepay'] },

  // T - Z
  THB: { code: 'THB', name: 'Thai Baht', rate: 0.0272, symbol: '฿', supported_by: ['card', 'applepay', 'googlepay'] },
  TND: { code: 'TND', name: 'Tunisian Dinar', rate: 0.3204, symbol: 'د.ت', supported_by: ['card', 'applepay', 'googlepay'] },
  TWD: { code: 'TWD', name: 'New Taiwan Dollar', rate: 0.0308, symbol: 'NT$', supported_by: ['card', 'applepay', 'googlepay'] },
  TZS: { code: 'TZS', name: 'Tanzanian Shilling', rate: 0.00038, symbol: 'TSh', supported_by: ['card', 'applepay', 'googlepay'] },
  UGX: { code: 'UGX', name: 'Ugandan Shilling', rate: 0.00026, symbol: 'USh', supported_by: ['card', 'googlepay'] },
  USD: { code: 'USD', name: 'United States Dollar', rate: 1.00, symbol: '$', supported_by: ['card', 'applepay', 'googlepay'] },
  VND: { code: 'VND', name: 'Vietnamese Dong', rate: 0.000039, symbol: '₫', supported_by: ['card', 'applepay', 'googlepay'] },
  YER: { code: 'YER', name: 'Yemeni Rial', rate: 0.0039, symbol: '﷼', supported_by: ['card', 'applepay', 'googlepay'] },
  ZAR: { code: 'ZAR', name: 'South African Rand', rate: 0.0530, symbol: 'R', supported_by: ['card'] },
  ZMW: { code: 'ZMW', name: 'Zambian Kwacha', rate: 0.038, symbol: 'ZK', supported_by: ['card', 'applepay', 'googlepay'] }
};

export class CurrencyConverter {
  /**
   * Convert amount from one currency to another
   */
  static convert(amount: number, fromCurrency: string, toCurrency: string): number {
    const from = CURRENCY_RATES[fromCurrency.toUpperCase()];
    const to = CURRENCY_RATES[toCurrency.toUpperCase()];

    if (!from || !to) {
      throw new Error(`Unsupported currency: ${!from ? fromCurrency : toCurrency}`);
    }

    // Convert to USD first, then to target currency
    const usdAmount = amount * from.rate;
    return usdAmount / to.rate;
  }

  /**
   * Convert any currency to USD
   */
  static toUSD(amount: number, fromCurrency: string): number {
    return this.convert(amount, fromCurrency, 'USD');
  }

  /**
   * Convert USD to any currency
   */
  static fromUSD(amount: number, toCurrency: string): number {
    return this.convert(amount, 'USD', toCurrency);
  }

  /**
   * Get supported payment methods for a currency
   */
  static getSupportedPaymentMethods(currency: string): string[] {
    const currencyData = CURRENCY_RATES[currency.toUpperCase()];
    if (!currencyData) {
      return ['card']; // Default fallback
    }
    return currencyData.supported_by;
  }

  /**
   * Check if a currency is supported
   */
  static isSupported(currency: string): boolean {
    return currency.toUpperCase() in CURRENCY_RATES;
  }

  /**
   * Get currency symbol
   */
  static getSymbol(currency: string): string {
    const currencyData = CURRENCY_RATES[currency.toUpperCase()];
    return currencyData?.symbol || currency.toUpperCase();
  }

  /**
   * Get currency name
   */
  static getName(currency: string): string {
    const currencyData = CURRENCY_RATES[currency.toUpperCase()];
    return currencyData?.name || currency.toUpperCase();
  }

  /**
   * Get all supported currencies
   */
  static getSupportedCurrencies(): CurrencyRate[] {
    return Object.values(CURRENCY_RATES);
  }

  /**
   * Format amount with currency symbol
   */
  static format(amount: number, currency: string): string {
    const symbol = this.getSymbol(currency);
    return `${symbol}${amount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  }

  /**
   * Get exchange rate for a currency pair
   */
  static getExchangeRate(fromCurrency: string, toCurrency: string): number {
    const from = CURRENCY_RATES[fromCurrency.toUpperCase()];
    const to = CURRENCY_RATES[toCurrency.toUpperCase()];

    if (!from || !to) {
      throw new Error(`Unsupported currency: ${!from ? fromCurrency : toCurrency}`);
    }

    // Rate from one currency to another
    return from.rate / to.rate;
  }

  /**
   * Calculate platform fee in local currency
   */
  static calculatePlatformFee(amount: number, currency: string, feePercentage: number = 0.15): {
    feeAmount: number;
    feeInUSD: number;
    netAmount: number;
    netInUSD: number;
  } {
    const feeAmount = amount * feePercentage;
    const netAmount = amount - feeAmount;
    
    return {
      feeAmount,
      feeInUSD: this.toUSD(feeAmount, currency),
      netAmount,
      netInUSD: this.toUSD(netAmount, currency)
    };
  }
}