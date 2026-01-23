import {
  SUBSCRIPTION_COMPLIANCE,
  getClusterSizeById,
  getSubscriptionUnitPrice,
  getTierById,
} from "./subscriptions.js";

export const SUBSCRIPTION_METADATA_KEYS = new Set([
  "areaId",
  "areaName",
  "tier",
  "billingPeriod",
  "clusterSize",
]);

export const sanitizeSubscriptionMetadata = (metadata) => {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => SUBSCRIPTION_METADATA_KEYS.has(key))
  );
};

export const PRODUCT_CATALOG = {
  "marked-register-entry": {
    id: "marked-register-entry",
    name: "Marked Register Entry",
    price: 65,
    billingPeriod: "one-off",
    category: "data",
  },
};

export const createCatalogLineItem = (productId, { quantity = 1, metadata = {} } = {}) => {
  const product = PRODUCT_CATALOG[productId];
  if (!product) return null;
  return {
    productId: product.id,
    name: product.name,
    unitPrice: product.price,
    billingPeriod: product.billingPeriod,
    category: product.category,
    quantity,
    metadata,
  };
};

export const createSubscriptionLineItem = ({
  tierId,
  billingPeriod,
  clusterSizeId,
  metadata = {},
}) => {
  const tier = getTierById(tierId);
  if (!tier) return null;
  const unitPrice = getSubscriptionUnitPrice({ tierId, billingPeriod, clusterSizeId });
  const clusterSize = tier.id === "federation" ? getClusterSizeById(clusterSizeId) : null;
  const areaId = metadata.constituency || metadata.association || metadata.areaId || "";
  const baseMetadata = sanitizeSubscriptionMetadata({
    areaId,
    areaName: metadata.areaName || areaId,
    tier: tier.id,
    billingPeriod,
    clusterSize: clusterSize?.id || "",
  });
  return {
    productId: `subscription-${tier.id}`,
    name: `${tier.name} subscription`,
    unitPrice,
    billingPeriod,
    category: "subscription",
    quantity: 1,
    complianceLabel: SUBSCRIPTION_COMPLIANCE.complianceLabel,
    invoiceDescription: SUBSCRIPTION_COMPLIANCE.invoiceDescription,
    metadata: baseMetadata,
  };
};
