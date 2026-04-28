import { Link, useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";

export default function CheckoutConfirmationEntry() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";
  const paymentIntentId = searchParams.get("payment_intent") || "";

  return (
    <div className="page">
      <section className="section">
        <div className="container stack">
          <Card>
            <div className="portal-page-header">
              <div className="portal-page-header__content">
                <span className="portal-page-header__eyebrow">Payment successful</span>
                <h1 className="portal-page-header__title">Thank you - your subscription is confirmed</h1>
                <p className="portal-page-header__subtitle">
                  Your payment has been received. Your Political Solutions account will be activated within 24 hours.
                </p>
              </div>
            </div>
            {email && (
              <div className="portal-data-note" style={{ marginTop: 0 }}>
                Confirmation and onboarding details will be sent to {email}.
              </div>
            )}
            {paymentIntentId && (
              <div className="status" style={{ marginTop: 16 }}>
                Stripe payment reference: {paymentIntentId}
              </div>
            )}
          </Card>

          <Card title="What happens next">
            <ol className="muted" style={{ margin: 0, paddingLeft: 18 }}>
              <li>We verify the payment and subscription details.</li>
              <li>Your association access is configured in the secure portal.</li>
              <li>You receive a welcome email when the account is ready.</li>
            </ol>
          </Card>

          <Card>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Button as={Link} to="/login" variant="primary">
                Client login
              </Button>
              <Button as={Link} to="/" variant="ghost">
                Back to homepage
              </Button>
            </div>
          </Card>
        </div>
      </section>
      <Footer />
    </div>
  );
}
