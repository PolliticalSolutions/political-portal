import { describe, expect, it } from "vitest";
import {
  calculateAssociationSubscriptionExVatPence,
  calculateAssociationSubscriptionPricing,
  formatPenceToPounds,
} from "./subscriptionPricing.js";

describe("subscriptionPricing", () => {
  it("calculates the first constituency at 500 pounds ex VAT", () => {
    expect(calculateAssociationSubscriptionExVatPence(1)).toBe(50000);
  });

  it("adds 250 pounds ex VAT per extra constituency", () => {
    expect(calculateAssociationSubscriptionExVatPence(4)).toBe(125000);
  });

  it("returns VAT-inclusive pricing", () => {
    expect(calculateAssociationSubscriptionPricing(2)).toEqual({
      constituencyCount: 2,
      amountExVatPence: 75000,
      vatPence: 15000,
      amountIncVatPence: 90000,
      vatRate: 0.2,
    });
  });

  it("formats pence for UI display", () => {
    expect(formatPenceToPounds(90000)).toBe("900.00");
  });
});

