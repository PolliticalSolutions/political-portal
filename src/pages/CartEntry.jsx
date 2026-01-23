import { Link, Navigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Seo from "../seo/Seo.jsx";
import { buildOrganisationSchema, buildWebsiteSchema } from "../seo/structuredData.js";

export default function CartEntry({ authed }) {
  if (authed) {
    return <Navigate to="/portal/cart" replace />;
  }

  return (
    <div className="page stack">
      <Seo
        title="Portal cart access"
        description="Cart access is available through the secure Political Solutions Portal. Log in to continue."
        path="/cart"
        robots="noindex,nofollow"
        jsonLd={[buildOrganisationSchema(), buildWebsiteSchema()]}
      />
      <section className="hero">
        <div>
          <h1>Please log in to continue</h1>
          <p className="muted">Cart and checkout are available through the secure Portal.</p>
        </div>
      </section>

      <Card title="Continue in the Portal">
        <div className="stack" style={{ gap: 12 }}>
          <div className="muted">Log in to access your cart and submit requests.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Button as={Link} to="/login" variant="primary">
              Log in
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
