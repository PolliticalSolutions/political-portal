import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import { listAssociationsWithPricing } from "../lib/subscriptionApi.js";
import { calculateAssociationSubscriptionPricing, formatPenceToPounds } from "../lib/subscriptionPricing.js";

const CHECKOUT_SELECTION_KEY = "PS_SUBSCRIPTION_CHECKOUT_SELECTION";

const getAssociationPricing = (association) => {
  const count = association?.constituency_count || association?.constituency_names?.length || 1;
  const fallback = calculateAssociationSubscriptionPricing(count);
  return {
    constituencyCount: fallback.constituencyCount,
    amountExVatPence: association?.amount_ex_vat_pence ?? fallback.amountExVatPence,
    vatPence: association?.vat_pence ?? fallback.vatPence,
    amountIncVatPence: association?.amount_inc_vat_pence ?? fallback.amountIncVatPence,
  };
};

const saveSelection = (association) => {
  if (typeof sessionStorage === "undefined" || !association) return;
  sessionStorage.setItem(CHECKOUT_SELECTION_KEY, JSON.stringify({ associationId: association.id }));
};

export default function CartEntry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [associations, setAssociations] = useState([]);
  const [selectedAssociationId, setSelectedAssociationId] = useState(searchParams.get("association_id") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    listAssociationsWithPricing()
      .then((rows) => {
        if (!active) return;
        setAssociations(rows);
        if (!selectedAssociationId && rows.length === 1) {
          setSelectedAssociationId(rows[0].id);
        }
      })
      .catch((nextError) => {
        if (active) setError(nextError.message || "Unable to load subscription pricing.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedAssociationId]);

  const selectedAssociation = useMemo(
    () => associations.find((association) => association.id === selectedAssociationId) || null,
    [associations, selectedAssociationId]
  );
  const pricing = selectedAssociation ? getAssociationPricing(selectedAssociation) : null;

  const handleContinue = () => {
    if (!selectedAssociation) return;
    saveSelection(selectedAssociation);
    navigate(`/checkout?association_id=${encodeURIComponent(selectedAssociation.id)}`);
  };

  return (
    <div className="page">
      <section className="section">
        <div className="container stack">
          <Card>
            <div className="portal-page-header">
              <div className="portal-page-header__content">
                <span className="portal-page-header__eyebrow">Checkout</span>
                <h1 className="portal-page-header__title">Your subscription cart</h1>
                <p className="portal-page-header__subtitle">
                  Confirm the association subscription before continuing to secure card payment.
                </p>
              </div>
            </div>
          </Card>

          <Card title="Association subscription">
            <div className="stack">
              <label className="field">
                <span>Association</span>
                <select
                  className="input"
                  value={selectedAssociationId}
                  onChange={(event) => setSelectedAssociationId(event.target.value)}
                >
                  <option value="">Select an association</option>
                  {associations.map((association) => (
                    <option key={association.id} value={association.id}>
                      {association.name}
                      {association.region ? ` - ${association.region}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {loading && <p className="muted">Loading associations...</p>}
              {error && <div className="status error">{error}</div>}
              {selectedAssociation && pricing && (
                <>
                  <div className="portal-data-note" style={{ marginTop: 0 }}>
                    <strong>{selectedAssociation.name}</strong>
                    <br />
                    {pricing.constituencyCount}{" "}
                    {pricing.constituencyCount === 1 ? "constituency" : "constituencies"} covered.
                    {selectedAssociation.constituency_names?.length ? (
                      <> {selectedAssociation.constituency_names.join(", ")}.</>
                    ) : null}
                  </div>
                  <div className="subscribe-pricing">
                    <div className="subscribe-pricing__row">
                      <span>First constituency</span>
                      <strong>£500.00 ex VAT</strong>
                    </div>
                    {pricing.constituencyCount > 1 && (
                      <div className="subscribe-pricing__row">
                        <span>{pricing.constituencyCount - 1} additional constituencies</span>
                        <strong>
                          £{formatPenceToPounds((pricing.constituencyCount - 1) * 25000)} ex VAT
                        </strong>
                      </div>
                    )}
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
                </>
              )}
            </div>
          </Card>

          <Card>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
              <Button as={Link} to="/subscribe" variant="ghost">
                Back to subscriptions
              </Button>
              <Button variant="primary" onClick={handleContinue} disabled={!selectedAssociation}>
                Continue to checkout
              </Button>
            </div>
          </Card>
        </div>
      </section>
      <Footer />
    </div>
  );
}

export { CHECKOUT_SELECTION_KEY, getAssociationPricing, saveSelection };
