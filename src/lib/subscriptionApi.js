import associations from "../data/associations.json";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import { supabase } from "./supabaseClient.js";
import { calculateAssociationSubscriptionPricing } from "./subscriptionPricing.js";

function getStripeApiBaseUrl() {
  const { stripeApiBaseUrl, apiBaseUrl } = getRuntimeConfig();
  return stripeApiBaseUrl || apiBaseUrl || "";
}

function buildFallbackAssociationRows() {
  return Object.entries(associations.byAssociation ?? {})
    .map(([name, constituencies], index) => {
      const pricing = calculateAssociationSubscriptionPricing(constituencies.length);
      return {
        id: `fallback-${index + 1}`,
        name,
        region: "",
        constituency_count: constituencies.length,
        constituency_names: constituencies,
        amount_ex_vat_pence: pricing.amountExVatPence,
        vat_pence: pricing.vatPence,
        amount_inc_vat_pence: pricing.amountIncVatPence,
        evidence_status: "fallback",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listAssociationsWithPricing() {
  const { data, error } = await supabase
    .from("associations_with_pricing")
    .select(
      "id, name, region, constituency_count, constituency_names, amount_ex_vat_pence, vat_pence, amount_inc_vat_pence"
    )
    .order("name");

  if (!error && data?.length) {
    return data.map((row) => ({
      ...row,
      evidence_status: "database",
    }));
  }

  return buildFallbackAssociationRows();
}

async function postStripeApi(path, payload) {
  const baseUrl = getStripeApiBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing Stripe API URL. Set VITE_STRIPE_API_URL or VITE_API_BASE_URL.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || "Stripe request failed.");
  }
  return result;
}

export function createSubscriptionPaymentIntent(payload) {
  return postStripeApi("/create-payment-intent", payload);
}

export function requestSubscriptionInvoice(payload) {
  return postStripeApi("/create-invoice", payload);
}

