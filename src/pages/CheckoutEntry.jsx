import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/PublicFooter.jsx";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import { createSubscriptionPaymentIntent, listAssociationsWithPricing } from "../lib/subscriptionApi.js";
import { formatPenceToPounds } from "../lib/subscriptionPricing.js";
import { CHECKOUT_SELECTION_KEY, getAssociationPricing } from "./CartEntry.jsx";

let stripePromise;
function getStripePromise() {
  if (stripePromise === undefined) {
    const { stripePublishableKey } = getRuntimeConfig();
    stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;
  }
  return stripePromise;
}

const readStoredAssociationId = () => {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return JSON.parse(sessionStorage.getItem(CHECKOUT_SELECTION_KEY) || "{}").associationId || "";
  } catch (error) {
    return "";
  }
};

function StripePaymentForm({ association, customer, setCustomer, onSuccess, disabledReason }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pricing = getAssociationPricing(association);
  const canSubmit = association && customer.name.trim() && customer.email.trim() && stripe && elements && !disabledReason;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setCustomer((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");
    try {
      const paymentIntent = await createSubscriptionPaymentIntent({
        association_id: association.id,
        user_email: customer.email.trim(),
        customer_name: customer.name.trim(),
        organisation_role: customer.role.trim(),
        phone: customer.phone.trim(),
      });
      const confirmation = await stripe.confirmCardPayment(paymentIntent.client_secret, {
        payment_method: {
          card: elements.getElement(CardElement),
          billing_details: {
            name: customer.name.trim(),
            email: customer.email.trim(),
            phone: customer.phone.trim(),
          },
        },
      });
      if (confirmation.error) {
        throw new Error(confirmation.error.message || "Payment could not be confirmed.");
      }
      onSuccess(confirmation.paymentIntent?.id || "");
    } catch (nextError) {
      setError(nextError.message || "Unable to complete payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <label className="field">
        <span>Name</span>
        <input className="input" name="name" value={customer.name} onChange={handleChange} />
      </label>
      <label className="field">
        <span>Email address</span>
        <input className="input" name="email" type="email" value={customer.email} onChange={handleChange} />
      </label>
      <label className="field">
        <span>Organisation / role</span>
        <input className="input" name="role" value={customer.role} onChange={handleChange} />
      </label>
      <label className="field">
        <span>Phone</span>
        <input className="input" name="phone" value={customer.phone} onChange={handleChange} />
      </label>
      <label className="field">
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
      </label>
      {disabledReason && <div className="status warning">{disabledReason}</div>}
      {error && <div className="status error">{error}</div>}
      <Button type="submit" variant="primary" loading={submitting} disabled={!canSubmit || submitting}>
        Pay £{formatPenceToPounds(pricing.amountIncVatPence)}
      </Button>
    </form>
  );
}

export default function CheckoutEntry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialAssociationId = searchParams.get("association_id") || readStoredAssociationId();
  const [associationId] = useState(initialAssociationId);
  const [associations, setAssociations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState({ name: "", email: "", role: "", phone: "" });
  const { stripePublishableKey, stripeApiBaseUrl, apiBaseUrl } = getRuntimeConfig();

  useEffect(() => {
    let active = true;
    listAssociationsWithPricing()
      .then((rows) => {
        if (active) setAssociations(rows);
      })
      .catch((nextError) => {
        if (active) setError(nextError.message || "Unable to load checkout details.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const association = useMemo(
    () => associations.find((item) => item.id === associationId) || null,
    [associations, associationId]
  );
  const pricing = association ? getAssociationPricing(association) : null;
  const paymentDisabledReason =
    !stripePublishableKey || !(stripeApiBaseUrl || apiBaseUrl)
      ? "Stripe payment is unavailable until VITE_STRIPE_PUBLISHABLE_KEY and the Stripe API URL are configured."
      : "";

  const handleSuccess = (paymentIntentId) => {
    const params = new URLSearchParams({
      association_id: association.id,
      email: customer.email.trim(),
    });
    if (paymentIntentId) params.set("payment_intent", paymentIntentId);
    navigate(`/checkout/confirmation?${params.toString()}`);
  };

  return (
    <div className="page">
      <section className="section">
        <div className="container stack">
          <Card>
            <div className="portal-page-header">
              <div className="portal-page-header__content">
                <span className="portal-page-header__eyebrow">Secure payment</span>
                <h1 className="portal-page-header__title">Checkout</h1>
                <p className="portal-page-header__subtitle">
                  Pay by card using Stripe. VAT is included in the total shown below.
                </p>
              </div>
            </div>
          </Card>

          {loading && <Card><p className="muted">Loading checkout...</p></Card>}
          {error && <Card><div className="status error">{error}</div></Card>}
          {!loading && !association && (
            <Card title="Choose a subscription first">
              <p className="muted">Return to the subscription cart and select the association you want to buy.</p>
              <Button as={Link} to="/cart" variant="primary" style={{ marginTop: 16 }}>
                Back to cart
              </Button>
            </Card>
          )}
          {association && pricing && (
            <>
              <Card title="Order summary">
                <div className="subscribe-pricing">
                  <div className="subscribe-pricing__row">
                    <span>{association.name}</span>
                    <strong>
                      {pricing.constituencyCount}{" "}
                      {pricing.constituencyCount === 1 ? "constituency" : "constituencies"}
                    </strong>
                  </div>
                  <div className="subscribe-pricing__row">
                    <span>Net total</span>
                    <strong>£{formatPenceToPounds(pricing.amountExVatPence)}</strong>
                  </div>
                  <div className="subscribe-pricing__row">
                    <span>VAT (20%)</span>
                    <strong>£{formatPenceToPounds(pricing.vatPence)}</strong>
                  </div>
                  <div className="subscribe-pricing__row subscribe-pricing__row--total">
                    <span>Total due today</span>
                    <strong>£{formatPenceToPounds(pricing.amountIncVatPence)}</strong>
                  </div>
                </div>
              </Card>

              <Card title="Payment details">
                {getStripePromise() ? (
                  <Elements stripe={getStripePromise()}>
                    <StripePaymentForm
                      association={association}
                      customer={customer}
                      setCustomer={setCustomer}
                      onSuccess={handleSuccess}
                      disabledReason={paymentDisabledReason}
                    />
                  </Elements>
                ) : (
                  <div className="status warning">{paymentDisabledReason}</div>
                )}
              </Card>
            </>
          )}
        </div>
      </section>
      <Footer />
    </div>
  );
}
