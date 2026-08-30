import { describe, it, expect } from 'vitest';
import { COUNTRIES, Country } from '../data/countries';

describe('Country Dataset Integrity', () => {
  it('should contain at least 190 countries', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(190);
  });

  it('every country should have required fields', () => {
    COUNTRIES.forEach((c: Country) => {
      expect(c.name).toBeTruthy();
      expect(c.countryCode).toBeTruthy();
      expect(c.iso2).toBeTruthy();
      expect(c.currency).toBeTruthy();
      expect(c.currencyCode).toBeTruthy();
      expect(c.flag).toBeTruthy();
    });
  });

  it('should have unique country codes', () => {
    const codes = COUNTRIES.map(c => c.countryCode);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it('should contain key countries: US, IN, GB, DE, JP, AU', () => {
    const codes = COUNTRIES.map(c => c.countryCode);
    ['US', 'IN', 'GB', 'DE', 'JP', 'AU'].forEach(code => {
      expect(codes).toContain(code);
    });
  });
});
