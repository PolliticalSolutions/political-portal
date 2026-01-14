import { describe, expect, it } from "vitest";
import { calcLine, calcTotals } from "./pricingCalc.js";

describe("pricingCalc", () => {
  it("calcLine computes vat and gross for net 100 at 20%", () => {
    const line = calcLine({ net: 100, vatRate: 0.2 });
    expect(line.vatAmount).toBe(20);
    expect(line.gross).toBe(120);
  });

  it("calcLine rounds vat and gross correctly", () => {
    const line = calcLine({ net: 0.99, vatRate: 0.2 });
    expect(line.vatAmount).toBe(0.2);
    expect(line.gross).toBe(1.19);
  });

  it("calcLine defaults vatRate when missing", () => {
    const line = calcLine({ net: 50 });
    expect(line.vatRate).toBe(0.2);
    expect(line.vatAmount).toBe(10);
    expect(line.gross).toBe(60);
  });

  it("calcTotals sums rounded line items correctly", () => {
    const lines = [
      { net: 99, vatRate: 0.2 },
      { net: 250, vatRate: 0.2 },
      { net: 49, vatRate: 0.2 },
    ];
    const totals = calcTotals(lines);
    expect(totals.netTotal).toBe(398);
    expect(totals.vatTotal).toBe(79.6);
    expect(totals.grossTotal).toBe(477.6);
  });
});
