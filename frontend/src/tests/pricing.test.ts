import { describe, it, expect } from 'vitest';
import { formatPrice } from '../data/pricingCatalog';

describe('Pricing (Frontend)', () => {
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
