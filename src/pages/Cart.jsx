import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import { useCart } from "../cart/cartStore.jsx";
import { CLUSTER_SIZES } from "../data/subscriptions.js";
import { formatCurrency } from "../utils/formatters.js";
import "./Cart.css";

const resolveClusterLabel = (clusterSizeId) =>
  CLUSTER_SIZES.find((size) => size.id === clusterSizeId)?.label || "";

const resolveItemCategoryLabel = (item) => {
  if (item.category === "subscription") return "Association subscription";
  if (item.productId === "marked-register-entry") return "Marked Register Processing";
  return "One-off service";
};

const CartLineItem = ({ item, onRemove }) => (
  <div className="cart-line">
    <div className="cart-line-main">
      <div>
        <div style={{ fontWeight: 700 }}>{item.name}</div>
        <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
          {resolveItemCategoryLabel(item)}
        </div>
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
    <div className="cart-line-meta">
      {item.category === "subscription" ? (
        <>
          <div className="cart-meta">
            <span className="muted">Area</span>
            <span>{item.metadata?.areaName || "Not set"}</span>
          </div>
          {item.metadata?.clusterSize && (
            <div className="cart-meta">
              <span className="muted">Cluster size</span>
              <span>{resolveClusterLabel(item.metadata.clusterSize)}</span>
            </div>
          )}
          {item.invoiceDescription && (
            <details className="cart-invoice">
              <summary className="muted">Invoice description</summary>
              <div className="muted">{item.invoiceDescription}</div>
            </details>
          )}
        </>
      ) : (
        <>
          <div className="cart-meta">
            <span className="muted">Association</span>
            <span>{item.metadata?.association || "Not set"}</span>
          </div>
          {item.metadata?.constituency && (
            <div className="cart-meta">
              <span className="muted">Constituency</span>
              <span>{item.metadata.constituency}</span>
            </div>
          )}
        </>
      )}
    </div>
    <div className="cart-line-footer">
      <span className="muted">Qty {item.quantity}</span>
      <Button variant="ghost" onClick={() => onRemove(item.lineId)}>
        Remove
      </Button>
    </div>
  </div>
);

export default function Cart({ basePath = "" }) {
  const { items, removeItem, totals } = useCart();
  const subscriptionItems = items.filter((item) => item.category === "subscription");
  const oneOffItems = items.filter((item) => item.category !== "subscription");
  const prefix = basePath ? basePath.replace(/\/$/, "") : "";
  const buildPath = (path) => `${prefix}${path}`;

  if (items.length === 0) {
    return (
      <div className="page stack">
        <Card>
          <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Cart</h1>
          <p className="muted">
            Your cart is empty. Add an Association subscription or Marked Register Processing to continue.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
            <Button as={Link} to={buildPath("/subscriptions")} variant="primary">
              View subscriptions
            </Button>
            <Button as={Link} to="/enquire" variant="ghost">
              Browse other products
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page stack">
      <Card>
        <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Cart</h1>
        <p className="muted">
          This cart prepares a quote or invoice request. Association subscriptions set up access and recurring
          billing, while Marked Register Processing is requested here as a one-off service.
        </p>
      </Card>

      {subscriptionItems.length > 0 && (
        <Card title="Association subscriptions">
          <div className="cart-lines" role="list">
            {subscriptionItems.map((item) => (
              <CartLineItem key={item.lineId} item={item} onRemove={removeItem} />
            ))}
          </div>
        </Card>
      )}

      {oneOffItems.length > 0 && (
        <Card title="Marked Register Processing">
          <div className="cart-lines" role="list">
            {oneOffItems.map((item) => (
              <CartLineItem key={item.lineId} item={item} onRemove={removeItem} />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            {subscriptionItems.length > 0 && (
              <div className="muted">Subscription subtotal: {formatCurrency(totals.subscriptionSubtotal)}</div>
            )}
            {oneOffItems.length > 0 && (
              <div className="muted">One-off subtotal: {formatCurrency(totals.oneOffSubtotal)}</div>
            )}
            <div style={{ fontWeight: 700, marginTop: 6 }}>Total: {formatCurrency(totals.subtotal)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button as={Link} to={buildPath("/checkout")} variant="primary">
              Continue to quote request
            </Button>
            <Button as={Link} to={buildPath("/subscriptions")} variant="ghost">
              Continue shopping
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
