import { formatCurrency } from "../utils/formatters.js";

export const QUOTE_REQUEST_STORAGE_KEY = "PS_LAST_QUOTE_REQUEST_V1";

export const createIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `quote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

export const buildQuoteRequestPayload = ({
  cartItems,
  customer,
  notes,
  complianceAcknowledged,
  createInvoice,
  idempotencyKey,
}) => {
  const lineItems = (cartItems || []).map((item) => {
    if (item.category === "subscription") {
      const priceDisplay =
        item.billingPeriod === "annual"
          ? `${formatCurrency(item.unitPrice)} per year`
          : `${formatCurrency(item.unitPrice)} per month`;
      return {
        sku: item.productId,
        name: item.name,
        category: "subscription",
        quantity: item.quantity,
        areaId: item.metadata?.areaId || "",
        areaName: item.metadata?.areaName || "",
        billingPeriod: item.billingPeriod,
        complianceLabel: item.complianceLabel || "",
        invoiceDescription: item.invoiceDescription || "",
        unitPrice: item.unitPrice,
        priceDisplay,
      };
    }

    return {
      sku: item.productId,
      name: item.name,
      category: "oneOff",
      quantity: item.quantity,
      areaId: item.metadata?.association || "",
      areaName: item.metadata?.association || "",
      billingPeriod: "one-off",
      unitPrice: item.unitPrice,
      priceDisplay: formatCurrency(item.unitPrice),
    };
  });

  const totals = lineItems.reduce(
    (acc, item) => {
      const lineTotal = item.unitPrice * item.quantity;
      if (item.category === "subscription") {
        acc.subscriptionSubtotal += lineTotal;
      } else {
        acc.oneOffSubtotal += lineTotal;
      }
      acc.subtotal += lineTotal;
      return acc;
    },
    { oneOffSubtotal: 0, subscriptionSubtotal: 0, subtotal: 0 }
  );

  return {
    idempotencyKey,
    customer: {
      fullName: customer.name,
      email: customer.email,
      phone: customer.phone || "",
      organisation: customer.organisation,
      role: customer.role,
    },
    notes: notes || "",
    complianceAcknowledged: Boolean(complianceAcknowledged),
    createInvoice: Boolean(createInvoice),
    lineItems,
    totals,
  };
};

export const storeQuoteRequest = (payload) => {
  if (typeof sessionStorage === "undefined") return;
  if (!payload) return;
  sessionStorage.setItem(QUOTE_REQUEST_STORAGE_KEY, JSON.stringify(payload));
};

export const readStoredQuoteRequest = (referenceId) => {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(QUOTE_REQUEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (referenceId && parsed?.referenceId !== referenceId) return null;
    return parsed;
  } catch (error) {
    return null;
  }
};
