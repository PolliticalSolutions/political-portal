import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import servicesCampaignDataImage from "../assets/services-campaign-data.png";
import servicesCampaignDataWebp from "../assets/services-campaign-data.webp";
import servicesCampaignDataMobileWebp from "../assets/services-campaign-data-mobile.webp";

export default function Services() {
  return (
    <div className="page">
      <section className="section">
        <div className="container hero">
          <div>
            <h1>Operational support for campaign teams that need clean delivery</h1>
            <p className="muted">
              Political Solutions provides three distinct products: Marked Register Processing, Constituency
              Intelligence, and Campaigning, Training & Election Support for teams that need practical delivery
              help alongside platform access.
            </p>
          </div>
          <div className="hero-visual services-hero-visual">
            <picture>
              <source
                type="image/webp"
                srcSet={`${servicesCampaignDataMobileWebp} 768w, ${servicesCampaignDataWebp} 1536w`}
                sizes="(max-width: 768px) 768px, 1536px"
              />
              <img
                className="hero-visual-image services-hero-image"
                src={servicesCampaignDataImage}
                alt="Team using data to plan a political campaign"
                width={1536}
                height={1024}
                loading="eager"
                decoding="async"
              />
            </picture>
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container stack">
          <h2 className="section-title">Choose the product that matches the job</h2>
          <div className="feature-grid feature-grid--equal" data-testid="services-card-grid">
            <Card title="Marked Register Processing" className="product-card">
              <div className="product-card__body">
                <p className="muted">
                  Upload marked register files through the portal and receive structured outputs your campaign
                  team can use for follow-up, planning, and reporting.
                </p>
                <p className="product-card__meta">
                  <strong>Who it is for:</strong> Associations, agents, candidates, and campaign teams handling
                  marked register returns.
                </p>
              </div>
              <div className="product-card__cta">
                <Button as={Link} to="/subscriptions" variant="primary">
                  View Marked Register plans
                </Button>
              </div>
            </Card>

            <Card title="Constituency Intelligence" className="product-card">
              <div className="product-card__body">
                <p className="muted">
                  Review constituency winners, demographics, and historic election results in one searchable
                  intelligence workspace.
                </p>
                <p className="product-card__meta">
                  <strong>Who it is for:</strong> Campaign planners, researchers, association officers, and
                  headquarters teams comparing seats.
                </p>
              </div>
              <div className="product-card__cta">
                <Button as={Link} to="/enquire" variant="primary">
                  Request a Constituency Intelligence briefing
                </Button>
              </div>
            </Card>

            <Card title="Campaigning, Training & Election Support" className="product-card">
              <div className="product-card__body">
                <p className="muted">
                  Bring in practical support for by-election planning, volunteer training, field operations, and
                  campaign delivery on a clearly scoped brief.
                </p>
                <p className="product-card__meta">
                  <strong>Who it is for:</strong> Candidates, agents, association teams, and campaigns that need
                  hands-on operational help.
                </p>
              </div>
              <div className="product-card__cta">
                <Button as={Link} to="/services/election-support" variant="primary">
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
