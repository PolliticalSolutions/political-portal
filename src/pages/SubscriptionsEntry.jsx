import { Link, Navigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";

export default function SubscriptionsEntry({ authed }) {
  if (authed) {
    return <Navigate to="/portal/subscriptions" replace />;
  }

  return (
    <div className="page stack">
      <section className="hero">
        <div>
          <h1>Subscriptions are available in the Portal</h1>
          <p className="muted">
            Log in to view subscription tiers and manage your account, or view our services overview.
          </p>
        </div>
      </section>

      <Card title="Access subscriptions">
        <div className="stack" style={{ gap: 12 }}>
          <div className="muted">Subscriptions are provided through the secure Portal.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Button as={Link} to="/login" variant="primary">
              Log in
            </Button>
            <Button as={Link} to="/signup" variant="secondary">
              Request access / Create account
            </Button>
            <Button as={Link} to="/services" variant="ghost">
              View our services
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
