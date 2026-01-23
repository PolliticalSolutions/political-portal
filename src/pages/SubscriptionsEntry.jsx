import { Link, Navigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Seo from "../seo/Seo.jsx";
import { buildOrganisationSchema, buildWebsiteSchema } from "../seo/structuredData.js";

export default function SubscriptionsEntry({ authed }) {
  if (authed) {
    return <Navigate to="/portal/subscriptions" replace />;
  }

  return (
    <div className="page stack">
      <Seo
        title="Portal subscriptions"
        description="Subscriptions are managed through the secure Political Solutions Portal. Log in to view tiers and manage your account."
        path="/subscriptions"
        robots="noindex,nofollow"
        jsonLd={[buildOrganisationSchema(), buildWebsiteSchema()]}
      />
      <section className="hero">
        <div>
          <h1>Subscriptions are available in the Portal</h1>
          <p className="muted">
            Log in to view subscription tiers and manage your account, or review our services overview.
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
              Request access / create account
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
