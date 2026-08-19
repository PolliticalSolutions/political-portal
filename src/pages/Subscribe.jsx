import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import Footer from "../components/PublicFooter.jsx";
import { getSession } from "../auth/session.js";
import { supabase } from "../lib/supabase.js";
import {
  createSubscriptionCheckoutSession,
  listAssociationsWithPricing,
  requestSubscriptionInvoice,
} from "../lib/subscriptionApi.js";
import { calculateAssociationSubscriptionPricing } from "../lib/subscriptionPricing.js";

const formatAnnualPounds = (pence) =>
  new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pence / 100);

const initialCustomer = {
  name: "",
  email: "",
  organisationRole: "",
  phone: "",
};

export default function Subscribe() {
  const [searchParams] = useSearchParams();
  const [associations, setAssociations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedAssociationId, setSelectedAssociationId] = useState("");
  const [unlockCount, setUnlockCount] = useState(1);
  const [customer, setCustomer] = useState(initialCustomer);
  const [checkoutState, setCheckoutState] = useState({ submitting: false, error: "" });
  const [mode, setMode] = useState("checkout");
  const [invoiceState, setInvoiceState] = useState({ submitting: false, error: "", success: null });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listAssociationsWithPricing()
      .then((rows) => {
        if (active) setAssociations(rows);
      })
      .catch(() => {
        if (active) {
          setError("We couldn't load association pricing. Refresh the page and try again.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

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
  const selectedAssociationPricing = useMemo(
    () => calculateAssociationSubscriptionPricing(unlockCount),
    [unlockCount]
  );
  const checkoutCancelled = searchParams.get("cancelled") === "true";
  const hasNoSearchResults =
    !loading && !error && Boolean(query.trim()) && filteredAssociations.length === 0;

  useEffect(() => {
    const count = selectedAssociation?.constituency_count || selectedAssociation?.constituency_names?.length || 1;
    setUnlockCount(Math.max(1, count));
  }, [selectedAssociation]);

  useEffect(() => {
    let active = true;
    const cognitoSub = getSession()?.user?.sub || "";
    if (!cognitoSub) return undefined;
    supabase
      .from("user_permissions")
      .select("association_id")
      .eq("cognito_sub", cognitoSub)
      .eq("is_active", true)
      .limit(1)
      .then(({ data }) => {
        const associationId = data?.[0]?.association_id;
        if (active && associationId) setSelectedAssociationId(associationId);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleCustomerChange = (event) => {
    const { name, value } = event.target;
    setCustomer((current) => ({ ...current, [name]: value }));
  };

  const handleInvoiceRequest = async () => {
    if (!selectedAssociation) return;
    if (!customer.name.trim() || !customer.email.trim()) {
      setInvoiceState({
        submitting: false,
        error: "Enter your name and email address before requesting an invoice.",
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
    } catch {
      setInvoiceState({
        submitting: false,
        error: "We couldn't create the invoice. Check your details and try again.",
        success: null,
      });
    }
  };

  const handleStripeCheckout = async () => {
    if (!selectedAssociation) return;
    const session = getSession();
    const userEmail = customer.email.trim() || session?.user?.email || "";
    const customerName = customer.name.trim() || session?.user?.name || "";
    if (!customerName || !userEmail) {
      setCheckoutState({
        submitting: false,
        error: "Enter your name and email address before continuing to Stripe Checkout.",
      });
      return;
    }
    setCheckoutState({ submitting: true, error: "" });
    try {
      const result = await createSubscriptionCheckoutSession({
        association_id: selectedAssociation.id,
        constituency_count: unlockCount,
        user_email: userEmail,
        customer_name: customerName,
        cognito_sub: session?.user?.sub || "",
      });
      if (!result?.url) throw new Error("Stripe Checkout did not return a redirect URL.");
      window.location.assign(result.url);
    } catch {
      setCheckoutState({
        submitting: false,
        error: "We couldn't open Stripe Checkout. Check your details and try again.",
      });
    }
  };

  return (
    <div className="page conversion-page subscribe-page">
      <section className="conversion-hero-section subscribe-hero-section">
        <div className="container conversion-hero subscribe-hero">
          <div className="conversion-hero__copy">
            <p className="conversion-eyebrow">Association subscription</p>
            <h1>Start an annual Political Solutions subscription</h1>
            <p className="conversion-hero__lead">
              Select your association and review the annual price before continuing to Stripe Checkout or
              requesting an invoice.
            </p>
            <Link className="conversion-inline-link" to="/login">
              Already have an account? Log in <span aria-hidden="true">→</span>
            </Link>
          </div>

          <aside className="subscribe-hero__price" aria-label="Annual subscription price basis">
            <span>First constituency</span>
            <strong>£500</strong>
            <small>excluding VAT, billed annually</small>
            <div>
              <span>Each additional constituency</span>
              <b>£250 excluding VAT</b>
            </div>
          </aside>
        </div>
        {checkoutCancelled && (
          <div className="container">
            <div className="status warning conversion-status" role="status">
              You returned before completing Stripe Checkout. Review the subscription details and continue
              when you&apos;re ready.
            </div>
          </div>
        )}
      </section>

      <section className="conversion-section subscribe-pricing-section" aria-labelledby="annual-pricing-title">
        <div className="container">
          <div className="conversion-section-heading">
            <p className="conversion-eyebrow">Exact annual totals</p>
            <h2 id="annual-pricing-title">Annual subscription pricing</h2>
            <p>
              The annual price is £500 excluding VAT for the first constituency, plus £250 excluding VAT for
              each additional constituency. Select an association to see the calculated VAT and annual total.
            </p>
          </div>

          <div className="subscribe-price-table-wrap">
            <table className="subscribe-price-table">
              <caption className="sr-only">Annual association subscription guide prices</caption>
              <thead>
                <tr>
                  <th scope="col">Constituencies</th>
                  <th scope="col">Excluding VAT</th>
                  <th scope="col">VAT at 20%</th>
                  <th scope="col">Including VAT</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 5, 10].map((count) => {
                  const pricing = calculateAssociationSubscriptionPricing(count);
                  return (
                    <tr key={count}>
                      <th scope="row">{count}</th>
                      <td>£{formatAnnualPounds(pricing.amountExVatPence)}</td>
                      <td>£{formatAnnualPounds(pricing.vatPence)}</td>
                      <td>£{formatAnnualPounds(pricing.amountIncVatPence)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="subscribe-price-table__note">
              Each additional constituency: £250.00 excluding VAT; £300.00 including VAT.
            </p>
          </div>
        </div>
      </section>

      <section className="conversion-section subscription-workflow" aria-labelledby="subscription-workflow-title">
        <div className="container">
          <div className="conversion-section-heading conversion-section-heading--wide">
            <p className="conversion-eyebrow">Subscription details</p>
            <h2 id="subscription-workflow-title">Review the association and choose how to pay</h2>
          </div>

          <div className="subscription-workflow__grid">
            <section className="subscription-step subscription-step--association" aria-labelledby="association-step-title">
              <header className="subscription-step__header">
                <span aria-hidden="true">01</span>
                <h3 id="association-step-title" aria-label="1. Select your association">Select your association</h3>
              </header>

              <div className="subscription-step__body">
                <div className="field">
                  <label htmlFor="association-search">Search associations</label>
                  <input
                    id="association-search"
                    className="input"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by association, region or constituency"
                    type="search"
                  />
                </div>

                <div className="field">
                  <label htmlFor="association-select">Association</label>
                  <select
                    id="association-select"
                    className="input"
                    value={selectedAssociationId}
                    onChange={(event) => setSelectedAssociationId(event.target.value)}
                    disabled={loading || Boolean(error)}
                  >
                    <option value="">Select an association</option>
                    {filteredAssociations.map((association) => (
                      <option key={association.id} value={association.id}>
                        {association.name}
                        {association.region ? `, ${association.region}` : ""}
                        {association.constituency_count
                          ? ` (${association.constituency_count} ${
                              association.constituency_count === 1 ? "constituency" : "constituencies"
                            })`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {loading && (
                  <div className="subscription-loading" role="status" aria-live="polite">
                    <span aria-hidden="true" />
                    Loading associations and pricing…
                  </div>
                )}

                {error && (
                  <div className="status error subscription-load-error" role="alert">
                    <span>{error}</span>
                    <Button variant="secondary" className="button--small" onClick={() => setReloadKey((key) => key + 1)}>
                      Try loading again
                    </Button>
                  </div>
                )}

                {hasNoSearchResults && (
                  <div className="subscription-empty" role="status">
                    <p>No associations match that search.</p>
                    <Button variant="secondary" className="button--small" onClick={() => setQuery("")}>
                      Clear search
                    </Button>
                  </div>
                )}

                {selectedAssociation && (
                  <div className="subscription-selection">
                    <div className="subscription-selection__identity">
                      <span>Selected association</span>
                      <strong>{selectedAssociation.name}</strong>
                    </div>

                    <div className="field">
                      <label htmlFor="subscription-constituency-count">
                        Constituencies used to calculate this price
                      </label>
                      <input
                        id="subscription-constituency-count"
                        className="input"
                        type="number"
                        min="1"
                        max={
                          selectedAssociation.constituency_count ||
                          selectedAssociation.constituency_names?.length ||
                          1
                        }
                        value={unlockCount}
                        onChange={(event) => {
                          const max =
                            selectedAssociation.constituency_count ||
                            selectedAssociation.constituency_names?.length ||
                            1;
                          const next = Math.max(1, Math.min(max, Number(event.target.value) || 1));
                          setUnlockCount(next);
                        }}
                        aria-describedby="subscription-count-help"
                      />
                      <span className="helper" id="subscription-count-help">
                        The value is limited to the constituency count currently recorded for the selected
                        association.
                      </span>
                    </div>

                    <dl className="subscription-total" aria-label="Stripe Checkout annual total">
                      <div>
                        <dt>Annual price excluding VAT</dt>
                        <dd>£{formatAnnualPounds(selectedAssociationPricing.amountExVatPence)}</dd>
                      </div>
                      <div>
                        <dt>VAT (20%)</dt>
                        <dd>£{formatAnnualPounds(selectedAssociationPricing.vatPence)}</dd>
                      </div>
                      <div className="subscription-total__final">
                        <dt>Annual total including VAT</dt>
                        <dd>£{formatAnnualPounds(selectedAssociationPricing.amountIncVatPence)}</dd>
                      </div>
                    </dl>

                    <div className="subscription-constituencies">
                      <span>Constituencies currently recorded for this association</span>
                      <p>
                        {selectedAssociation.constituency_names?.join(", ") ||
                          "Constituency list not available."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="subscription-step subscription-step--details" aria-labelledby="details-step-title">
              <header className="subscription-step__header">
                <span aria-hidden="true">02</span>
                <h3 id="details-step-title" aria-label="2. Your details">Your details</h3>
              </header>

              <div className="subscription-step__body subscription-details-grid">
                <div className="field">
                  <label htmlFor="subscription-name">Name *</label>
                  <input
                    id="subscription-name"
                    className="input"
                    name="name"
                    value={customer.name}
                    onChange={handleCustomerChange}
                    autoComplete="name"
                  />
                </div>
                <div className="field">
                  <label htmlFor="subscription-email">Email address *</label>
                  <input
                    id="subscription-email"
                    className="input"
                    name="email"
                    type="email"
                    value={customer.email}
                    onChange={handleCustomerChange}
                    autoComplete="email"
                  />
                </div>
                <div className="field">
                  <label htmlFor="subscription-role">Organisation or role</label>
                  <input
                    id="subscription-role"
                    className="input"
                    name="organisationRole"
                    value={customer.organisationRole}
                    onChange={handleCustomerChange}
                    autoComplete="organization-title"
                  />
                </div>
                <div className="field">
                  <label htmlFor="subscription-phone">Phone</label>
                  <input
                    id="subscription-phone"
                    className="input"
                    name="phone"
                    type="tel"
                    value={customer.phone}
                    onChange={handleCustomerChange}
                    autoComplete="tel"
                  />
                </div>
              </div>
            </section>

            <section className="subscription-step subscription-step--payment" aria-labelledby="payment-step-title">
              <header className="subscription-step__header">
                <span aria-hidden="true">03</span>
                <h3 id="payment-step-title" aria-label="3. Choose how to pay">Choose how to pay</h3>
              </header>

              <div className="subscription-step__body">
                <div className="subscribe-mode-toggle">
                  <Button
                    variant="cta"
                    onClick={() => {
                      setMode("checkout");
                      handleStripeCheckout();
                    }}
                    loading={checkoutState.submitting}
                    disabled={!selectedAssociation || checkoutState.submitting}
                  >
                    {checkoutState.submitting
                      ? "Opening Stripe Checkout…"
                      : "Start annual Stripe subscription"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setMode("invoice")}
                    disabled={!selectedAssociation}
                    aria-pressed={mode === "invoice"}
                  >
                    Request invoice
                  </Button>
                </div>

                {!selectedAssociation ? (
                  <div className="subscription-empty subscription-empty--payment">
                    <h4>Select an association first</h4>
                    <p>Choose the association before continuing to Stripe Checkout or requesting an invoice.</p>
                  </div>
                ) : mode === "invoice" ? (
                  <div className="subscription-payment-panel" aria-live="polite">
                    <p>
                      Request a Stripe invoice for <strong>£{formatAnnualPounds(
                        selectedAssociation.amount_inc_vat_pence
                      )}</strong>. The invoice is due 14 days after issue. This is a one-off invoice and does not
                      renew automatically.
                    </p>
                    {invoiceState.error && <div className="status error" role="alert">{invoiceState.error}</div>}
                    {invoiceState.success ? (
                      <div className="status success" role="status">
                        {invoiceState.success.invoiceUrl ? (
                          <>
                            Your invoice has been created for {invoiceState.success.email}. Use the link below to
                            view and pay it.{" "}
                            <a href={invoiceState.success.invoiceUrl} target="_blank" rel="noreferrer">
                              View invoice
                            </a>
                          </>
                        ) : (
                          <>Your invoice request has been recorded for {invoiceState.success.email}.</>
                        )}
                      </div>
                    ) : (
                      <Button
                        variant="cta"
                        onClick={handleInvoiceRequest}
                        loading={invoiceState.submitting}
                        disabled={invoiceState.submitting}
                      >
                        {invoiceState.submitting ? "Creating invoice…" : "Request invoice"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="subscription-payment-panel" aria-live="polite">
                    <p>
                      Stripe Checkout will charge <strong>£{formatAnnualPounds(
                        selectedAssociationPricing.amountIncVatPence
                      )}</strong> today. The subscription will renew once a year.
                    </p>
                    {checkoutState.error && <div className="status error" role="alert">{checkoutState.error}</div>}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
