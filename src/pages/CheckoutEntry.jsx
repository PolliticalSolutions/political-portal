import { Link, Navigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import Seo from "../seo/Seo.jsx";
import { buildOrganisationSchema, buildWebsiteSchema } from "../seo/structuredData.js";

export default function CheckoutEntry({ authed }) {
  if (authed) {
    return <Navigate to="/portal/checkout" replace />;
  }

  return (
    <div className="page">
      <Seo
        title="Portal checkout access"
        description="Checkout is available through the secure Political Solutions Portal. Log in to continue."
        path="/checkout"
        robots="noindex,nofollow"
        jsonLd={[buildOrganisationSchema(), buildWebsiteSchema()]}
      />

      <section className="section">
        <div className="container hero">
          <div>
            <h1>Please log in to continue</h1>
            <p className="muted">Checkout is available through the secure Portal.</p>
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
            <span>Secure checkout</span>
            <p className="muted" style={{ marginTop: 8 }}>
              Request confirmation placeholder
            </p>
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container">
          <Card title="Continue in the Portal">
            <div className="stack" style={{ gap: 12 }}>
              <div className="muted">Log in to submit your request securely.</div>
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
      </section>
      <Footer />
    </div>
  );
}
