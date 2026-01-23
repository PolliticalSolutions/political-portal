import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import { useCart } from "../cart/cartStore.jsx";
import {
  buildQuoteRequestPayload,
  createIdempotencyKey,
  storeQuoteRequest,
} from "../data/quoteRequest.js";
import { getXeroStatus, postQuoteRequest } from "../lib/quoteApi.js";
import { formatCurrency } from "../utils/formatters.js";
import "./Checkout.css";

export default function Checkout() {
  const navigate = useNavigate();
  const { items, totals, clearCart } = useCart();
  const hasSubscriptions = useMemo(
    () => items.some((item) => item.category === "subscription"),
    [items]
  );
  const idempotencyRef = useRef(createIdempotencyKey());
  const [xeroStatus, setXeroStatus] = useState({
    loading: true,
    connected: false,
    tenantName: "",
  });

  const [formValues, setFormValues] = useState({
    name: "",
    email: "",
    phone: "",
    organisation: "",
    role: "",
    notes: "",
    complianceAcknowledged: false,
    createInvoice: false,
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ submitting: false, error: "" });

  useEffect(() => {
    let isMounted = true;
    const loadStatus = async () => {
      try {
        const result = await getXeroStatus();
        if (!isMounted) return;
        const connected = Boolean(result?.connected);
        setXeroStatus({
          loading: false,
          connected,
          tenantName: result?.tenantName || "",
        });
        if (connected) {
          setFormValues((prev) => ({ ...prev, createInvoice: true }));
        }
      } catch (error) {
        if (!isMounted) return;
        setXeroStatus({ loading: false, connected: false, tenantName: "" });
      }
    };
    loadStatus();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!formValues.name.trim()) nextErrors.name = "Full name is required.";
    if (!formValues.email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!formValues.email.includes("@")) {
      nextErrors.email = "Enter a valid email.";
    }
    if (!formValues.organisation.trim()) nextErrors.organisation = "Organisation is required.";
    if (!formValues.role.trim()) nextErrors.role = "Role is required.";
    if (formValues.notes.length > 1000) nextErrors.notes = "Notes are too long.";
    if (hasSubscriptions && !formValues.complianceAcknowledged) {
      nextErrors.complianceAcknowledged = "Please confirm the compliance acknowledgement.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (items.length === 0) {
      setStatus({ submitting: false, error: "Your cart is empty." });
      return;
    }
    if (!validate()) return;
    setStatus({ submitting: true, error: "" });

    const payload = buildQuoteRequestPayload({
      cartItems: items,
      customer: {
        name: formValues.name.trim(),
        email: formValues.email.trim(),
        phone: formValues.phone.trim(),
        organisation: formValues.organisation.trim(),
        role: formValues.role.trim(),
      },
      notes: formValues.notes.trim(),
      complianceAcknowledged: formValues.complianceAcknowledged,
      createInvoice: xeroStatus.connected && formValues.createInvoice,
      idempotencyKey: idempotencyRef.current,
    });

    try {
      const result = await postQuoteRequest(payload);
      if (!result?.ok) {
        throw new Error("Quote request failed.");
      }
      const storedRequest = {
        ...payload,
        referenceId: result.referenceId,
        createdAt: result.createdAt || new Date().toISOString(),
        items: result.items || payload.lineItems,
        totals: result.totals || payload.totals,
        compliance: result.compliance || { hasSubscriptions, statement: "" },
        xero: result.xero || { connected: false },
      };
      storeQuoteRequest(storedRequest);
      clearCart();
      navigate(`/checkout/confirmation?ref=${encodeURIComponent(result.referenceId)}`);
      return;
    } catch (error) {
      setStatus({
        submitting: false,
        error: "Unable to submit right now. Please try again shortly.",
      });
    }
  };

  if (items.length === 0) {
    return (
      <div className="page stack">
        <Card>
          <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Checkout</h1>
          <p className="muted">Your cart is empty. Add products before requesting a quote.</p>
          <Button as={Link} to="/subscriptions" variant="primary" style={{ marginTop: 16 }}>
            View subscriptions
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="page stack checkout-page">
      <Card>
        <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Request a quote</h1>
        <p className="muted">
          Provide your details and we will prepare a quote or invoice request. Subscriptions are
          capability-focused and election-specific work is contracted separately.
        </p>
      </Card>

      <Card title="Order summary">
        <div className="checkout-summary">
          {items.map((item) => (
            <div key={item.lineId} className="checkout-summary-row">
              <div>
                <div style={{ fontWeight: 700 }}>{item.name}</div>
                {item.category === "subscription" && (
                  <div className="muted">{item.billingPeriod === "annual" ? "Annual" : "Monthly"} billing</div>
                )}
                <div className="muted">Qty {item.quantity}</div>
              </div>
              <div style={{ fontWeight: 700 }}>
                {formatCurrency(item.unitPrice * item.quantity)}
              </div>
            </div>
          ))}
          <div className="checkout-summary-total">
            <span className="muted">Subscription subtotal</span>
            <span style={{ fontWeight: 700 }}>{formatCurrency(totals.subscriptionSubtotal)}</span>
          </div>
          <div className="checkout-summary-total">
            <span className="muted">One-off subtotal</span>
            <span style={{ fontWeight: 700 }}>{formatCurrency(totals.oneOffSubtotal)}</span>
          </div>
          <div className="checkout-summary-total">
            <span className="muted">Total</span>
            <span style={{ fontWeight: 700 }}>{formatCurrency(totals.subtotal)}</span>
          </div>
        </div>
      </Card>

      <Card>
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span>Full name *</span>
            <input
              className="input"
              name="name"
              value={formValues.name}
              onChange={handleChange}
            />
            {errors.name && <span className="helper">{errors.name}</span>}
          </label>
          <label className="field">
            <span>Email *</span>
            <input
              className="input"
              name="email"
              type="email"
              value={formValues.email}
              onChange={handleChange}
            />
            {errors.email && <span className="helper">{errors.email}</span>}
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              className="input"
              name="phone"
              value={formValues.phone}
              onChange={handleChange}
            />
          </label>
          <label className="field">
            <span>Organisation / Association *</span>
            <input
              className="input"
              name="organisation"
              value={formValues.organisation}
              onChange={handleChange}
            />
            {errors.organisation && <span className="helper">{errors.organisation}</span>}
          </label>
          <label className="field">
            <span>Role *</span>
            <select className="input" name="role" value={formValues.role} onChange={handleChange}>
              <option value="">Select your role</option>
              <option value="Chair">Chair</option>
              <option value="Agent">Agent</option>
              <option value="Treasurer">Treasurer</option>
              <option value="Volunteer">Volunteer</option>
              <option value="Other">Other</option>
            </select>
            {errors.role && <span className="helper">{errors.role}</span>}
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea
              className="input"
              name="notes"
              rows={4}
              value={formValues.notes}
              onChange={handleChange}
            />
            {errors.notes && <span className="helper">{errors.notes}</span>}
          </label>
          {!xeroStatus.loading && xeroStatus.connected && (
            <label className="field">
              <span style={{ fontWeight: 600 }}>Invoice option</span>
              <label className="muted" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  name="createInvoice"
                  checked={formValues.createInvoice}
                  onChange={handleChange}
                />
                Create invoice in Xero now{xeroStatus.tenantName ? ` (${xeroStatus.tenantName})` : ""}.
              </label>
            </label>
          )}
          {hasSubscriptions && (
            <label className="field">
              <span style={{ fontWeight: 600 }}>Compliance acknowledgement *</span>
              <label className="muted" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  name="complianceAcknowledged"
                  checked={formValues.complianceAcknowledged}
                  onChange={handleChange}
                />
                I understand election-specific services are separate, may be declarable, and are contracted
                independently.
              </label>
              {errors.complianceAcknowledged && (
                <span className="helper">{errors.complianceAcknowledged}</span>
              )}
            </label>
          )}
          {status.error && <div className="status error">{status.error}</div>}
          <div className="checkout-actions">
            <Button type="submit" variant="primary" loading={status.submitting}>
              Submit request
            </Button>
            <Button as={Link} to="/cart" variant="ghost">
              Back to cart
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
