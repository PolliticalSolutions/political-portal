import { Link } from "react-router-dom";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";

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
  "UK-based political operations support.",
  "Secure handling of sensitive data via hosted authentication.",
  "Fast turnaround on marked register processing.",
  "Clear pricing and deliverables for core services.",
];

const offerCards = [
  {
    title: "Marked Register entry",
    body: "Structured marked register data entry for clean, usable operational outputs.",
    to: "/services#marked-register",
    cta: "View marked register options",
  },
  {
    title: "Campaign consultancy",
    body: "Practical campaign operations support covering planning, workflows, and delivery.",
    to: "/services",
    cta: "Explore consultancy support",
  },
  {
    title: "By-election specialist support",
    body: "Focused support for by-elections with scope, timelines, and clear service boundaries.",
    to: "/services/election-support",
    cta: "Request by-election support",
  },
];

const markedRegisterSteps = [
  {
    title: "1. Start account setup",
    body: "Create your account and access the secure portal workflow.",
  },
  {
    title: "2. Share your register details",
    body: "Submit your processing request and required context through the portal flow.",
  },
  {
    title: "3. Structured processing",
    body: "Data is processed into consistent, operationally usable outputs.",
  },
  {
    title: "4. Review and use",
    body: "Use processed outputs for reporting and operational decision support.",
  },
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
          <Button as={Link} to="/signup" variant="primary">
            Create an account
          </Button>
          <Button as={Link} to="/services" variant="ghost">
            Explore services
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

      <h2 className="section-title" id="services">
        What we do
      </h2>
      <div className="feature-grid">
        {offerCards.map((offer) => (
          <Card
            key={offer.title}
            title={offer.title}
            action={
              <Button as={Link} to={offer.to} variant="ghost">
                {offer.cta}
              </Button>
            }
          >
            <p>{offer.body}</p>
          </Card>
        ))}
      </div>

      <h2 className="section-title">How marked register processing works</h2>
      <div className="feature-grid">
        {markedRegisterSteps.map((step) => (
          <Card key={step.title} title={step.title}>
            <p>{step.body}</p>
          </Card>
        ))}
      </div>

      <div className="card homepage-cta-band">
        <div className="homepage-cta-content">
          <div>
            <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>Ready to get started?</h2>
            <p className="muted" style={{ margin: 0 }}>
              Create your account to access secure workflows and service setup.
            </p>
          </div>
          <div className="hero-actions">
            <Button as={Link} to="/signup" variant="primary">
              Create an account
            </Button>
            <Button as={Link} to="/enquire" variant="ghost">
              Enquire
            </Button>
          </div>
        </div>
      </div>

      <h2 className="section-title">Practical tools for reliable teams</h2>
      <div className="feature-grid">
        {features.map((feature) => (
          <Card key={feature.title} title={feature.title}>
            <p>{feature.body}</p>
          </Card>
        ))}
      </div>

      <Footer />
    </div>
  );
}
