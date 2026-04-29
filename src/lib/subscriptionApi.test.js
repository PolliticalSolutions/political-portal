import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase.js", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "./supabase.js";
import {
  createSubscriptionPaymentIntent,
  getUserSubscriptionStatus,
  listAssociationsWithPricing,
  requestSubscriptionInvoice,
} from "./subscriptionApi.js";

function mockQuery(result) {
  const query = {
    select: () => query,
    eq: () => query,
    limit: () => Promise.resolve(result),
    order: () => query,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
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

  it("returns none when a user has no subscription rows", async () => {
    supabase.from.mockReturnValue(mockQuery({ data: [], error: null }));

    await expect(getUserSubscriptionStatus("user-sub-1")).resolves.toBe("none");
  });

  it("prioritises active and trialing subscription statuses", async () => {
    supabase.from.mockReturnValue(
      mockQuery({
        data: [
          { status: "cancelled", admin_override_active: false },
          { status: "trialing", admin_override_active: false },
        ],
        error: null,
      })
    );

    await expect(getUserSubscriptionStatus("user-sub-1")).resolves.toBe("trialing");
  });

  it("treats admin override as active", async () => {
    supabase.from.mockReturnValue(
      mockQuery({
        data: [{ status: "cancelled", admin_override_active: true }],
        error: null,
      })
    );

    await expect(getUserSubscriptionStatus("user-sub-1")).resolves.toBe("active");
  });
});
