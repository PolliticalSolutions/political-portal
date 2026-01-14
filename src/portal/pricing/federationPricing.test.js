import { describe, expect, it } from "vitest";
import { calculateFederationPricing } from "./federationPricing.js";

describe("calculateFederationPricing", () => {
  it("calculates totals for 1 constituency", () => {
    const result = calculateFederationPricing(1);

    expect(result.netTotal).toBe(500);
    expect(result.vatTotal).toBe(100);
    expect(result.grossTotal).toBe(600);
  });

  it("calculates totals for 2 constituencies", () => {
    const result = calculateFederationPricing(2);

    expect(result.netTotal).toBe(750);
    expect(result.vatTotal).toBe(150);
    expect(result.grossTotal).toBe(900);
  });

  it("calculates totals for 3 constituencies", () => {
    const result = calculateFederationPricing(3);

    expect(result.netTotal).toBe(1000);
    expect(result.vatTotal).toBe(200);
    expect(result.grossTotal).toBe(1200);
  });
});
