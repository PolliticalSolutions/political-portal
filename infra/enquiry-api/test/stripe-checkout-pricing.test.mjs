import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  calculateAssociationPricePence,
  buildAnnualCheckoutSessionParams,
} = require("../stripe-src/checkout-pricing.js");

describe("annual Stripe Checkout pricing", () => {
  it("calculates the approved annual price and VAT for one and two constituencies", () => {
    expect(calculateAssociationPricePence(1)).toEqual({
      exVatPence: 50000,
      vatPence: 10000,
      incVatPence: 60000,
    });
    expect(calculateAssociationPricePence(2)).toEqual({
      exVatPence: 75000,
      vatPence: 15000,
      incVatPence: 90000,
    });
  });

  it("charges the VAT-inclusive amount and renews once per year", () => {
    const params = buildAnnualCheckoutSessionParams({
      association: {
        id: "assoc-1",
        name: "Test Association",
        constituency_count: 2,
      },
      constituencyCount: 2,
      customerId: "cus-1",
      siteUrl: "https://www.politicalsolutions.uk/",
      cognitoSub: "user-1",
      userEmail: "alex@example.com",
    });

    expect(params.mode).toBe("subscription");
    expect(params.line_items).toHaveLength(1);
    expect(params.line_items[0]).toMatchObject({
      quantity: 1,
      price_data: {
        currency: "gbp",
        unit_amount: 90000,
        tax_behavior: "inclusive",
        recurring: { interval: "year" },
      },
    });
    expect(params.subscription_data.metadata).toMatchObject({
      association_id: "assoc-1",
      constituency_count: "2",
      amount_ex_vat_pence: "75000",
      vat_pence: "15000",
      amount_inc_vat_pence: "90000",
    });
  });

  it("preserves the existing success and cancellation destinations", () => {
    const params = buildAnnualCheckoutSessionParams({
      association: { id: "assoc-1", name: "Test Association", constituency_count: 1 },
      constituencyCount: 1,
      customerId: "cus-1",
      siteUrl: "https://www.politicalsolutions.uk/",
    });

    expect(params.success_url).toBe(
      "https://www.politicalsolutions.uk/portal?subscription=success"
    );
    expect(params.cancel_url).toBe(
      "https://www.politicalsolutions.uk/subscribe?cancelled=true"
    );
  });
});
