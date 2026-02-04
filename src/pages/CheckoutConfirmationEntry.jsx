import { Link, Navigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";

export default function CheckoutConfirmationEntry({ authed }) {
  if (authed) {
    return <Navigate to="/portal/checkout/confirmation" replace />;
  }

  return (
    <div className="page">
      <section className="section">
        <div className="container hero">
          <div>
            <h1>Please log in to continue</h1>
            <p className="muted">Confirmation details are available in the Portal.</p>
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
            <span>Order confirmation</span>
            <p className="muted" style={{ marginTop: 8 }}>
              Confirmation summary placeholder
            </p>
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container">
          <Card title="Continue in the Portal">
            <div className="stack" style={{ gap: 12 }}>
              <div className="muted">Log in to view your confirmation details.</div>
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
