import { Link } from "react-router-dom";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";

const features = [
  {
    title: "Operational clarity",
    body: "Structured workflows that reduce manual effort, improve accuracy, and keep teams aligned across regions.",
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
      <section className="hero">
        <Badge tone="accent">Apolitical operations platform</Badge>
        <div>
          <h1>Run cleaner operations. Make better decisions.</h1>
          <p>A secure, apolitical platform for structured operations, data processing, and local insight.</p>
        </div>
        <div className="hero-actions">
          <Button as={Link} to="/login" variant="primary">
            Access the portal
          </Button>
          <Button as="a" href="#services" variant="ghost">
            View services
          </Button>
        </div>
      </section>

      <h2 className="section-title" id="services">
        Practical tools for reliable teams
      </h2>
      <div className="feature-grid">
        {features.map((feature) => (
          <Card key={feature.title} title={feature.title}>
            <p>{feature.body}</p>
          </Card>
        ))}
      </div>

      <div className="trust-strip">
        {trustItems.map((item) => (
          <div key={item} className="trust-item">
            <span className="dot" aria-hidden="true" />
            <span>{item}</span>
          </div>
        ))}
      </div>

      <footer className="footer">
        <span>Political Solutions - secure, structured, audit-friendly.</span>
        <span>Contact: ops@politicalsolutions.uk</span>
        <span>Privacy | Terms</span>
      </footer>
    </div>
  );
}
