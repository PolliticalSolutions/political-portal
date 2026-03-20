import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import {
  createSubscriptionPaymentIntent,
  listAssociationsWithPricing,
  requestSubscriptionInvoice,
} from "../lib/subscriptionApi.js";
import { formatPenceToPounds } from "../lib/subscriptionPricing.js";

const stripePromise = (() => {
  const { stripePublishableKey } = getRuntimeConfig();
  return stripePublishableKey ? loadStripe(stripePublishableKey) : null;
})();

const initialCustomer = {
  name: "",
  email: "",
  organisationRole: "",
  phone: "",
};

function PriceSummary({ association }) {
  if (!association) return null;
  return (
    <div className="subscribe-pricing">
      <div className="subscribe-pricing__row">
        <span>Annual subscription ex VAT</span>
        <strong>£{formatPenceToPounds(association.amount_ex_vat_pence)}</strong>
      </div>
      <div className="subscribe-pricing__row">
        <span>VAT (20%)</span>
        <strong>£{formatPenceToPounds(association.vat_pence)}</strong>
      </div>
      <div className="subscribe-pricing__row subscribe-pricing__row--total">
        <span>Total due today</span>
        <strong>£{formatPenceToPounds(association.amount_inc_vat_pence)}</strong>
      </div>
    </div>
  );
}

function PaymentForm({ association, customer, onSuccess, disabledReason }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit =
    association &&
    customer.name.trim() &&
    customer.email.trim() &&
    stripe &&
    elements &&
    !disabledReason;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!association || !stripe || !elements) return;

    setSubmitting(true);
    setError("");

    try {
      const paymentIntent = await createSubscriptionPaymentIntent({
        association_id: association.id,
        user_email: customer.email.trim(),
        customer_name: customer.name.trim(),
        organisation_role: customer.organisationRole.trim(),
        phone: customer.phone.trim(),
      });

      const cardElement = elements.getElement(CardElement);
      const confirmation = await stripe.confirmCardPayment(paymentIntent.client_secret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: customer.name.trim(),
            email: customer.email.trim(),
            phone: customer.phone.trim(),
          },
        },
      });

      if (confirmation.error) {
        throw new Error(confirmation.error.message || "Payment confirmation failed.");
      }

      onSuccess({
        email: customer.email.trim(),
        association,
        paymentIntentId: confirmation.paymentIntent?.id ?? "",
      });
    } catch (nextError) {
      setError(nextError.message || "Unable to complete payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <div className="field">
        <span>Card details</span>
        <div className="subscribe-card-element">
          <CardElement
            options={{
              style: {
                base: {
                  color: "#1a2744",
                  fontFamily: "Georgia, serif",
                  fontSize: "16px",
                  "::placeholder": { color: "#64748b" },
                },
                invalid: { color: "#b91c1c" },
              },
            }}
          />
        </div>
      </div>
      {disabledReason && <div className="status warning">{disabledReason}</div>}
      {error && <div className="status error">{error}</div>}
      <Button type="submit" variant="primary" loading={submitting} disabled={!canSubmit || submitting}>
        Subscribe — £{association ? formatPenceToPounds(association.amount_inc_vat_pence) : "0.00"} today
      </Button>
    </form>
  );
}

export default function Subscribe() {
  const { stripePublishableKey, stripeApiBaseUrl, apiBaseUrl } = getRuntimeConfig();
  const [associations, setAssociations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedAssociationId, setSelectedAssociationId] = useState("");
  const [customer, setCustomer] = useState(initialCustomer);
  const [mode, setMode] = useState("card");
  const [invoiceState, setInvoiceState] = useState({ submitting: false, error: "", success: null });
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    let active = true;
    listAssociationsWithPricing()
      .then((rows) => {
        if (active) setAssociations(rows);
      })
      .catch((nextError) => {
        if (active) setError(nextError.message || "Failed to load associations.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredAssociations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return associations;
    return associations.filter((association) =>
      [association.name, association.region, ...(association.constituency_names ?? [])]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalized))
    );
  }, [associations, query]);

  const selectedAssociation = useMemo(
    () => associations.find((association) => association.id === selectedAssociationId) ?? null,
    [associations, selectedAssociationId]
  );

  const paymentDisabledReason =
    !stripePublishableKey || !(stripeApiBaseUrl || apiBaseUrl)
      ? "Stripe payment is unavailable until VITE_STRIPE_PUBLISHABLE_KEY and the Stripe API URL are configured."
      : "";

  const handleCustomerChange = (event) => {
    const { name, value } = event.target;
    setCustomer((current) => ({ ...current, [name]: value }));
  };

  const handleInvoiceRequest = async () => {
    if (!selectedAssociation) return;
    if (!customer.name.trim() || !customer.email.trim()) {
      setInvoiceState({
        submitting: false,
        error: "Name and email are required before requesting an invoice.",
        success: null,
      });
      return;
    }

    setInvoiceState({ submitting: true, error: "", success: null });
    try {
      const result = await requestSubscriptionInvoice({
        association_id: selectedAssociation.id,
        user_email: customer.email.trim(),
        customer_name: customer.name.trim(),
        organisation_role: customer.organisationRole.trim(),
        phone: customer.phone.trim(),
      });
      setInvoiceState({
        submitting: false,
        error: "",
        success: {
          email: customer.email.trim(),
          invoiceUrl: result.invoice_url ?? "",
        },
      });
    } catch (nextError) {
      setInvoiceState({
        submitting: false,
        error: nextError.message || "Unable to request invoice.",
        success: null,
      });
    }
  };

  if (confirmation) {
    return (
      <div className="page">
        <section className="section">
          <div className="container stack">
            <Card>
              <div className="portal-page-header">
                <div className="portal-page-header__content">
                  <span className="portal-page-header__eyebrow">Subscription</span>
                  <h1 className="portal-page-header__title">Payment successful — your account is being set up</h1>
                  <p className="portal-page-header__subtitle">
                    You will receive a welcome email at {confirmation.email} within a few minutes with your login
                    details.
                  </p>
                </div>
              </div>
              <div className="portal-data-note" style={{ marginTop: 0 }}>
                You will have access to: {confirmation.association.constituency_names?.join(", ") || "association constituencies"}.
              </div>
              <div style={{ marginTop: 16 }}>
                <Button as={Link} to="/" variant="primary">
                  Return to homepage
                </Button>
              </div>
            </Card>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  return (
    <div className="page">
      <section className="section">
        <div className="container stack">
          <Card>
            <div className="portal-page-header">
              <div className="portal-page-header__content">
                <span className="portal-page-header__eyebrow">Political Solutions</span>
                <h1 className="portal-page-header__title">Association subscriptions</h1>
                <p className="portal-page-header__subtitle">
                  Associations can now subscribe online and trigger automatic account setup, constituency access,
                  and renewal management.
                </p>
              </div>
            </div>
          </Card>

          <div className="portal-split-grid">
            <Card title="Step 1 — Select your association">
              <div className="stack">
                <label className="field">
                  <span>Search associations</span>
                  <input
                    className="input"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by association, region, or constituency"
                  />
                </label>
                <label className="field">
                  <span>Association</span>
                  <select
                    className="input"
                    value={selectedAssociationId}
                    onChange={(event) => setSelectedAssociationId(event.target.value)}
                  >
                    <option value="">Select an association</option>
                    {filteredAssociations.map((association) => (
                      <option key={association.id} value={association.id}>
                        {association.name}
                        {association.region ? ` — ${association.region}` : ""}
                        {association.constituency_count ? ` (${association.constituency_count} constituencies)` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {loading && <p className="muted">Loading pricing…</p>}
                {error && <div className="status error">{error}</div>}
                {selectedAssociation && (
                  <>
                    <PriceSummary association={selectedAssociation} />
                    <div className="portal-data-note" style={{ marginTop: 0 }}>
                      <strong>Your subscription covers:</strong>{" "}
                      {selectedAssociation.constituency_names?.join(", ") || "Constituency list pending"}.
                    </div>
                  </>
                )}
              </div>
            </Card>

            <Card title="Step 2 — Your details">
              <div className="stack">
                <label className="field">
                  <span>Name</span>
                  <input className="input" name="name" value={customer.name} onChange={handleCustomerChange} />
                </label>
                <label className="field">
                  <span>Email address</span>
                  <input
                    className="input"
                    name="email"
                    type="email"
                    value={customer.email}
                    onChange={handleCustomerChange}
                  />
                </label>
                <label className="field">
                  <span>Organisation / role</span>
                  <input
                    className="input"
                    name="organisationRole"
                    value={customer.organisationRole}
                    onChange={handleCustomerChange}
                  />
                </label>
                <label className="field">
                  <span>Phone</span>
                  <input className="input" name="phone" value={customer.phone} onChange={handleCustomerChange} />
                </label>
              </div>
            </Card>
          </div>

          <Card title="Step 3 — Payment or invoice">
            <div className="subscribe-mode-toggle">
              <Button variant={mode === "card" ? "primary" : "ghost"} onClick={() => setMode("card")}>
                Pay by card
              </Button>
              <Button variant={mode === "invoice" ? "primary" : "ghost"} onClick={() => setMode("invoice")}>
                Request invoice
              </Button>
            </div>

            {!selectedAssociation ? (
              <div className="portal-placeholder-panel">
                <p className="portal-placeholder-panel__title">Choose an association first</p>
                <p className="portal-placeholder-panel__body">
                  Select the association before continuing to payment or invoice.
                </p>
              </div>
            ) : mode === "card" ? (
              stripePromise ? (
                <Elements stripe={stripePromise}>
                  <PaymentForm
                    association={selectedAssociation}
                    customer={customer}
                    onSuccess={setConfirmation}
                    disabledReason={paymentDisabledReason}
                  />
                </Elements>
              ) : (
                <div className="status warning">{paymentDisabledReason}</div>
              )
            ) : (
              <div className="stack">
                <div className="portal-data-note" style={{ marginTop: 0 }}>
                  Request Invoice for associations that prefer to pay against an invoice. Your account will be
                  activated on payment.
                </div>
                {invoiceState.error && <div className="status error">{invoiceState.error}</div>}
                {invoiceState.success ? (
                  <div className="status success">
                    Invoice sent to {invoiceState.success.email}. Your account will be activated on payment.
                    {invoiceState.success.invoiceUrl ? (
                      <>
                        {" "}
                        <a href={invoiceState.success.invoiceUrl} target="_blank" rel="noreferrer">
                          View invoice
                        </a>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleInvoiceRequest}
                    loading={invoiceState.submitting}
                    disabled={invoiceState.submitting || !selectedAssociation}
                  >
                    Request invoice
                  </Button>
                )}
              </div>
            )}
          </Card>
        </div>
      </section>
      <Footer />
    </div>
  );
}
