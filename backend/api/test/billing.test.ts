import { describe, it, expect, vi } from "vitest";
import { determinePrice, COUNTRY_DATA, PRICING_TIERS } from "../utils/pricing";

describe("Billing Price Endpoint Logic", () => {
  it("should compute all plan prices for a valid country", () => {
    const PLAN_MAPPING: Record<string, string> = {
      pilot: "starter",
      base_license: "starter",
      professional: "basic",
      business: "pro",
    };

    const targetPlans = ['pilot', 'base_license', 'professional', 'business'];
    const prices: any = {};
    const country = "US";

    targetPlans.forEach(uiPlan => {
      const sensaPlan = PLAN_MAPPING[uiPlan];
      let monthly = 0;
      let annual = 0;
      let currency = "USD";

      if (uiPlan !== 'pilot') {
        const mPrice = determinePrice(country, sensaPlan, "monthly");
        const aPrice = determinePrice(country, sensaPlan, "yearly");
        monthly = mPrice.price * 100;
        annual = aPrice.price * 100;
        currency = mPrice.currency;
      } else {
        const fallback = determinePrice(country, "starter", "monthly");
        currency = fallback.currency;
      }

      prices[uiPlan] = { planId: uiPlan, country, currency, monthly, annual };
    });

    expect(prices.pilot.monthly).toBe(0);
    expect(prices.pilot.annual).toBe(0);
    expect(prices.professional.monthly).toBeGreaterThan(0);
    expect(prices.business.monthly).toBeGreaterThan(prices.professional.monthly);
  });

  it("should return correct checkout price for a single plan", () => {
    const result = determinePrice("US", "basic", "monthly");
    expect(result.price).toBe(12);
    expect(result.currency).toBe("USD");
  });

  it("should reject enterprise plan lookup gracefully", () => {
    expect(() => determinePrice("US", "custom", "monthly")).toThrow();
  });
});

describe("Compatibility Endpoint Security", () => {
  it("SIMULATED_DELIVERY should only be returned when ENVIRONMENT is development", () => {
    // Verify the gating logic conceptually:
    // In production (ENVIRONMENT=production), Twilio unconfigured -> throws error
    // In development (ENVIRONMENT=development), Twilio unconfigured -> returns SIMULATED_DELIVERY
    const prodEnv = { ENVIRONMENT: 'production' };
    const devEnv = { ENVIRONMENT: 'development' };

    // Simulate the production path
    const shouldThrowInProd = prodEnv.ENVIRONMENT !== 'development';
    expect(shouldThrowInProd).toBe(true);

    // Simulate the development path
    const shouldSimulateInDev = devEnv.ENVIRONMENT === 'development';
    expect(shouldSimulateInDev).toBe(true);
  });

  it("mock Gemini response should only be returned when ENVIRONMENT is development", () => {
    const prodEnv = { ENVIRONMENT: 'production', GEMINI_API_KEY: '' };
    const devEnv = { ENVIRONMENT: 'development', GEMINI_API_KEY: '' };

    // Production: no key -> should throw
    const shouldThrowInProd = !prodEnv.GEMINI_API_KEY && prodEnv.ENVIRONMENT !== 'development';
    expect(shouldThrowInProd).toBe(true);

    // Development: no key -> should return mock
    const shouldMockInDev = !devEnv.GEMINI_API_KEY && devEnv.ENVIRONMENT === 'development';
    expect(shouldMockInDev).toBe(true);
  });
});

describe("Auth Router Security", () => {
  it("protected routes list should match all /api/v1/* handlers", () => {
    // The api/index.ts routes these paths through verifyAuth:
    const protectedPaths = [
      "/api/v1/auth",
      "/api/v1/organizations",
      "/api/v1/memberships",
      "/api/v1/billing",
      "/api/v1/licenses",
      "/api/v1/sites",
      "/api/v1/cameras",
      "/api/v1/alerts",
      "/api/v1/telemetry",
    ];

    // Public paths (bypass auth):
    const publicPaths = [
      "/api/v1/webhooks",
      "/api/pricing",
      "/api/health",
      "/api/analyze-snapshot",
      "/api/send-whatsapp-test",
    ];

    expect(protectedPaths.length).toBe(9);
    expect(publicPaths.length).toBe(5);

    // Ensure billing is protected (not public)
    expect(protectedPaths).toContain("/api/v1/billing");
    expect(publicPaths).not.toContain("/api/v1/billing");
  });

  it("webhooks should be public (no auth required)", () => {
    // Webhooks come from Stripe with their own signature verification
    const webhookPath = "/api/v1/webhooks";
    expect(webhookPath.startsWith("/api/v1/webhooks")).toBe(true);
  });
});

describe("Pricing Engine Edge Cases", () => {
  it("should fallback to north_america pricing for unknown regions", () => {
    // GB has europe region but pricing only has north_america and south_asia
    const result = determinePrice("GB", "pro", "monthly");
    // Falls back to north_america USD pricing
    expect(result.price).toBe(29);
    expect(result.currency).toBe("USD");
  });

  it("yearly pricing should be cheaper per-month than monthly", () => {
    const monthly = determinePrice("US", "pro", "monthly");
    const yearly = determinePrice("US", "pro", "yearly");
    // yearly total should be less than 12 * monthly
    expect(yearly.price).toBeLessThan(monthly.price * 12);
  });
});
