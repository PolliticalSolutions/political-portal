import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import Seo from "../seo/Seo.jsx";
import { buildOrganisationSchema, buildServicesSchema, buildWebsiteSchema } from "../seo/structuredData.js";

export default function Services() {
  return (
    <div className="page">
      <Seo
        title="Political operations services"
        description="UK-wide political operations services: marked register processing, data insights, subscription platform access, training, and support. Election support available separately."
        path="/services"
        robots="index,follow"
        jsonLd={[buildOrganisationSchema(), buildWebsiteSchema(), buildServicesSchema()]}
      />

      <section className="section">
        <div className="container hero">
          <div>
            <h1>Political operations services</h1>
            <p className="muted">
              UK-wide operational support and data services for political organisations, with clear, compliant
              delivery and a secure subscription platform.
            </p>
            <div className="hero-actions">
              <Button as={Link} to="/subscriptions" variant="primary">
                View pricing
              </Button>
              <Button as={Link} to="/services/election-support" variant="ghost">
                Request election support
              </Button>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <span>Service delivery overview</span>
            <p className="muted" style={{ marginTop: 8 }}>
              Workflow + reporting snapshot placeholder
            </p>
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container stack">
          <h2 className="section-title">What we deliver</h2>
          <div className="feature-grid">
            <Card title="Marked Register Processing">
              <p className="muted">
                Standardised validation and structured outputs from client-provided marked registers for
                operational use and reporting.
              </p>
            </Card>

            <Card title="Data & Insight">
              <p className="muted">
                Dashboards, turnout and activity analysis, and operational reporting based on lawful client
                inputs and agreed scopes.
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
                UK-wide planning, field operations support, volunteer training, and print or data operations
                coordination. This service is quoted and billed separately from subscriptions.
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
        </div>
      </section>

      <section className="section">
        <div className="container stack">
          <h2 className="section-title">Frequently asked questions</h2>
          <div className="grid">
            <Card title="Do subscriptions include election delivery?">
              <p className="muted">
                No. Subscriptions focus on capability, readiness, and operational tooling. Election and
                by-election support is a separate, chargeable service.
              </p>
            </Card>
            <Card title="What data do you use?">
              <p className="muted">
                We work with lawful, client-provided data sources such as marked registers and agreed inputs,
                with validation and audit-ready processing.
              </p>
            </Card>
            <Card title="Is the service UK-wide?">
              <p className="muted">
                Yes. Political Solutions provides UK-wide services and support, with delivery tailored to your
                operational requirements.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section className="section surface">
        <div className="container cta-section">
          <div>
            <h2>Plan your operational support</h2>
            <p className="muted" style={{ maxWidth: 72 + "ch" }}>
              View subscriptions in the portal or request election support to confirm scope and pricing.
            </p>
          </div>
          <div className="hero-actions">
            <Button as={Link} to="/subscriptions" variant="primary">
              View subscriptions
            </Button>
            <Button as={Link} to="/login" variant="secondary">
              Client login
            </Button>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
