export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR' | 'AUD' | 'CAD' | 'SGD' | 'JPY' | 'CHF' | 'CNY' | 'NZD' | 'MXN' | 'BRL' | 'ZAR' | 'AED';

export interface PlanPrice {
  monthly: number;
  annual: number;
}

export interface PricingRegionConfig {
  region: string;
  currency: CurrencyCode;
  plans: {
    pilot: PlanPrice;
    base_license: PlanPrice;
    professional: PlanPrice;
    business: PlanPrice;
    enterprise: { custom: true };
  };
}

export const PRICING_REGIONS: Record<string, PricingRegionConfig> = {
  US: {
    region: 'US',
    currency: 'USD',
    plans: {
      pilot: { monthly: 0, annual: 0 },
      base_license: { monthly: 29900, annual: 299000 },
      professional: { monthly: 59900, annual: 599000 },
      business: { monthly: 99900, annual: 999000 },
      enterprise: { custom: true }
    }
  },
  INDIA: {
    region: 'INDIA',
    currency: 'INR',
    plans: {
      pilot: { monthly: 0, annual: 0 },
      base_license: { monthly: 999900, annual: 9999000 },
      professional: { monthly: 1999900, annual: 19999000 },
      business: { monthly: 3999900, annual: 39999000 },
      enterprise: { custom: true }
    }
  },
  UK: {
    region: 'UK',
    currency: 'GBP',
    plans: {
      pilot: { monthly: 0, annual: 0 },
      base_license: { monthly: 24900, annual: 249000 },
      professional: { monthly: 49900, annual: 499000 },
      business: { monthly: 84900, annual: 849000 },
      enterprise: { custom: true }
    }
  },
  EUROPE: {
    region: 'EUROPE',
    currency: 'EUR',
    plans: {
      pilot: { monthly: 0, annual: 0 },
      base_license: { monthly: 27900, annual: 279000 },
      professional: { monthly: 54900, annual: 549000 },
      business: { monthly: 94900, annual: 949000 },
      enterprise: { custom: true }
    }
  },
  JAPAN: {
    region: 'JAPAN',
    currency: 'JPY',
    plans: {
      pilot: { monthly: 0, annual: 0 },
      base_license: { monthly: 3980000, annual: 39800000 },
      professional: { monthly: 7980000, annual: 79800000 },
      business: { monthly: 14980000, annual: 149800000 },
      enterprise: { custom: true }
    }
  },
  AUSTRALIA: {
    region: 'AUSTRALIA',
    currency: 'AUD',
    plans: {
      pilot: { monthly: 0, annual: 0 },
      base_license: { monthly: 44900, annual: 449000 },
      professional: { monthly: 89900, annual: 899000 },
      business: { monthly: 149900, annual: 1499000 },
      enterprise: { custom: true }
    }
  },
  CANADA: {
    region: 'CANADA',
    currency: 'CAD',
    plans: {
      pilot: { monthly: 0, annual: 0 },
      base_license: { monthly: 39900, annual: 399000 },
      professional: { monthly: 79900, annual: 799000 },
      business: { monthly: 129900, annual: 1299000 },
      enterprise: { custom: true }
    }
  },
  DEFAULT: {
    region: 'DEFAULT',
    currency: 'USD',
    plans: {
      pilot: { monthly: 0, annual: 0 },
      base_license: { monthly: 29900, annual: 299000 },
      professional: { monthly: 59900, annual: 599000 },
      business: { monthly: 99900, annual: 999000 },
      enterprise: { custom: true }
    }
  }
};

// ISO 3166-1 alpha-2 mapping to Pricing Regions
export const COUNTRY_TO_REGION: Record<string, string> = {
  'US': 'US',
  'IN': 'INDIA',
  'GB': 'UK',
  'JP': 'JAPAN',
  'AU': 'AUSTRALIA',
  'CA': 'CANADA',
  // Eurozone mapping
  'AT': 'EUROPE', 'BE': 'EUROPE', 'CY': 'EUROPE', 'EE': 'EUROPE', 'FI': 'EUROPE',
  'FR': 'EUROPE', 'DE': 'EUROPE', 'GR': 'EUROPE', 'IE': 'EUROPE', 'IT': 'EUROPE',
  'LV': 'EUROPE', 'LT': 'EUROPE', 'LU': 'EUROPE', 'MT': 'EUROPE', 'NL': 'EUROPE',
  'PT': 'EUROPE', 'SK': 'EUROPE', 'SI': 'EUROPE', 'ES': 'EUROPE', 'MC': 'EUROPE',
  'SM': 'EUROPE', 'VA': 'EUROPE', 'AD': 'EUROPE', 'ME': 'EUROPE', 'XK': 'EUROPE'
};

export const getPricingForCountry = (isoCode: string): PricingRegionConfig => {
  const regionName = COUNTRY_TO_REGION[isoCode.toUpperCase()] || 'DEFAULT';
  return PRICING_REGIONS[regionName] || PRICING_REGIONS['DEFAULT'];
};

export const getCheckoutPrice = (isoCode: string, planId: string, cycle: 'monthly' | 'annual') => {
  const config = getPricingForCountry(isoCode);
  if (planId === 'enterprise') return null;
  
  const plan = config.plans[planId as keyof typeof config.plans] as PlanPrice;
  if (!plan) return null;

  return {
    currency: config.currency,
    amountMinor: cycle === 'annual' ? plan.annual : plan.monthly
  };
};
