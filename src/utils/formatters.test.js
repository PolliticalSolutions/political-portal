import { describe, expect, it } from "vitest";
import { formatCurrency } from "./formatters.js";

describe("formatCurrency", () => {
  it("formats a whole number as GBP with pence", () => {
    const result = formatCurrency(10);
    expect(result).toContain("10.00");
    expect(result).toMatch(/£/);
  });

  it("formats a decimal value correctly", () => {
    const result = formatCurrency(9.99);
    expect(result).toContain("9.99");
  });

  it("formats zero as £0.00", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0.00");
  });

  it("formats a large value without grouping separator error", () => {
    const result = formatCurrency(1000);
    expect(result).toContain("1,000.00");
  });

  it("rounds to two decimal places", () => {
    const result = formatCurrency(1.005);
    // Intl.NumberFormat rounds 1.005 to 1.00 or 1.01 depending on IEEE 754;
    // either is acceptable — just check it is formatted to 2 d.p.
    expect(result).toMatch(/\d+\.\d{2}/);
  });
});
