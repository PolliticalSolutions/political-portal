import { Link, Navigate } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";

export default function CheckoutConfirmationEntry({ authed }) {
  if (authed) {
    return <Navigate to="/portal/checkout/confirmation" replace />;
  }

  return (
    <div className="page stack">
      <section className="hero">
        <div>
          <h1>Please log in to continue</h1>
          <p className="muted">Confirmation details are available in the Portal.</p>
        </div>
      </section>

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
  );
}
