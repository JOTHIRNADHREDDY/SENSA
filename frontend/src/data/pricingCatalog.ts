export const PRICING_CATALOG = {
  pilot: {
    monthly: { USD: 0 },
    annual: { USD: 0 }
  },
  base_license: {
    monthly: { USD: 29900 },
    annual: { USD: 299000 } // 2 months free
  },
  professional: {
    monthly: { USD: 59900 },
    annual: { USD: 599000 }
  },
  business: {
    monthly: { USD: 99900 },
    annual: { USD: 999000 }
  },
  enterprise: {
    custom: true
  }
};

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'AUD' | 'CAD' | 'SGD' | 'JPY' | 'CHF' | 'CNY' | 'NZD' | 'MXN' | 'BRL' | 'ZAR' | 'AED';

export const CURRENCIES: Record<CurrencyCode, { symbol: string, name: string }> = {
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  INR: { symbol: '₹', name: 'Indian Rupee' },
  AUD: { symbol: 'A$', name: 'Australian Dollar' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar' },
  JPY: { symbol: '¥', name: 'Japanese Yen' },
  CHF: { symbol: 'CHF', name: 'Swiss Franc' },
  CNY: { symbol: '¥', name: 'Chinese Yuan' },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar' },
  MXN: { symbol: 'MX$', name: 'Mexican Peso' },
  BRL: { symbol: 'R$', name: 'Brazilian Real' },
  ZAR: { symbol: 'R', name: 'South African Rand' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham' }
};

export const getPriceForRegion = (planId: string, cycle: 'monthly' | 'annual', currency: CurrencyCode): number | null => {
  const plan = PRICING_CATALOG[planId as keyof typeof PRICING_CATALOG];
  if (!plan || 'custom' in plan) return null;
  
  const prices = plan[cycle] as Record<string, number>;
  if (currency in prices) {
    return prices[currency];
  }
  // Fallback to USD
  return prices['USD'];
};

export const formatPrice = (amountMinor: number | null, currency: CurrencyCode) => {
  if (amountMinor === null) return 'Custom';
  
  const symbol = CURRENCIES[currency]?.symbol || '$';
  const val = amountMinor / 100;
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(val);
};
