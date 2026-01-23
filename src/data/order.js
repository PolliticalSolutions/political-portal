import { PRODUCT_CATALOG } from "./products.js";
import { SUBSCRIPTION_COMPLIANCE, getSubscriptionUnitPrice } from "./subscriptions.js";
import { formatCurrency } from "../utils/formatters.js";

export const ORDER_STORAGE_KEY = "PS_LAST_ORDER_V1";

const resolveReferenceId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const resolveSubscriptionPricing = ({ tier, billingPeriod, clusterSize }) => {
  const unitPrice = getSubscriptionUnitPrice({
    tierId: tier,
    billingPeriod,
    clusterSizeId: clusterSize,
  });
  return {
    unitPrice,
    priceDisplay:
      billingPeriod === "annual"
        ? `${formatCurrency(unitPrice)} per year`
        : `${formatCurrency(unitPrice)} per month`,
  };
};

const resolveOneOffPricing = (productId) => {
  const product = PRODUCT_CATALOG[productId];
  if (!product) return { unitPrice: 0, priceDisplay: formatCurrency(0) };
  return { unitPrice: product.price, priceDisplay: formatCurrency(product.price) };
};

export const buildOrderFromCart = ({ cartItems, customer, notes, complianceAcknowledged }) => {
  const createdAt = new Date().toISOString();
  const referenceId = resolveReferenceId();

  const lineItems = cartItems.map((item) => {
    if (item.category === "subscription") {
      const pricing = resolveSubscriptionPricing({
        tier: item.metadata?.tier || "",
        billingPeriod: item.billingPeriod,
        clusterSize: item.metadata?.clusterSize || "",
      });
      return {
        sku: item.productId,
        name: item.name,
        category: "subscription",
        areaId: item.metadata?.areaId || "",
        areaName: item.metadata?.areaName || "",
        billingPeriod: item.billingPeriod,
        priceDisplay: pricing.priceDisplay,
        unitPrice: pricing.unitPrice,
        complianceLabel: SUBSCRIPTION_COMPLIANCE.complianceLabel,
        invoiceDescription: SUBSCRIPTION_COMPLIANCE.invoiceDescription,
      };
    }

    const pricing = resolveOneOffPricing(item.productId);
    return {
      sku: item.productId,
      name: item.name,
      category: "oneOff",
      areaId: item.metadata?.association || "",
      areaName: item.metadata?.association || "",
      billingPeriod: "one-off",
      priceDisplay: pricing.priceDisplay,
      unitPrice: pricing.unitPrice,
    };
  });

  const total = lineItems.reduce((sum, item) => sum + item.unitPrice, 0);

  return {
    referenceId,
    createdAt,
    customer,
    notes: notes || "",
    complianceAcknowledged: Boolean(complianceAcknowledged),
    lineItems,
    totals: {
      subtotal: total,
      subtotalDisplay: formatCurrency(total),
    },
  };
};

export const storeOrder = (order) => {
  if (typeof sessionStorage === "undefined") return;
  if (!order) return;
  sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
};

export const readStoredOrder = (referenceId) => {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ORDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (referenceId && parsed?.referenceId !== referenceId) return null;
    return parsed;
  } catch (error) {
    return null;
  }
};
