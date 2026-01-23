import { Link } from "react-router-dom";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import Seo from "../seo/Seo.jsx";
import { buildOrganisationSchema, buildWebsiteSchema } from "../seo/structuredData.js";

const features = [
  {
    title: "Operational clarity",
    body: "Structured workflows that reduce manual effort, improve accuracy, and keep teams aligned across the UK.",
  },
  {
    title: "Data quality",
    body: "Validation, consistency checks, and reliable data handling for reporting you can trust.",
  },
  {
    title: "Access control",
    body: "Permissioned tools, role-aware views, and clear session handling for authorised users.",
  },
  {
    title: "Audit-friendly",
    body: "Traceable activity, export-ready records, and processes designed for oversight.",
  },
  {
    title: "Insight delivery",
    body: "Dashboards and reporting blocks that surface trends without exposing sensitive data.",
  },
  {
    title: "Compliance support",
    body: "Secure by design, with Cognito-hosted authentication and controlled data flows.",
  },
];

const trustItems = [
  "UK-wide delivery with clear scopes.",
  "Secure sign-in via AWS Cognito.",
  "Audit-ready workflows and reporting.",
  "Subscriptions focused on capability and readiness.",
];

const steps = [
  {
    title: "Define scope",
    body: "Confirm data inputs, operational goals, and compliance requirements.",
  },
  {
    title: "Set up access",
    body: "Provision portal access, roles, and subscription capability tiers.",
  },
  {
    title: "Deliver operations",
    body: "Run marked register processing, insights, and workflow support.",
  },
  {
    title: "Report and refine",
    body: "Use dashboards, audits, and review sessions to sharpen delivery.",
  },
];

export default function Home() {
  return (
    <div className="page">
      <Seo
        title="UK political operations platform"
        description="UK political operations platform for marked register processing, data insights, and compliant campaign operations support. Secure portal subscriptions."
        path="/"
        robots="index,follow"
        jsonLd={[buildOrganisationSchema(), buildWebsiteSchema()]}
      />

      <section className="section">
        <div className="container hero">
          <div>
            <Badge tone="accent">Apolitical operations platform</Badge>
            <h1>UK political operations platform for clean delivery.</h1>
            <p>
              Political Solutions provides marked register processing, data insights, and campaign operations
              support, delivered through a secure subscription portal.
            </p>
            <div className="hero-actions">
              <Button as={Link} to="/services" variant="primary">
                View services
              </Button>
              <Button as={Link} to="/login" variant="ghost">
                Client login
              </Button>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <span>Product overview visual</span>
            <p className="muted" style={{ marginTop: 8 }}>
              Diagram or screenshot placeholder
            </p>
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container stack">
          <div>
            <h2 className="section-title">Practical tools for reliable teams</h2>
            <p className="muted" style={{ maxWidth: 72 + "ch" }}>
              Built for UK political operations that need repeatable workflows, defensible data handling, and
              clear reporting.
            </p>
          </div>
          <div className="feature-grid">
            {features.map((feature) => (
              <Card key={feature.title} title={feature.title}>
                <p>{feature.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <div className="container stack">
          <div>
            <h2 className="section-title">How it works</h2>
            <p className="muted" style={{ maxWidth: 72 + "ch" }}>
              A clear, compliant delivery model that scales from day-to-day operations to election support.
            </p>
          </div>
          <div className="steps">
            {steps.map((step, index) => (
              <div key={step.title} className="step">
                <div className="step-number">{index + 1}</div>
                <h3>{step.title}</h3>
                <p className="muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section surface">
        <div className="container stack">
          <div>
            <h2 className="section-title">Core services for UK political operations</h2>
            <p className="muted" style={{ maxWidth: 72 + "ch" }}>
              Delivered through the portal with secure access, clear scopes, and subscription capability tiers.
            </p>
          </div>
          <div className="feature-grid">
            <Card title="Marked register processing">
              <p className="muted">Standardised processing for clean, usable operational data.</p>
            </Card>
            <Card title="Data insights and reporting">
              <p className="muted">Turnout analysis, dashboards, and reporting built from lawful inputs.</p>
            </Card>
            <Card title="Subscription platform">
              <p className="muted">Secure portal access, workflow tooling, and operational readiness support.</p>
            </Card>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Button as={Link} to="/services" variant="secondary">
              Explore services
            </Button>
            <Button as={Link} to="/services/election-support" variant="ghost">
              Request election support
            </Button>
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container stack">
          <h2 className="section-title">Trusted delivery</h2>
          <div className="trust-strip">
            {trustItems.map((item) => (
              <div key={item} className="trust-item">
                <span className="dot" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="resources">
        <div className="container stack">
          <div>
            <h2 className="section-title">Resources and governance</h2>
            <p className="muted" style={{ maxWidth: 72 + "ch" }}>
              Clear documentation for decision-makers, compliance teams, and operational leads.
            </p>
          </div>
          <div className="feature-grid">
            <Card title="Compliance posture">
              <p className="muted">Capability-focused subscriptions with separate election support scopes.</p>
            </Card>
            <Card title="Security overview">
              <p className="muted">Hosted authentication with session controls and audit-ready workflows.</p>
            </Card>
            <Card title="Policy library">
              <p className="muted">Privacy, terms, and cookie guidance available online.</p>
            </Card>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Button as={Link} to="/privacy" variant="ghost">
              Privacy policy
            </Button>
            <Button as={Link} to="/terms" variant="ghost">
              Terms of use
            </Button>
            <Button as={Link} to="/cookies" variant="ghost">
              Cookie notice
            </Button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container cta-section">
          <div>
            <h2>Ready to plan your operational support?</h2>
            <p className="muted" style={{ maxWidth: 72 + "ch" }}>
              View subscriptions in the portal or request election support to confirm scope and pricing.
            </p>
          </div>
          <div className="hero-actions">
            <Button as={Link} to="/subscriptions" variant="primary">
              View subscriptions
            </Button>
            <Button as={Link} to="/services/election-support" variant="secondary">
              Request election support
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
