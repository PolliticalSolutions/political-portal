import { Link } from "react-router-dom";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";

const navItems = ["Overview", "Federations", "Data processing", "Insights", "Reporting"];
const moduleCards = [
  {
    title: "Federations",
    body: "Structure teams, permissions, and regions with clear ownership and access control.",
  },
  {
    title: "Data processing",
    body: "Validate, transform, and route data with audit-friendly checkpoints.",
  },
  {
    title: "Insights",
    body: "Surface operational trends without exposing sensitive records.",
  },
  {
    title: "Reporting",
    body: "Export-ready summaries for oversight and compliance reviews.",
  },
];

export default function Portal({ tokens, onLogout }) {
  const hasTokens = Boolean(tokens);

  return (
    <div className="page stack">
      <Card>
        <div className="card-header">
          <div>
            <Badge tone="accent">Portal</Badge>
            <h1 style={{ margin: "6px 0 4px", fontSize: 22 }}>Operational tools and reporting</h1>
            <p className="muted">You&rsquo;re signed in.</p>
          </div>
          {onLogout && (
            <Button variant="ghost" onClick={onLogout}>
              Logout
            </Button>
          )}
        </div>
      </Card>

      <div className="portal-shell">
        <div className="portal-nav">
          {navItems.map((item, index) => (
            <span key={item} className={`portal-link ${index === 0 ? "active" : ""}`}>
              {item}
            </span>
          ))}
        </div>

        <div className="portal-main">
          <Card title="Session status" action={<Badge tone="accent">{hasTokens ? "Active" : "Inactive"}</Badge>}>
            <p>Access token present: {hasTokens ? "yes" : "no"}</p>
            {tokens?.id_token && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer" }}>View token payload (truncated)</summary>
                <div className="token-block">{tokens.id_token.slice(0, 140)}...</div>
              </details>
            )}
          </Card>
          <Card title="Session tools">
            <p>Check token claims, expiry, and Cognito config.</p>
            <Button as={Link} to="/portal/session" variant="secondary" style={{ marginTop: 8 }}>
              View session
            </Button>
          </Card>
          <Card title="Pricing">
            <p>Preview how federation add-ons affect the subscription total.</p>
            <Button as={Link} to="/portal/pricing" variant="secondary" style={{ marginTop: 8 }}>
              View pricing
            </Button>
          </Card>

          <div className="card-grid">
            {moduleCards.map((item) => (
              <Card key={item.title} title={item.title}>
                <p>{item.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
