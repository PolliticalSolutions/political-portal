import { useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import campaignDataPng from "../assets/campaign-data.png";
import campaignDataWebp from "../assets/campaign-data.webp";

const trustItems = [
  "Secure authentication and role-aware access are built into the platform.",
  "Marked Register work is processed to an agreed scope before delivery starts.",
  "Operational workflows support review, reporting, and audit-ready handover.",
  "Election support is quoted separately so campaign teams know what is included.",
];

const nextSteps = [
  {
    title: "Choose the product that matches the job",
    body: "Use Marked Register Processing when you need clean operational outputs. Use Constituency Intelligence when you need fast constituency context and comparison.",
  },
  {
    title: "Confirm scope, access, and ownership",
    body: "Subscriptions, portal access, and service work are scoped clearly so teams know who can use the platform and what they are buying.",
  },
  {
    title: "Work through one secure portal",
    body: "Upload files, review outputs, and access constituency information in the same controlled environment.",
  },
];

export default function Home() {
  const [visualLoaded, setVisualLoaded] = useState(true);

  return (
    <div className="page">
      <section className="section">
        <div className="container hero">
          <div>
            <h1>Political data products for campaign teams that need clean delivery</h1>
            <p>
              Political Solutions provides two core products: Marked Register Processing for turning marked
              register files into structured operational outputs, and Constituency Intelligence for reviewing
              constituency results, demographics, and electoral context in one portal.
            </p>
            <div className="hero-actions">
              <Button as={Link} to="/subscriptions" variant="primary">
                View Marked Register plans
              </Button>
              <Button as={Link} to="/enquire" variant="ghost">
                Request a platform briefing
              </Button>
            </div>
            <p className="muted" style={{ marginTop: 16, maxWidth: "72ch" }}>
              Built for candidates, agents, association officers, and campaign teams who need operationally
              useful data tools rather than generic campaign software.
            </p>
          </div>
          <div className="hero-visual">
            {visualLoaded ? (
              <picture>
                <source type="image/webp" srcSet={campaignDataWebp} />
                <img
                  className="hero-visual-image"
                  src={campaignDataPng}
                  alt="Campaign data dashboard visual for UK political operations delivery"
                  width={1536}
                  height={1024}
                  loading="eager"
                  decoding="async"
                  onError={() => setVisualLoaded(false)}
                />
              </picture>
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
            <h2 className="section-title">Choose the product that fits the job</h2>
            <p className="muted" style={{ maxWidth: "72ch" }}>
              The platform is built around two different operational needs. One handles marked register
              processing. The other gives campaign teams a searchable constituency view.
            </p>
          </div>
          <div className="feature-grid feature-grid--equal">
            <Card title="Marked Register Processing">
              <p>
                Turn marked register PDFs and CSVs into structured outputs your team can use quickly.
              </p>
              <p className="muted" style={{ marginTop: 12 }}>
                <strong>Who it is for:</strong> Association officers, agents, candidates, and teams managing
                marked register returns.
              </p>
              <div className="hero-actions" style={{ marginTop: 16 }}>
                <Button as={Link} to="/subscriptions" variant="primary">
                  View Marked Register plans
                </Button>
              </div>
            </Card>
            <Card title="Constituency Intelligence">
              <p>
                Search constituency winners, election history, and demographic context in one secure portal
                workflow.
              </p>
              <p className="muted" style={{ marginTop: 12 }}>
                <strong>Who it is for:</strong> Campaign planners, researchers, association leads, and
                headquarters teams comparing seats.
              </p>
              <div className="hero-actions" style={{ marginTop: 16 }}>
                <Button as={Link} to="/enquire" variant="secondary">
                  Request a Constituency Intelligence briefing
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container stack">
          <div>
            <h2 className="section-title">Why teams trust Political Solutions</h2>
            <p className="muted" style={{ maxWidth: "72ch" }}>
              The platform is designed for controlled delivery: clear scope, secure access, and operational
              outputs that can be reviewed and handed over properly.
            </p>
          </div>
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

      <section className="section">
        <div className="container stack">
          <div>
            <h2 className="section-title">What happens next</h2>
            <p className="muted" style={{ maxWidth: "72ch" }}>
              Buyers should be able to understand the route from interest to delivery without guesswork.
            </p>
          </div>
          <div className="steps">
            {nextSteps.map((step, index) => (
              <div key={step.title} className="step">
                <div className="step-number">{index + 1}</div>
                <h3>{step.title}</h3>
                <p className="muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container cta-section">
          <div>
            <h2>Need to confirm the right product for your team?</h2>
            <p className="muted" style={{ maxWidth: "72ch" }}>
              We can confirm whether you need Marked Register Processing, Constituency Intelligence, or a
              separate election support brief before any work is scoped.
            </p>
          </div>
          <div className="hero-actions">
            <Button as={Link} to="/enquire" variant="primary">
              Request a scoping call
            </Button>
            <Button as={Link} to="/services" variant="secondary">
              View services
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
