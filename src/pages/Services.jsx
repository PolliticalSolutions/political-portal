import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Footer from "../components/PublicFooter.jsx";
import { buildFaqSchema, buildServicesSchema } from "../seo/structuredData.js";

const serviceLines = [
  {
    number: "01",
    label: "Lead service",
    name: "Campaigning, Training & Election Support",
    description:
      "Bring Political Solutions into a defined campaign job or an ongoing working relationship for campaign management, strategy, candidate coaching, association support and agreed delivery work. Scope, timing and price are confirmed before work begins.",
    audience:
      "For Conservative associations, candidates, councillors, council groups and campaign teams that need hands-on support.",
    cta: "Explore campaign support",
    to: "/services/election-support",
  },
  {
    number: "02",
    label: "Evidence",
    name: "Constituency Intelligence",
    description:
      "Review election history, demographics, swing analysis, vulnerability scores and party-specific threat indices for the constituencies your organisation can access.",
    audience:
      "For associations and campaign teams comparing constituencies and planning from seat-level evidence.",
    cta: "Explore Constituency Intelligence",
    to: "/constituency-intelligence",
  },
  {
    number: "03",
    label: "Processing",
    name: "Marked Register Processing",
    description:
      "Submit marked-register files through the portal for processing, monitor the batch and download any released result from the same workflow.",
    audience:
      "For agents, association officers and campaign teams handling marked-register returns.",
    cta: "Enquire about processing",
    to: "/enquire?service=marked-register",
  },
];

const serviceBoundaries = [
  {
    title: "Campaign management and consultancy",
    body:
      "Campaigning, Training & Election Support is agreed directly with Political Solutions. It covers only the work, timing and responsibilities confirmed in the scope.",
  },
  {
    title: "Constituency evidence",
    body:
      "Constituency Intelligence provides election and demographic evidence for permitted constituencies. Access follows the user's organisation and permissions.",
  },
  {
    title: "Marked-register workflow",
    body:
      "Marked Register Processing handles file submission, processing status and any released result through the portal.",
  },
];

const SERVICE_FAQS = [
  {
    question: "Can Political Solutions support a campaign beyond the immediate election period?",
    answer:
      "Yes. Political Solutions offers retained campaign planning, data and standing strategic support across the electoral cycle. The scope and commercial terms are agreed separately.",
  },
  {
    question: "Is campaign support included in a platform subscription?",
    answer:
      "No. Campaigning, Training & Election Support is scoped and charged separately. Political Solutions confirms the work and price before delivery begins.",
  },
  {
    question: "Can every user view every constituency?",
    answer:
      "No. Portal access is tied to the user's organisation and the constituencies assigned through its permissions.",
  },
];

export default function Services() {
  return (
    <div className="page product-page services-page">
      <Helmet>
        {[buildServicesSchema(), buildFaqSchema(SERVICE_FAQS)].map((schema) => (
          <script key={schema["@type"]} type="application/ld+json">
            {JSON.stringify(schema)}
          </script>
        ))}
      </Helmet>

      <section className="product-section product-hero-section" aria-labelledby="services-hero-title">
        <div className="container product-hero services-hero">
          <div className="product-hero__copy">
            <p className="product-eyebrow">Campaign services</p>
            <h1 id="services-hero-title">Campaign support built on evidence, not assumption</h1>
            <p className="product-hero__lead">
              Political Solutions provides data-led campaign management and consultancy for
              Conservative associations, candidates, councillors and council groups. The offer
              brings together campaign planning and strategy, candidate coaching and association
              support, with constituency intelligence and marked-register processing available as
              distinct data capabilities.
            </p>
            <div className="product-actions">
              <Button as={Link} to="/enquire?service=election-support" variant="primary">
                Discuss your campaign
              </Button>
            </div>
          </div>

          <div className="services-hero__index" aria-hidden="true">
            <div className="services-hero__index-label">Political Solutions / service index</div>
            <ol>
              <li className="services-hero__index-item services-hero__index-item--lead">
                <span>01</span>
                <strong>Campaign support</strong>
                <small>Management · strategy · coaching</small>
              </li>
              <li className="services-hero__index-item">
                <span>02</span>
                <strong>Constituency evidence</strong>
                <small>History · context · threat</small>
              </li>
              <li className="services-hero__index-item">
                <span>03</span>
                <strong>Register workflow</strong>
                <small>Submit · process · release</small>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section className="product-section services-overview" aria-labelledby="services-overview-title">
        <div className="container">
          <header className="product-section-heading">
            <p className="product-eyebrow">The offer</p>
            <h2 id="services-overview-title">Start with the campaign job in front of you</h2>
          </header>

          <div className="services-list" data-testid="services-list">
            {serviceLines.map((service) => (
              <article className="services-list__item" key={service.name}>
                <div className="services-list__marker">
                  <span>{service.number}</span>
                  <small>{service.label}</small>
                </div>
                <div className="services-list__content">
                  <h3>{service.name}</h3>
                  <p>{service.description}</p>
                  <p className="services-list__audience">{service.audience}</p>
                </div>
                <Link className="product-text-link services-list__link" to={service.to}>
                  {service.cta} <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="product-section services-boundaries" aria-labelledby="services-boundaries-title">
        <div className="container services-boundaries__layout">
          <header className="product-section-heading">
            <p className="product-eyebrow">Clear boundaries</p>
            <h2 id="services-boundaries-title">Three distinct jobs, one evidence-led approach</h2>
          </header>

          <dl className="services-boundaries__list">
            {serviceBoundaries.map((boundary, index) => (
              <div key={boundary.title}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <dt>{boundary.title}</dt>
                <dd>{boundary.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="product-section services-faq" aria-labelledby="services-faq-title">
        <div className="container services-faq__layout">
          <header className="product-section-heading">
            <p className="product-eyebrow">Service questions</p>
            <h2 id="services-faq-title">What sits inside each engagement</h2>
          </header>

          <dl className="services-faq__list">
            {SERVICE_FAQS.map((faq) => (
              <div key={faq.question}>
                <dt>{faq.question}</dt>
                <dd>{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="product-section product-closing" aria-labelledby="services-closing-title">
        <div className="container product-closing__panel">
          <div>
            <p className="product-eyebrow">Next step</p>
            <h2 id="services-closing-title">Build the campaign before the final weeks</h2>
            <p>
              Tell us about the organisation, campaign or electoral challenge you are working on.
              We will confirm whether campaign support, constituency intelligence,
              marked-register processing or a combination is the right next step.
            </p>
          </div>
          <div className="product-actions product-closing__actions">
            <Button as={Link} to="/enquire?service=election-support" variant="primary">
              Discuss your campaign
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
