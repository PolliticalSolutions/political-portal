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
  "Secure sign-in via AWS Cognito.",
  "Role-based access and permissioned tools.",
  "Designed for repeatable workflows and clear oversight.",
  "Audit-friendly processes and reliable reporting.",
];

export default function Home() {
  return (
    <div className="page stack">
      <Seo
        title="UK political operations platform"
        description="UK political operations platform for marked register processing, data insights, and compliant campaign operations support. Secure portal subscriptions."
        path="/"
        robots="index,follow"
        jsonLd={[buildOrganisationSchema(), buildWebsiteSchema()]}
      />
      <section className="hero">
        <Badge tone="accent">Apolitical operations platform</Badge>
        <div>
          <h1>UK political operations platform for clean delivery.</h1>
          <p>
            Political Solutions provides marked register processing, data insights, and campaign operations
            support, delivered through a secure subscription portal.
          </p>
        </div>
        <div className="hero-actions">
          <Button as={Link} to="/services" variant="primary">
            View services
          </Button>
          <Button as={Link} to="/login" variant="ghost">
            Log in to the Portal
          </Button>
        </div>
      </section>

      <h2 className="section-title">Practical tools for reliable teams</h2>
      <div className="feature-grid">
        {features.map((feature) => (
          <Card key={feature.title} title={feature.title}>
            <p>{feature.body}</p>
          </Card>
        ))}
      </div>

      <section className="stack">
        <h2 className="section-title">Core services for UK political operations</h2>
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
      </section>

      <div className="trust-strip">
        {trustItems.map((item) => (
          <div key={item} className="trust-item">
            <span className="dot" aria-hidden="true" />
            <span>{item}</span>
          </div>
        ))}
      </div>

      <Footer />
    </div>
  );
}
