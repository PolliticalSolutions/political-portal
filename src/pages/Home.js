import React from "react";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="container">
      <div className="nav">
        <div className="brand">
          Political Solutions Ltd <span className="badge">Apolitical • UK</span>
        </div>

        <div className="navlinks">
          <a href="#services">Services</a>
          <a href="#pricing">Pricing</a>
          <a href="#contact">Contact</a>
          <Link className="btn" to="/login">Login</Link>
        </div>
      </div>

      <div className="hero">
        <h1 className="h1">
          Modern, apolitical campaign operations — built for local organisations.
        </h1>

        <p className="lead">
          We help local political teams and federations streamline admin, automate repetitive work,
          and generate practical local insights — so you spend more time campaigning and less time wrestling spreadsheets.
        </p>

        <div className="heroActions">
          <Link className="btn btnPrimary" to="/login">Access the portal</Link>
          <a className="btn" href="#contact">Request access</a>
        </div>

        <div className="grid" style={{ marginTop: 22 }}>
          <div className="card">
            <h3>Marked register processing</h3>
            <p>Structured entry workflows, quality checks, and automation-ready outputs.</p>
          </div>
          <div className="card">
            <h3>Portal access</h3>
            <p>Manage constituencies, federations, users and permissions in one place.</p>
          </div>
          <div className="card">
            <h3>Local insights</h3>
            <p>Practical dashboards and reporting to support better local decision-making.</p>
          </div>
        </div>
      </div>

      <div id="services" className="section">
        <h2 className="sectionTitle">What we do</h2>
        <ul className="list">
          <li><b>Reduce admin</b> with repeatable workflows and consistent data structures.</li>
          <li><b>Improve accuracy</b> via validation checks and transparent audit trails.</li>
          <li><b>Unlock automation</b> by producing clean, machine-readable outputs.</li>
          <li><b>Support growth</b> with simple reporting and operational visibility.</li>
        </ul>
      </div>

      <div id="pricing" className="section">
        <h2 className="sectionTitle">Pricing</h2>
        <p className="lead" style={{ marginBottom: 0 }}>
          Simple federation pricing: <b>£500</b> base + <b>£250</b> per additional constituency.
        </p>

        <div className="pricingRow">
          <div className="priceBox">
            <h3 style={{ margin: 0 }}>Examples</h3>
            <div className="kpi"><span className="dot" /> 1 constituency federation: <b>£500</b></div>
            <div className="kpi"><span className="dot" /> 2 constituencies: <b>£750</b></div>
            <div className="kpi"><span className="dot" /> 5 constituencies: <b>£1,500</b></div>
            <p style={{ color: "var(--muted)", marginTop: 12, lineHeight: 1.6 }}>
              Billing will be automated via Xero once portal billing is enabled.
            </p>
          </div>

          <div className="priceBox">
            <h3 style={{ margin: 0 }}>What’s included</h3>
            <ul className="list" style={{ marginTop: 10 }}>
              <li>Portal access for approved users</li>
              <li>Federation + constituency structure</li>
              <li>Operational tools (initial release)</li>
              <li>Ongoing improvements through January launch</li>
            </ul>
          </div>
        </div>
      </div>

      <div id="contact" className="section">
        <h2 className="sectionTitle">Contact</h2>
        <p className="lead" style={{ marginBottom: 0 }}>
          Email: <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>
        </p>
      </div>

      <div className="footer">
        <div>© {new Date().getFullYear()} Political Solutions Ltd</div>
        <div style={{ color: "var(--muted)" }}>Apolitical consultancy • Built on AWS</div>
      </div>
    </div>
  );
}
