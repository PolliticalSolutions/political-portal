import { Link, Navigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";

export default function SubscriptionsEntry({ authed }) {
  if (authed) {
    return <Navigate to="/portal/subscriptions" replace />;
  }

  return (
    <div className="page">
      <section className="section">
        <div className="container hero">
          <div>
            <h1>Subscriptions are available in the Portal</h1>
            <p className="muted">
              Log in to view subscription tiers and manage your account, or review our services overview.
            </p>
            <div className="hero-actions">
              <Button as={Link} to="/login" variant="primary">
                Client login
              </Button>
              <Button as={Link} to="/services" variant="ghost">
                View services
              </Button>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <span>Subscription tier preview</span>
            <p className="muted" style={{ marginTop: 8 }}>
              Pricing matrix placeholder
            </p>
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container">
          <Card title="Access subscriptions">
            <div className="stack" style={{ gap: 12 }}>
              <div className="muted">Subscriptions are provided through the secure Portal.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <Button as={Link} to="/login" variant="primary">
                  Log in
                </Button>
                <Button as={Link} to="/signup" variant="secondary">
                  Request access / create account
                </Button>
                <Button as={Link} to="/services" variant="ghost">
                  View our services
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </section>
      <Footer />
    </div>
  );
}
