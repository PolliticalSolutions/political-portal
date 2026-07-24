import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AssociationSelector from "../components/AssociationSelector.jsx";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import CartSummary from "../components/CartSummary.jsx";
import "./Subscriptions.css";
import associations from "../data/associations.json";
import { createCatalogLineItem, createSubscriptionLineItem } from "../data/products.js";
import {
  CIRCUMSTANCES,
  CLUSTER_SIZES,
  SUBSCRIPTION_CONFIG,
  SUBSCRIPTION_TIERS,
  getRecommendedTierId,
  getSubscriptionUnitPrice,
  getTierById,
} from "../data/subscriptions.js";
import { useCart } from "../cart/cartStore.jsx";
import { readAssociationSelection, saveAssociationSelection } from "../utils/associationStorage.js";
import { formatCurrency } from "../utils/formatters.js";

const resolveInitialSelection = (searchParams, storedSelection) => {
  const associationParam = searchParams.get("association")?.trim();
  const constituencyParam = searchParams.get("constituency")?.trim();

  let association = storedSelection?.association ?? "";
  let constituency = storedSelection?.constituency ?? "";

  if (constituencyParam && associations.byConstituency[constituencyParam]) {
    association = associations.byConstituency[constituencyParam];
    constituency = constituencyParam;
  } else if (associationParam && associations.byAssociation[associationParam]) {
    association = associationParam;
    constituency = "";
  }

  const constituencyCount = association ? (associations.byAssociation[association] ?? []).length : 0;

  return {
    association,
    constituency,
    constituencyCount,
  };
};

const formatTierPrice = (tier, billingPeriod, clusterSizeId) => {
  if (tier.id === "federation") {
    if (billingPeriod === "annual") {
      const annualFrom = getSubscriptionUnitPrice({
        tierId: tier.id,
        billingPeriod,
        clusterSizeId: CLUSTER_SIZES[0].id,
      });
      const annualTo = getSubscriptionUnitPrice({
        tierId: tier.id,
        billingPeriod,
        clusterSizeId: CLUSTER_SIZES[CLUSTER_SIZES.length - 1].id,
      });
      const monthlyFrom = annualFrom / 12;
      const monthlyTo = annualTo / 12;
      return `From ${formatCurrency(monthlyFrom)}/mo (billed annually)`;
    }
    return `From ${formatCurrency(tier.priceMonthlyFrom)}/mo`;
  }

  const monthly = getSubscriptionUnitPrice({
    tierId: tier.id,
    billingPeriod: "monthly",
    clusterSizeId,
  });

  if (billingPeriod === "annual") {
    const annual = getSubscriptionUnitPrice({
      tierId: tier.id,
      billingPeriod,
      clusterSizeId,
    });
    return `${formatCurrency(annual / 12)}/mo (billed annually)`;
  }

  return `${formatCurrency(monthly)}/mo`;
};

export default function Subscriptions() {
  const { items, addItem, removeItem, totals, updateSubscriptionBilling } = useCart();
  const [searchParams] = useSearchParams();
  const storedSelection = useMemo(() => readAssociationSelection(), []);
  const initialSelection = useMemo(
    () => resolveInitialSelection(searchParams, storedSelection),
    [searchParams, storedSelection]
  );

  const [selection, setSelection] = useState(initialSelection);
  const [selectedCircumstanceId, setSelectedCircumstanceId] = useState("");
  const [selectedTierId, setSelectedTierId] = useState("");
  const [billingPeriod, setBillingPeriod] = useState("monthly");
  const [clusterSizeId, setClusterSizeId] = useState(CLUSTER_SIZES[0].id);

  useEffect(() => {
    setSelection(initialSelection);
  }, [initialSelection]);

  useEffect(() => {
    if (selection.association || selection.constituency) {
      saveAssociationSelection(selection);
    }
  }, [selection]);

  const recommendedTierId = getRecommendedTierId(selectedCircumstanceId);
  const resolvedTierId = selectedTierId || recommendedTierId;
  const selectedTier = resolvedTierId ? getTierById(resolvedTierId) : null;
  const canAdd = Boolean(resolvedTierId && (selection.association || selection.constituency));

  const handleCircumstanceSelect = (circumstanceId) => {
    setSelectedCircumstanceId(circumstanceId);
    const recommended = getRecommendedTierId(circumstanceId);
    if (recommended) {
      setSelectedTierId(recommended);
    }
  };

  const handleAddSubscription = () => {
    if (!resolvedTierId) return;
    const lineItem = createSubscriptionLineItem({
      tierId: resolvedTierId,
      billingPeriod,
      clusterSizeId,
      metadata: selection,
    });
    if (!lineItem) return;
    addItem(lineItem);
  };

  const handleAddMarkedRegister = () => {
    const lineItem = createCatalogLineItem("marked-register-entry", { metadata: selection });
    if (!lineItem) return;
    addItem(lineItem);
  };

  return (
    <div className="page stack">
      <section className="hero subscription-hero">
        <Badge tone="accent">Subscriptions</Badge>
        <div>
          <h1>Association subscriptions for campaign operations</h1>
          <p>
            Build operational readiness with clear workflows, consistent data processing, and insight packs.
            Select the association or constituency first, then pick the tier that fits your circumstances.
          </p>
        </div>
      </section>

      <div className="subscription-layout">
        <div className="subscription-main">
          <Card title="Select your association / constituency area">
            <AssociationSelector value={selection} onChange={setSelection} />
          </Card>

          <Card title="Find your fit">
            <div className="circumstance-grid">
              {CIRCUMSTANCES.map((option) => {
                const isSelected = option.id === selectedCircumstanceId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`circumstance-card${isSelected ? " active" : ""}`}
                    onClick={() => handleCircumstanceSelect(option.id)}
                    aria-pressed={isSelected}
                  >
                    <div style={{ fontWeight: 700 }}>{option.label}</div>
                    <div className="muted">{option.helper}</div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card
            title="Subscription tiers"
            action={
              SUBSCRIPTION_CONFIG.annualBillingEnabled ? (
                <label className="pill">
                  <input
                    type="checkbox"
                    checked={billingPeriod === "annual"}
                    onChange={(event) => {
                      const nextPeriod = event.target.checked ? "annual" : "monthly";
                      setBillingPeriod(nextPeriod);
                      updateSubscriptionBilling(nextPeriod);
                    }}
                    style={{ margin: 0 }}
                  />
                  Pay annually and save {Math.round(SUBSCRIPTION_CONFIG.annualDiscountRate * 100)}%
                </label>
              ) : null
            }
          >
            <div className="tier-grid">
              {SUBSCRIPTION_TIERS.map((tier) => {
                const isRecommended = recommendedTierId === tier.id;
                const isSelected = resolvedTierId === tier.id;
                return (
                  <div
                    key={tier.id}
                    className={`tier-card${isRecommended ? " recommended" : ""}${
                      isSelected ? " selected" : ""
                    }`}
                    data-testid={`tier-card-${tier.id}`}
                    data-recommended={isRecommended || undefined}
                  >
                    <div className="tier-header">
                      <div>
                        <h3>{tier.name}</h3>
                        <div className="price-tag">{formatTierPrice(tier, billingPeriod, clusterSizeId)}</div>
                        {tier.id === "federation" && (
                          <div className="muted" style={{ fontSize: 13 }}>
                            Pricing varies by cluster size.
                          </div>
                        )}
                      </div>
                      {isRecommended && <span className="badge accent">Recommended</span>}
                    </div>
                    <p className="muted">{tier.bestFor}</p>
                    <ul>
                      {tier.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    {tier.id === "federation" && (
                      <label className="field" style={{ marginTop: 12 }}>
                        <span className="muted">Cluster size</span>
                        <select
                          className="input"
                          value={clusterSizeId}
                          onChange={(event) => setClusterSizeId(event.target.value)}
                        >
                          {CLUSTER_SIZES.map((size) => (
                            <option key={size.id} value={size.id}>
                              {size.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <Button
                      variant={isSelected ? "secondary" : "primary"}
                      onClick={() => setSelectedTierId(tier.id)}
                    >
                      {isSelected ? "Selected tier" : "Select tier"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Compare what is included">
            <div className="comparison-table">
              <div className="comparison-row comparison-header">
                <div />
                {SUBSCRIPTION_TIERS.map((tier) => (
                  <div key={tier.id}>{tier.name}</div>
                ))}
              </div>
              {[
                {
                  label: "Readiness playbooks",
                  values: ["Core", "Enhanced", "Advanced", "Cluster-level"],
                },
                {
                  label: "Insight reporting",
                  values: ["Monthly", "Monthly + review", "Monthly + sprint", "Multi-association"],
                },
                {
                  label: "Support cadence",
                  values: ["Email", "Quarterly", "Priority", "Dedicated lead"],
                },
              ].map((row) => (
                <div key={row.label} className="comparison-row">
                  <div className="muted">{row.label}</div>
                  {row.values.map((value, index) => (
                    <div key={`${row.label}-${index}`}>{value}</div>
                  ))}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Compliance note">
            <p className="muted">
              Subscriptions focus on capability and readiness. They do not include election-specific delivery.
              Election-specific work is contracted separately at commercial rates and must be declared by the
              client where required.
            </p>
          </Card>

          <Card title="Marked Register Processing">
            <div className="stack" style={{ gap: 12 }}>
              <div className="subtle-row">
                <div>
                  <div style={{ fontWeight: 700 }}>Marked Register Processing</div>
                  <div className="muted">
                    One-off marked register processing for PDF, CSV, or XLSX inputs.
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{formatCurrency(65)}</div>
              </div>
              <Button variant="secondary" onClick={handleAddMarkedRegister}>
                Add Marked Register Processing
              </Button>
            </div>
          </Card>

          <Card className="cta-card">
            <div className="cta-row">
              <div>
                <div style={{ fontWeight: 700 }}>
                  {selectedTier ? `${selectedTier.name} Association Subscription` : "Select a tier to continue"}
                </div>
                <div className="muted">
                  {selection.association || selection.constituency
                    ? `${selection.association || selection.constituency}`
                    : "Select an association or constituency to enable checkout."}
                </div>
              </div>
              <div className="cta-actions">
                <Button variant="primary" onClick={handleAddSubscription} disabled={!canAdd}>
                  Add to cart
                </Button>
                <Button as={Link} to="/" variant="ghost">
                  Continue shopping
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="subscription-aside">
          <CartSummary items={items} totals={totals} onRemove={removeItem} />
        </div>
      </div>
    </div>
  );
}
