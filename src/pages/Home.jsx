import { useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import heroVisual from "../assets/hero/hero-visual.svg";

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
  "Delivery scopes are agreed in writing before operational work starts.",
  "Secure authentication and session controls are provided via AWS Cognito.",
  "Role-aware access keeps tools and data limited to authorised users.",
  "Audit-ready workflows support governance, review, and exportable reporting.",
];

const steps = [
  {
    title: "Scope the brief",
    body: "Confirm objectives, data inputs, governance requirements, and delivery timelines.",
  },
  {
    title: "Agree delivery plan",
    body: "Set service package, responsibilities, and secure access for the working team.",
  },
  {
    title: "Run managed delivery",
    body: "Execute register processing, insight reporting, and operational support to plan.",
  },
  {
    title: "Review and refine",
    body: "Issue outputs, review performance, and adjust the next delivery cycle.",
  },
];

export default function Home() {
  const [visualLoaded, setVisualLoaded] = useState(true);

  return (
    <div className="page">
      <section className="section">
        <div className="container hero">
          <div>
            <h1>UK political operations platform for clean delivery</h1>
            <p>
              Political Solutions provides UK marked register processing, data insights, and managed campaign
              operations support with secure delivery plans for authorised teams.
            </p>
            <div className="hero-actions">
              <Button as={Link} to="/enquire" variant="primary">
                Request support
              </Button>
              <Button as={Link} to="/services" variant="ghost">
                View services
              </Button>
            </div>
          </div>
          <div className="hero-visual">
            {visualLoaded ? (
              <img
                className="hero-visual-image"
                src={heroVisual}
                alt="Illustration of secure operations delivery and data insights"
                loading="eager"
                onError={() => setVisualLoaded(false)}
              />
            ) : (
              <div className="hero-visual-fallback" aria-hidden="true">
                <div className="hero-visual-bars">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="hero-visual-chart">
                  <span />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section surface">
        <div className="container stack">
          <div>
            <h2 className="section-title">Core services for UK political operations</h2>
            <p className="muted" style={{ maxWidth: 72 + "ch" }}>
              Managed delivery for campaign teams with secure access, clear scopes, and accountable delivery
              plans.
            </p>
          </div>
          <div className="feature-grid">
            <Card title="Marked register processing">
              <p className="muted">Standardised processing for clean, usable operational data.</p>
            </Card>
            <Card title="Data insights and reporting">
              <p className="muted">Turnout analysis, dashboards, and reporting built from lawful inputs.</p>
            </Card>
            <Card title="Managed service delivery">
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

      <section className="section" id="how-it-works">
        <div className="container stack">
          <div>
            <h2 className="section-title">How it works</h2>
            <p className="muted" style={{ maxWidth: 72 + "ch" }}>
              A straightforward four-step delivery flow from scoping through managed execution and review.
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
              <p className="muted">
                Service packages and delivery plans are scoped separately from election support requests.
              </p>
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
            <h2>Ready to scope your operational support?</h2>
            <p className="muted" style={{ maxWidth: 72 + "ch" }}>
              Request a scoping call to confirm delivery needs, timelines, and the right service package.
            </p>
          </div>
          <div className="hero-actions">
            <Button as={Link} to="/enquire" variant="primary">
              Book a scoping call
            </Button>
            <Button as={Link} to="/services" variant="secondary">
              Explore services
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
