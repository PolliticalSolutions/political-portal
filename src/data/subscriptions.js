export const SUBSCRIPTION_CONFIG = {
  annualBillingEnabled: true,
  annualDiscountRate: 0.1,
};

export const SUBSCRIPTION_COMPLIANCE = {
  complianceLabel: "Capability subscription (not election-specific)",
  invoiceDescription:
    "Campaign Readiness Subscription – General capability, training, and planning resources. Not election-specific. Not provided for the purpose of promoting electoral success.",
};

export const CIRCUMSTANCES = [
  {
    id: "building",
    label: "Small association / building capability",
    helper: "Getting the foundations right with clear workflows.",
    recommendedTierId: "foundation",
  },
  {
    id: "growing",
    label: "Growing team",
    helper: "Scaling insight, handovers, and operational rhythm.",
    recommendedTierId: "growth",
  },
  {
    id: "advanced",
    label: "High-pressure association / advanced readiness",
    helper: "More complex needs and higher operational tempo.",
    recommendedTierId: "advanced",
  },
  {
    id: "federation",
    label: "Federation / multi-association cluster",
    helper: "Co-ordinating shared services across areas.",
    recommendedTierId: "federation",
  },
];

export const CLUSTER_SIZES = [
  { id: "1-5", label: "1-5 associations", priceMonthly: 750 },
  { id: "6-10", label: "6-10 associations", priceMonthly: 950 },
  { id: "11-20", label: "11-20 associations", priceMonthly: 1200 },
];

export const SUBSCRIPTION_TIERS = [
  {
    id: "foundation",
    name: "Foundation",
    priceMonthly: 50,
    bestFor: "Associations building core capability.",
    features: [
      "Core operations workspace",
      "Templates and readiness checklists",
      "Monthly insights pack",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 125,
    bestFor: "Teams formalising workflows and reporting.",
    features: [
      "Everything in Foundation",
      "Enhanced reporting pack",
      "Quarterly readiness review",
      "Team enablement session",
    ],
  },
  {
    id: "advanced",
    name: "Advanced",
    priceMonthly: 250,
    bestFor: "High-need areas with complex delivery.",
    features: [
      "Everything in Growth",
      "Scenario planning support",
      "Operational sprints",
      "Priority support",
    ],
  },
  {
    id: "federation",
    name: "Federation / Cluster",
    priceMonthlyFrom: 750,
    priceMonthlyTo: 1200,
    bestFor: "Federations and clustered associations.",
    features: [
      "Multi-association governance view",
      "Cluster-level insight dashboard",
      "Shared data processing support",
      "Dedicated success lead",
    ],
  },
];

export const getTierById = (tierId) => SUBSCRIPTION_TIERS.find((tier) => tier.id === tierId);

export const getCircumstanceById = (circumstanceId) =>
  CIRCUMSTANCES.find((option) => option.id === circumstanceId);

export const getClusterSizeById = (clusterSizeId) =>
  CLUSTER_SIZES.find((option) => option.id === clusterSizeId) || CLUSTER_SIZES[0];

export const getRecommendedTierId = (circumstanceId) =>
  getCircumstanceById(circumstanceId)?.recommendedTierId || "";

export const getMonthlyPriceForTier = (tierId, clusterSizeId) => {
  const tier = getTierById(tierId);
  if (!tier) return 0;
  if (tier.id === "federation") return getClusterSizeById(clusterSizeId).priceMonthly;
  return tier.priceMonthly || 0;
};

export const getAnnualPriceForMonthly = (monthlyPrice) => {
  const discount = SUBSCRIPTION_CONFIG.annualDiscountRate;
  return monthlyPrice * 12 * (1 - discount);
};

export const getSubscriptionUnitPrice = ({ tierId, billingPeriod, clusterSizeId }) => {
  const monthlyPrice = getMonthlyPriceForTier(tierId, clusterSizeId);
  if (billingPeriod === "annual") {
    return getAnnualPriceForMonthly(monthlyPrice);
  }
  return monthlyPrice;
};
