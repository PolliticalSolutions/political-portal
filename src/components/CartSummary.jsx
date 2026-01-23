import Button from "./Button.jsx";
import Card from "./Card.jsx";
import { CLUSTER_SIZES } from "../data/subscriptions.js";
import { formatCurrency } from "../utils/formatters.js";

const renderMetaLine = (label, value) => {
  if (!value) return null;
  return (
    <div className="cart-meta">
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );
};

const resolveClusterLabel = (clusterSizeId) =>
  CLUSTER_SIZES.find((size) => size.id === clusterSizeId)?.label || "";

export default function CartSummary({ items, totals, onRemove }) {
  return (
    <Card className="cart-summary" title="Cart summary">
      {items.length === 0 ? (
        <p className="muted">No items yet. Add a subscription or product to start your basket.</p>
      ) : (
        <div className="cart-list" role="list" data-testid="cart-items">
          {items.map((item) => (
            <div key={item.lineId} className="cart-item" role="listitem">
              <div className="cart-item-header">
                <div>
                  <div style={{ fontWeight: 700 }}>{item.name}</div>
                  {item.category === "subscription" && (
                    <div className="pill" style={{ marginTop: 6 }}>
                      {item.billingPeriod === "annual" ? "Renews annually" : "Renews monthly"}
                    </div>
                  )}
                  {item.category === "subscription" && item.complianceLabel && (
                    <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                      {item.complianceLabel}
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: 700 }}>{formatCurrency(item.unitPrice * item.quantity)}</div>
              </div>
              {item.category === "subscription"
                ? renderMetaLine("Area", item.metadata?.areaName)
                : renderMetaLine("Association", item.metadata?.association)}
              {item.category !== "subscription" && renderMetaLine("Constituency", item.metadata?.constituency)}
              {item.category === "subscription" && item.metadata?.clusterSize
                ? renderMetaLine("Cluster size", resolveClusterLabel(item.metadata.clusterSize))
                : null}
              {item.category === "subscription" && item.invoiceDescription && (
                <details className="cart-invoice">
                  <summary className="muted">Invoice description</summary>
                  <div className="muted">{item.invoiceDescription}</div>
                </details>
              )}
              <div className="cart-item-footer">
                <span className="muted">Qty {item.quantity}</span>
                <Button variant="ghost" onClick={() => onRemove(item.lineId)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="cart-total">
        <span className="muted">Subtotal</span>
        <span style={{ fontWeight: 800 }}>{formatCurrency(totals.subtotal)}</span>
      </div>
    </Card>
  );
}
