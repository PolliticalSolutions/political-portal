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
            <span className="portal-page-header__eyebrow">Portal</span>
            <h1 className="portal-page-header__title">Dashboard</h1>
            <p className="portal-page-header__subtitle">
              Start from the product area you need: Marked Register Processing, Constituency Intelligence,
              Campaigning, Training & Election Support, or account and subscription management.
            </p>
          </div>
        </div>
      </Card>

      <div className="card-grid">
        <Card title="Marked Register Processing">
          <div className="stack">
            <p>
              Upload marked register files, track processing, and download structured outputs for campaign use.
            </p>
            <div className="portal-section-actions">
              <Button as={Link} to="/portal/uploads" variant="primary">
                Open uploads
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Constituency Intelligence">
          <div className="stack">
            <p>
              Search constituencies, compare results and demographics, and review constituency detail from one
              intelligence workspace.
            </p>
            <div className="portal-section-actions">
              <Button as={Link} to="/portal/constituency" variant="primary">
                Open constituency intelligence
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Campaigning, Training & Election Support">
          <div className="stack">
            <p>
              Request practical support for campaigning, training, by-election preparation, and delivery when
              your team needs a scoped operational brief.
            </p>
            <div className="portal-section-actions">
              <Button as={Link} to="/enquire" variant="primary">
                Request support
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Account and subscriptions">
          <div className="stack">
            <p>
              Review subscription pricing, manage current selections, and continue account setup where needed.
            </p>
            {signupContext && (
              <div className="portal-data-note">
                <strong>Current selection:</strong>{" "}
                {signupContext.constituency || signupContext.association || "Saved selection available"}
              </div>
            )}
            <div className="portal-section-actions">
              <Button as={Link} to={pricingLink} variant="primary">
                Review account pricing
              </Button>
              {signupContext && (
                <Button variant="ghost" onClick={handleClearSelection}>
                  Clear selection
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
