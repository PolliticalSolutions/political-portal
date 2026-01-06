import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import { calculatePrice } from "../pricing/pricingEngine.js";

const formatCurrency = (value) => `£${value.toFixed(2)}`;

export default function Pricing() {
  const [federationSupportEnabled, setFederationSupportEnabled] = useState(true);
  const [federations, setFederations] = useState(1);

  const pricing = useMemo(
    () => calculatePrice({ federations, federationSupportEnabled }),
    [federations, federationSupportEnabled]
  );

  const handleFederationsChange = (event) => {
    const next = Number(event.target.value);
    setFederations(Number.isFinite(next) ? next : 0);
  };

  return (
    <div className="page stack">
      <Card>
        <div className="card-header">
          <div>
            <Badge tone="accent">Pricing</Badge>
            <h1 style={{ margin: "6px 0 4px", fontSize: 22 }}>Pricing model preview</h1>
            <p className="muted">Rough model for federation add-ons.</p>
          </div>
          <Button as={Link} to="/portal" variant="ghost">
            Back to portal
          </Button>
        </div>
      </Card>

      <Card title="Inputs">
        <div className="stack" style={{ gap: 12 }}>
          <label className="muted" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={federationSupportEnabled}
              onChange={(e) => setFederationSupportEnabled(e.target.checked)}
            />
            Federation support
          </label>
          <label className="muted" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Number of federations</span>
            <input
              type="number"
              min="0"
              value={federations}
              onChange={handleFederationsChange}
              style={{ width: 140 }}
            />
          </label>
        </div>
      </Card>

      <Card title="Breakdown">
        {pricing.items.length === 0 ? (
          <p className="muted">No add-ons selected.</p>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {pricing.items.map((item) => (
              <div
                key={item.id}
                className="card"
                style={{
                  border: "1px solid #E5E7EB",
                  padding: 12,
                  borderRadius: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.label}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      Qty {item.quantity} @ {formatCurrency(item.unitPrice)}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700 }}>{formatCurrency(item.total)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="stack" style={{ marginTop: 16, gap: 6 }}>
          <div className="muted" style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Total (ex VAT)</span>
            <span>{formatCurrency(pricing.totals.exVat)}</span>
          </div>
          <div className="muted" style={{ display: "flex", justifyContent: "space-between" }}>
            <span>VAT @ 20%</span>
            <span>{formatCurrency(pricing.totals.vat)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
            <span>Total (inc VAT)</span>
            <span>{formatCurrency(pricing.totals.incVat)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
