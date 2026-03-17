import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";

const signupContextKey = "ps_signup_context_v1";

function parseSignupContext(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export default function Dashboard() {
  const [signupContext, setSignupContext] = useState(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(signupContextKey);
    setSignupContext(parseSignupContext(stored));
  }, []);

  const pricingLink = useMemo(() => {
    if (!signupContext) return "/portal/pricing-rules";
    const params = new URLSearchParams();
    if (signupContext.association) params.set("association", signupContext.association);
    if (signupContext.constituency) params.set("constituency", signupContext.constituency);
    const query = params.toString();
    return query ? `/portal/pricing-rules?${query}` : "/portal/pricing-rules";
  }, [signupContext]);

  const handleClearSelection = () => {
    sessionStorage.removeItem(signupContextKey);
    setSignupContext(null);
  };

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <h1 className="portal-page-header__title">Dashboard</h1>
            <p className="portal-page-header__subtitle">
              Start from the product area you need: Marked Register Processing, Constituency Intelligence,
              Campaigning, Training & Election Support, or account and subscription management.
            </p>
          </div>
        </div>
      </Card>

      <div className="card-grid portal-dashboard-grid">
        <Card title="Marked Register Processing" className="product-card dashboard-module-card">
          <div className="product-card__body">
            <p>
              Upload marked register files, track processing, and download structured outputs for campaign use.
            </p>
          </div>
          <div className="product-card__cta">
            <div className="portal-section-actions portal-section-actions--stack">
              <Button as={Link} to="/portal/uploads" variant="primary">
                Open uploads
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Constituency Intelligence" className="product-card dashboard-module-card">
          <div className="product-card__body">
            <p>
              Search constituencies, compare results and demographics, and review constituency detail from one
              intelligence workspace.
            </p>
          </div>
          <div className="product-card__cta">
            <div className="portal-section-actions portal-section-actions--stack">
              <Button as={Link} to="/portal/constituency" variant="primary">
                Open constituency intelligence
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Campaigning, Training & Election Support" className="product-card dashboard-module-card">
          <div className="product-card__body">
            <p>
              Request practical support for campaigning, training, by-election preparation, and delivery when
              your team needs a scoped operational brief.
            </p>
          </div>
          <div className="product-card__cta">
            <div className="portal-section-actions portal-section-actions--stack">
              <Button as={Link} to="/enquire" variant="primary">
                Request support
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Account and subscriptions" className="product-card dashboard-module-card">
          <div className="product-card__body">
            <p>
              Review subscription pricing, manage current selections, and continue account setup where needed.
            </p>
            {signupContext && (
              <div className="portal-data-note">
                <strong>Current selection:</strong>{" "}
                {signupContext.constituency || signupContext.association || "Saved selection available"}
                <button type="button" className="portal-inline-action" onClick={handleClearSelection}>
                  Clear saved selection
                </button>
              </div>
            )}
          </div>
          <div className="product-card__cta">
            <div className="portal-section-actions portal-section-actions--stack">
              <Button as={Link} to={pricingLink} variant="primary">
                Review account pricing
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
