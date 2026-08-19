import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Footer from "../components/PublicFooter.jsx";

const evidenceAreas = [
  {
    number: "01",
    title: "Election history",
    body: "Review recorded election results and compare the electoral history held for a constituency.",
  },
  {
    number: "02",
    title: "Demographic context",
    body: "Use 2021 Census data alongside constituency election evidence.",
  },
  {
    number: "03",
    title: "Swing analysis",
    body: "Review recorded swing between election pairs and compare it with national context.",
  },
  {
    number: "04",
    title: "Vulnerability and party-specific threat",
    body:
      "Review vulnerability scores and Reform UK, Liberal Democrat and Green Party threat indices.",
  },
];

const evidenceSequence = [
  { label: "Election history", className: "intelligence-hero__bar-fill--history" },
  { label: "Demographic context", className: "intelligence-hero__bar-fill--demographic" },
  { label: "Swing analysis", className: "intelligence-hero__bar-fill--swing" },
  { label: "Vulnerability", className: "intelligence-hero__bar-fill--vulnerability" },
  { label: "Threat analysis", className: "intelligence-hero__bar-fill--threat" },
];

export default function ConstituencyIntelligence() {
  return (
    <div className="page product-page intelligence-page">
      <section
        className="product-section intelligence-hero-section"
        aria-labelledby="intelligence-hero-title"
      >
        <div className="container product-hero intelligence-hero">
          <div className="product-hero__copy">
            <p className="product-eyebrow">Constituency Intelligence</p>
            <h1 id="intelligence-hero-title">Know the ground before you plan the campaign</h1>
            <p className="product-hero__lead">
              Bring election history, demographics, swing analysis, vulnerability scores and
              party-specific threat indices into the decisions that shape your campaign.
            </p>
            <p className="product-hero__audience">
              For Conservative associations and campaign teams comparing the constituencies they
              are permitted to access.
            </p>
            <div className="product-actions">
              <Button
                as={Link}
                to="/enquire?service=constituency-intelligence"
                variant="primary"
              >
                Discuss your constituencies
              </Button>
              <Link className="product-text-link product-text-link--reversed" to="/services/election-support">
                Explore campaign support <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          <figure className="intelligence-hero__figure">
            <div
              className="intelligence-hero__plot"
              role="img"
              aria-label="Editorial summary of Constituency Intelligence evidence categories, not a product interface"
            >
              <div className="intelligence-hero__plot-head">
                <span>Evidence category</span>
                <span>Campaign context</span>
              </div>
              <ol>
                {evidenceSequence.map((item, index) => (
                  <li key={item.label}>
                    <span className="intelligence-hero__number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <strong>{item.label}</strong>
                    <span className="intelligence-hero__bar" aria-hidden="true">
                      <i className={item.className} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <figcaption>
              An editorial summary of evidence categories, not a product interface.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="product-section intelligence-evidence" aria-labelledby="intelligence-evidence-title">
        <div className="container">
          <header className="product-section-heading product-section-heading--wide">
            <p className="product-eyebrow">Evidence in the workspace</p>
            <h2 id="intelligence-evidence-title">Move from election history to campaign context</h2>
            <p>
              Start with recorded election results and demographic context, then review swing,
              vulnerability and party-specific threat analysis at constituency level.
            </p>
          </header>

          <ol className="intelligence-evidence__grid">
            {evidenceAreas.map((area) => (
              <li key={area.title}>
                <span aria-hidden="true">{area.number}</span>
                <h3>{area.title}</h3>
                <p>{area.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="product-section intelligence-role" aria-labelledby="intelligence-role-title">
        <div className="container intelligence-role__layout">
          <div className="intelligence-role__statement">
            <p className="product-eyebrow">Role in campaign work</p>
            <h2 id="intelligence-role-title">Evidence for the decisions made before polling day</h2>
          </div>
          <div className="intelligence-role__body">
            <p>
              Constituency Intelligence brings the constituency evidence held by Political
              Solutions into one workspace for planning and comparison. It supports campaign
              judgement; it does not replace separately scoped campaign management or promise an
              electoral outcome.
            </p>
          </div>
        </div>
      </section>

      <section className="product-section intelligence-access" aria-labelledby="intelligence-access-title">
        <div className="container intelligence-access__panel">
          <div>
            <p className="product-eyebrow">Access</p>
            <h2 id="intelligence-access-title">Access follows your organisation&apos;s permissions</h2>
          </div>
          <p>
            Portal access is tied to the user&apos;s organisation and permitted constituencies.
            Request a conversation to confirm coverage and onboarding for your team.
          </p>
        </div>
      </section>

      <section className="product-section product-closing" aria-labelledby="intelligence-closing-title">
        <div className="container product-closing__panel">
          <div>
            <p className="product-eyebrow">Next step</p>
            <h2 id="intelligence-closing-title">
              Discuss the constituencies that matter to your campaign
            </h2>
            <p>
              Tell us about your organisation, the relevant constituencies and who needs access. We
              will confirm the appropriate next step.
            </p>
          </div>
          <div className="product-actions product-closing__actions">
            <Button
              as={Link}
              to="/enquire?service=constituency-intelligence"
              variant="primary"
            >
              Discuss your constituencies
            </Button>
            <Link className="product-text-link" to="/services/election-support">
              Explore campaign support <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
