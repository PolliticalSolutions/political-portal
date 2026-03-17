import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import servicesCampaignDataImage from "../assets/services-campaign-data.png";

export default function Services() {
  return (
    <div className="page">
      <section className="section">
        <div className="container hero">
          <div>
            <h1>Operational support for campaign teams that need clean delivery</h1>
            <p className="muted">
              Political Solutions supports campaign teams with Marked Register Processing, election support,
              and practical advisory work that helps associations and candidates move faster with fewer errors.
            </p>
          </div>
          <div className="hero-visual services-hero-visual">
            <img
              className="hero-visual-image services-hero-image"
              src={servicesCampaignDataImage}
              alt="Team using data to plan a political campaign"
            />
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container stack">
          <h2 className="section-title">What we deliver</h2>
          <div className="feature-grid feature-grid--equal" data-testid="services-card-grid">
            <Card title="Marked Register Processing">
              <p className="muted">
                Create your user and select the Marked Register subscription plan. You will be able to upload
                any Marked Register for your association/federation area. Once the .csv file is ready you will
                receive an email alerting you the CSV file is ready.
              </p>
              <div className="hero-actions" style={{ marginTop: 16 }}>
                <Button as={Link} to="/subscriptions" variant="primary">
                  View Marked Register plans
                </Button>
              </div>
            </Card>

            <Card title="Training & Support">
              <p className="muted">
                Various levels of consultancy help are available, from one-off sessions to ongoing remote support
                for your association/federation and candidates.
              </p>
              <div className="hero-actions" style={{ marginTop: 16 }}>
                <Button as={Link} to="/enquire" variant="secondary">
                  Discuss support needs
                </Button>
              </div>
            </Card>

            <Card title="Election & By-Election Support">
              <p className="muted">
                UK-wide planning, field operations support, volunteer training, and print or data operations
                coordination. This service is quoted and billed separately from subscriptions.
              </p>
              <div className="hero-actions" style={{ marginTop: 16 }}>
                <Button as={Link} to="/services/election-support" variant="secondary">
                  Request election support
                </Button>
              </div>
            </Card>
          </div>
          <div data-testid="services-compliance-note">
            <Card title="Compliance note" className="service-compliance-note">
              <p className="muted">
                Service packages provide capability, readiness, and operational tooling. Clients remain
                responsible for compliance with electoral law and regulated spending. We do not provide statutory
                electoral services.
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

      <Footer />
    </div>
  );
}
