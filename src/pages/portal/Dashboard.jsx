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
        <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Portal</h1>
        <p className="muted">Welcome back. Use the links below to manage pricing and support.</p>
      </Card>

      {signupContext && (
        <Card title="Your selection">
          <div className="stack" style={{ gap: 10 }}>
            {signupContext.association && (
              <div>
                <strong>Association/Federation:</strong> {signupContext.association}
              </div>
            )}
            {signupContext.constituency && (
              <div>
                <strong>Constituency:</strong> {signupContext.constituency}
              </div>
            )}
            {Array.isArray(signupContext.constituencies) && signupContext.constituencies.length > 0 && (
              <div>
                <strong>Constituencies:</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {signupContext.constituencies.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="helper">
              Review pricing with this selection, clear it, or continue with your onboarding steps.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button as={Link} to={pricingLink} variant="secondary">
                Review pricing with this selection
              </Button>
              <Button variant="ghost" onClick={handleClearSelection}>
                Clear selection
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card title="Pricing Rules">
        <p>Review federation pricing rules and updated calculations.</p>
        <Button as={Link} to="/portal/pricing-rules" variant="secondary" style={{ marginTop: 8 }}>
          View pricing rules
        </Button>
      </Card>

      <Card title="Enquiries & Support">
        <p>Need help or clarification? Send an enquiry or email support directly.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <Button as={Link} to="/enquire" variant="secondary">
            Open enquiry form
          </Button>
          <Button as="a" href="mailto:paul@politicalsolutions.uk" variant="ghost">
            Email support
          </Button>
        </div>
      </Card>
    </div>
  );
}
