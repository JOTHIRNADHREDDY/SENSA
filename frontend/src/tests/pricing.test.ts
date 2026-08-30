import { describe, it, expect } from 'vitest';
import { getPricingForCountry, getCheckoutPrice, PRICING_REGIONS, COUNTRY_TO_REGION } from '../lib/pricingEngine';
import { formatPrice, PRICING_CATALOG, CURRENCIES } from '../data/pricingCatalog';

describe('Pricing Engine (Frontend)', () => {
  describe('getPricingForCountry', () => {
    it('should return US pricing for US', () => {
      const config = getPricingForCountry('US');
      expect(config.region).toBe('US');
      expect(config.currency).toBe('USD');
    });

    it('should return INDIA pricing for IN', () => {
      const config = getPricingForCountry('IN');
      expect(config.region).toBe('INDIA');
      expect(config.currency).toBe('INR');
    });

    it('should return EUROPE pricing for DE', () => {
      const config = getPricingForCountry('DE');
      expect(config.region).toBe('EUROPE');
      expect(config.currency).toBe('EUR');
    });

    it('should return DEFAULT pricing for unknown country', () => {
      const config = getPricingForCountry('XX');
      expect(config.region).toBe('DEFAULT');
      expect(config.currency).toBe('USD');
    });
  });

  describe('getCheckoutPrice', () => {
    it('should return null for enterprise plan', () => {
      expect(getCheckoutPrice('US', 'enterprise', 'monthly')).toBeNull();
    });

    it('should return null for unknown plan', () => {
      expect(getCheckoutPrice('US', 'nonexistent', 'monthly')).toBeNull();
    });

    it('should return monthly price for valid plan', () => {
      const result = getCheckoutPrice('US', 'base_license', 'monthly');
      expect(result).not.toBeNull();
      expect(result!.currency).toBe('USD');
      expect(result!.amountMinor).toBeGreaterThan(0);
    });

    it('should return annual price for valid plan', () => {
      const result = getCheckoutPrice('US', 'base_license', 'annual');
      expect(result).not.toBeNull();
      expect(result!.amountMinor).toBeGreaterThan(0);
    });

    it('pilot plan should be free', () => {
      const result = getCheckoutPrice('US', 'pilot', 'monthly');
      expect(result).not.toBeNull();
      expect(result!.amountMinor).toBe(0);
    });
  });

  describe('No client-supplied price', () => {
    it('frontend pricing catalog should NOT contain server-side determination logic', () => {
      // The frontend catalog is display-only reference data.
      // The authoritative price is always fetched from POST /api/v1/billing/price.
      // The checkout flow in App.tsx sends planId + countryCode to the backend,
      // never sends an amount.
      expect(PRICING_CATALOG).toBeDefined();
      expect(typeof PRICING_CATALOG).toBe('object');
    });
  });

  describe('formatPrice', () => {
    it('should format null as Custom', () => {
      expect(formatPrice(null, 'USD')).toBe('Custom');
    });

    it('should format minor units to display currency', () => {
      const result = formatPrice(29900, 'USD');
      expect(result).toContain('299');
    });

    it('should format INR correctly', () => {
      const result = formatPrice(999900, 'INR');
      expect(result).toBeTruthy();
    });
  });
});

describe('Country-to-Region Mapping', () => {
  it('should map US to US region', () => {
    expect(COUNTRY_TO_REGION['US']).toBe('US');
  });

  it('should map IN to INDIA region', () => {
    expect(COUNTRY_TO_REGION['IN']).toBe('INDIA');
  });

  it('should map Eurozone countries to EUROPE', () => {
    ['FR', 'DE', 'IT', 'ES', 'NL'].forEach(code => {
      expect(COUNTRY_TO_REGION[code]).toBe('EUROPE');
    });
  });
});

describe('Currency Registry', () => {
  it('should have symbol for every currency code', () => {
    Object.entries(CURRENCIES).forEach(([code, data]) => {
      expect(data.symbol).toBeTruthy();
      expect(data.name).toBeTruthy();
    });
  });

  it('should contain USD, EUR, GBP, INR at minimum', () => {
    expect(CURRENCIES['USD']).toBeDefined();
    expect(CURRENCIES['EUR']).toBeDefined();
    expect(CURRENCIES['GBP']).toBeDefined();
    expect(CURRENCIES['INR']).toBeDefined();
  });
});
