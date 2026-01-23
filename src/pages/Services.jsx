import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";

export default function Services() {
  return (
    <div className="page stack">
      <section className="hero">
        <div>
          <h1>Services</h1>
          <p className="muted">
            UK-wide operational support and data services for political organizations, with clear, compliant
            delivery.
          </p>
        </div>
      </section>

      <div className="stack">
        <Card title="Marked Register Processing">
          <p className="muted">
            Standardization, validation, and structured outputs from client-provided marked registers for
            operational use.
          </p>
        </Card>

        <Card title="Data & Insight">
          <p className="muted">
            Dashboards, turnout and activity analysis, and operational reporting based on lawful client
            inputs.
          </p>
        </Card>

        <Card title="Subscriptions & Platform">
          <p className="muted">
            Capability tiers for operational readiness, workflows, and insight delivery. Access is managed
            through the Portal.
          </p>
          <div style={{ marginTop: 12 }}>
            <Button as={Link} to="/subscriptions" variant="secondary">
              View subscriptions
            </Button>
          </div>
        </Card>

        <Card title="Training & Support">
          <p className="muted">
            Onboarding, usage support, and practical training focused on effective operational delivery.
          </p>
        </Card>

        <Card title="Election & By-Election Support (separate charge)">
          <p className="muted">
            Planning, field operations support, volunteer training, and print or data operations support.
            This service is quoted and billed separately from subscriptions.
          </p>
          <div style={{ marginTop: 12 }}>
            <Button as={Link} to="/services/election-support" variant="secondary">
              Request election support
            </Button>
          </div>
        </Card>

        <Card title="Compliance note">
          <p className="muted">
            Subscriptions provide capability, readiness, and operational tooling. Clients remain responsible
            for compliance with electoral law and regulated spending. We do not provide statutory electoral
            services.
          </p>
        </Card>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Button as={Link} to="/login" variant="primary">
          Log in to Portal
        </Button>
        <Button as={Link} to="/subscriptions" variant="ghost">
          View subscriptions
        </Button>
      </div>
    </div>
  );
}
