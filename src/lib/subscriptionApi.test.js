import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabaseClient.js", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "./supabaseClient.js";
import {
  createSubscriptionPaymentIntent,
  listAssociationsWithPricing,
  requestSubscriptionInvoice,
} from "./subscriptionApi.js";

function mockQuery(result) {
  const query = {
    select: () => query,
    order: () => Promise.resolve(result),
  };
  return query;
}

describe("subscriptionApi", () => {
  beforeEach(() => {
    supabase.from.mockReset();
    vi.unstubAllEnvs();
    global.fetch = vi.fn();
  });

  it("returns database-backed association pricing rows when available", async () => {
    supabase.from.mockReturnValue(
      mockQuery({
        data: [{ id: "assoc-1", name: "Test Association", constituency_count: 2 }],
        error: null,
      })
    );

    const rows = await listAssociationsWithPricing();
    expect(rows[0]).toMatchObject({
      id: "assoc-1",
      name: "Test Association",
      evidence_status: "database",
    });
  });

  it("falls back to generated association pricing when the view is unavailable", async () => {
    supabase.from.mockReturnValue(mockQuery({ data: null, error: { message: "missing view" } }));

    const rows = await listAssociationsWithPricing();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("amount_inc_vat_pence");
    expect(rows[0].evidence_status).toBe("fallback");
  });

  it("posts payment-intent requests to the Stripe API", async () => {
    vi.stubEnv("VITE_STRIPE_API_URL", "https://api.example.com/stripe");
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ client_secret: "pi_secret" }),
    });

    const result = await createSubscriptionPaymentIntent({ association_id: "assoc-1" });
    expect(result.client_secret).toBe("pi_secret");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.com/stripe/create-payment-intent",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("posts invoice requests to the Stripe API", async () => {
    vi.stubEnv("VITE_STRIPE_API_URL", "https://api.example.com/stripe");
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ invoice_url: "https://invoice.example.com" }),
    });

    const result = await requestSubscriptionInvoice({ association_id: "assoc-1" });
    expect(result.invoice_url).toContain("invoice");
  });
});
