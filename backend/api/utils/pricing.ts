export const COUNTRY_DATA: Record<string, { currency: string, region: string }> = {
  "IN": { currency: "INR", region: "south_asia" },
  "US": { currency: "USD", region: "north_america" },
  "GB": { currency: "GBP", region: "europe" },
  "AE": { currency: "AED", region: "middle_east" },
  // ... Worldwide country list
};

export const PRICING_TIERS: Record<string, any> = {
  "starter": {
    "north_america": { USD: { monthly: 0, yearly: 0 } },
    "south_asia": { INR: { monthly: 0, yearly: 0 } },
  },
  "basic": {
    "north_america": { USD: { monthly: 12, yearly: 120 } },
    "south_asia": { INR: { monthly: 999, yearly: 9990 } },
  },
  "pro": {
    "north_america": { USD: { monthly: 29, yearly: 290 } },
    "south_asia": { INR: { monthly: 2499, yearly: 24990 } },
  }
};

export function determinePrice(countryCode: string, planId: string, billingCycle: "monthly" | "yearly") {
  const country = COUNTRY_DATA[countryCode];
  if (!country) throw new Error("Invalid country code");

  const plan = PRICING_TIERS[planId];
  if (!plan) throw new Error("Invalid plan ID");

  let regionPricing = plan[country.region];
  // Fallback to US if region pricing isn't defined explicitly
  if (!regionPricing) regionPricing = plan["north_america"]; 
  
  const currency = regionPricing[country.currency] ? country.currency : "USD";
  const price = regionPricing[currency][billingCycle];

  return { price, currency, region: country.region };
}
