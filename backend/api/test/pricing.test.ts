import { describe, it, expect } from "vitest";
import { determinePrice } from "../utils/pricing";

describe("Pricing Engine", () => {
  it("should return accurate USD pricing for US", () => {
    const { price, currency } = determinePrice("US", "pro", "monthly");
    expect(price).toBe(29);
    expect(currency).toBe("USD");
  });

  it("should return localized INR pricing for IN", () => {
    const { price, currency } = determinePrice("IN", "pro", "monthly");
    expect(price).toBe(2499);
    expect(currency).toBe("INR");
  });

  it("should apply discount for yearly plans in USD", () => {
    const { price, currency } = determinePrice("US", "pro", "yearly");
    expect(price).toBe(290);
    expect(currency).toBe("USD");
  });

  it("should apply discount for yearly plans in INR", () => {
    const { price, currency } = determinePrice("IN", "pro", "yearly");
    expect(price).toBe(24990);
    expect(currency).toBe("INR");
  });

  it("should throw error for unknown countries", () => {
    expect(() => determinePrice("XX", "pro", "monthly")).toThrow("Invalid country code");
  });
});
