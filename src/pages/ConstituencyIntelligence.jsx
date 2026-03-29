import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import logo from "../assets/brand/political-solutions-logo.png";

export default function ConstituencyIntelligence() {
  return (
    <div className="page">
      <section className="section">
        <div className="container hero">
          <div>
            <h1>Constituency Intelligence</h1>
            <p className="muted">
              Current data on every Conservative-held and target seat — built for associations and campaign
              managers
            </p>
            <div className="hero-actions">
              <Button as={Link} to="/enquire?service=constituency-intelligence" variant="primary">
                Request a briefing
              </Button>
              <Button as={Link} to="/services" variant="secondary">
                Back to services
              </Button>
            </div>
          </div>
          <div
            className="hero-visual"
            aria-hidden="true"
            style={{
              background: "#0a3b7c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              minHeight: 180,
            }}
          >
            <img src={logo} alt="" style={{ maxWidth: 160, opacity: 0.9 }} />
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container stack">
          <h2 className="section-title">What Constituency Intelligence covers</h2>
          <div className="grid">
            <Card title="Council composition data">
              <p className="muted">
                Up-to-date council control, ward-level results, and political balance for every local authority
                in England and Wales. Track which councils have changed hands, which are under no overall
                control, and how your target seats sit within their local government context.
              </p>
            </Card>
            <Card title="By-election tracking">
              <p className="muted">
                Monitor parliamentary and local by-elections as they are called and completed. Constituency
                Intelligence captures swing data, turnout changes, and vote share shifts so associations and
                campaign managers can assess risk and opportunity in real time.
              </p>
            </Card>
            <Card title="Electoral history">
              <p className="muted">
                Full general election results going back multiple cycles for every constituency, presented
                alongside demographic context and current incumbency data. Compare seats, identify trends, and
                brief candidates with accurate historical baselines.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container grid">
          <Card title="Who it is for">
            <div className="stack" style={{ gap: 8 }}>
              <p className="muted" style={{ margin: 0 }}>
                Campaign planners, researchers, association officers, and headquarters teams who need reliable
                seat-level data without building their own research function.
              </p>
              <p className="muted" style={{ margin: 0 }}>
                Access is provided through the Political Solutions portal on a subscription basis. Contact us
                to confirm whether your association is covered and discuss onboarding.
              </p>
            </div>
          </Card>
          <Card title="Compliance note">
            <p className="muted" style={{ margin: 0 }}>
              Constituency Intelligence draws on publicly available electoral data and council records.
              Clients remain responsible for how they use data outputs in their own campaign operations and
              regulated spending decisions.
            </p>
          </Card>
        </div>
      </section>

      <section className="section">
        <div className="container cta-section">
          <div>
            <h2>Ready to see what Constituency Intelligence covers for your seats?</h2>
          </div>
          <div className="hero-actions">
            <Button as={Link} to="/enquire?service=constituency-intelligence" variant="primary">
              Request a briefing
            </Button>
            <Button as={Link} to="/services" variant="secondary">
              View all services
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
