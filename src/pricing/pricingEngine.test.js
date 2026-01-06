import { describe, expect, it } from "vitest";
import { calculatePrice } from "./pricingEngine.js";

describe("pricingEngine", () => {
  it("returns zero totals when federation support is disabled", () => {
    const result = calculatePrice({ federations: 2, federationSupportEnabled: false });

    expect(result.items).toHaveLength(0);
    expect(result.totals.exVat).toBe(0);
    expect(result.totals.vat).toBe(0);
    expect(result.totals.incVat).toBe(0);
  });

  it("includes setup and per-federation costs for a single federation", () => {
    const result = calculatePrice({ federations: 1, federationSupportEnabled: true });

    expect(result.items).toHaveLength(2);
    expect(result.totals.exVat).toBe(750);
    expect(result.totals.vat).toBe(150);
    expect(result.totals.incVat).toBe(900);
  });

  it("calculates totals for multiple federations", () => {
    const result = calculatePrice({ federations: 3, federationSupportEnabled: true });

    expect(result.items).toHaveLength(2);
    expect(result.totals.exVat).toBe(1250);
    expect(result.totals.vat).toBe(250);
    expect(result.totals.incVat).toBe(1500);
  });

  it("applies a custom VAT rate", () => {
    const result = calculatePrice({ federations: 1, federationSupportEnabled: true, vatRate: 0.1 });

    expect(result.totals.exVat).toBe(750);
    expect(result.totals.vat).toBe(75);
    expect(result.totals.incVat).toBe(825);
  });
});
