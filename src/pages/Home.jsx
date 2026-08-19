import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Footer from "../components/PublicFooter.jsx";
import heroImage from "../assets/homepage/home-hero.webp";
import heroImageMobile from "../assets/homepage/home-hero-mobile.webp";
import experienceImage from "../assets/homepage/home-experience.webp";
import experienceImageMobile from "../assets/homepage/home-experience-mobile.webp";

const products = [
  {
    number: "01",
    name: "Marked Register Processing",
    description:
      "Upload marked-register PDF or CSV files through the portal. Political Solutions processes them and supplies the result as a CSV download.",
    audience: "For agents, association officers and teams handling marked-register returns.",
    cta: "View subscription pricing",
    to: "/subscribe",
    className: "home-product home-product--register",
  },
  {
    number: "02",
    name: "Constituency Intelligence",
    description:
      "Review election results, demographics, swing analysis, vulnerability scores and party-specific threat indices in one constituency intelligence workspace.",
    audience:
      "For campaign managers, researchers, association officers and headquarters teams comparing seats.",
    cta: "Explore Constituency Intelligence",
    to: "/constituency-intelligence",
    className: "home-product home-product--intelligence",
  },
  {
    number: "03",
    name: "Campaigning, Training & Election Support",
    description:
      "Request separately scoped support for campaign planning, volunteer briefings, data coordination, print logistics and delivery oversight.",
    audience:
      "For candidates, agents and association teams that need hands-on operational support.",
    cta: "Discuss campaign support",
    to: "/enquire?service=election-support",
    className: "home-product home-product--support",
  },
];

const intelligenceEvidence = [
  "Election history",
  "Demographic context",
  "Swing analysis",
  "Vulnerability",
  "Threat analysis",
];

const proofPoints = [
  {
    label: "Portal workflow",
    body: "Marked-register files are uploaded and Constituency Intelligence is accessed through the platform.",
  },
  {
    label: "Permission-based access",
    body: "Portal access is tied to user and constituency permissions.",
  },
  {
    label: "Separately scoped support",
    body: "Campaign support is agreed and charged separately from platform subscriptions.",
  },
];

const processSteps = [
  {
    title: "Identify the work",
    body: "Decide whether you need a processed marked register, constituency evidence or hands-on campaign support.",
  },
  {
    title: "Choose the route",
    body: "Subscribe online for Marked Register Processing. Request a briefing for Constituency Intelligence. Submit a brief for campaign support.",
  },
  {
    title: "Confirm the detail",
    body: "Confirm the organisation, relevant constituencies, access requirements and any work that needs a separate scope.",
  },
];

export default function Home() {
  return (
    <div className="page home-page">
      <section className="home-section home-hero-section" aria-labelledby="home-hero-title">
        <div className="container home-hero">
          <div className="home-hero__copy">
            <h1 id="home-hero-title">Political data for campaign decisions</h1>
            <p className="home-hero__lead">
              Process marked registers, review constituency intelligence and request practical
              campaign support through three distinct Political Solutions products.
            </p>
            <div className="home-actions">
              <Button
                as={Link}
                to="/enquire?service=platform-briefing"
                variant="primary"
              >
                Request a briefing
              </Button>
              <Link className="home-text-link" to="/services">
                View products <span aria-hidden="true">→</span>
              </Link>
            </div>
            <p className="home-hero__audience">
              For Conservative associations, campaign managers, agents and MPs&apos; offices.
            </p>
          </div>

          <div className="home-hero__media">
            <picture>
              <source media="(max-width: 720px)" srcSet={heroImageMobile} />
              <img
                src={heroImage}
                alt="Overhead view of fictional marked-register sheets, a navy folder, metal clip and blue pencil on an off-white work surface."
                width="1536"
                height="1024"
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            </picture>
          </div>
        </div>
      </section>

      <section className="home-section home-products" aria-labelledby="home-products-title">
        <div className="container">
          <div className="home-section-heading">
            <h2 id="home-products-title">Choose the product that matches the job</h2>
            <p>Each product has a defined purpose and a clear next step.</p>
          </div>

          <div className="home-products__grid">
            {products.map((product) => (
              <article className={product.className} key={product.name}>
                <span className="home-product__number" aria-hidden="true">
                  {product.number}
                </span>
                <div className="home-product__content">
                  <h3>{product.name}</h3>
                  <p className="home-product__description">{product.description}</p>
                  <p className="home-product__audience">{product.audience}</p>
                  <Link className="home-product__link" to={product.to}>
                    {product.cta} <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section home-intelligence" aria-labelledby="home-intelligence-title">
        <div className="container home-intelligence__layout">
          <div className="home-intelligence__copy">
            <h2 id="home-intelligence-title">Constituency evidence in one workspace</h2>
            <p>
              Move from election history and demographic context to swing, vulnerability and threat
              analysis at constituency level.
            </p>
          </div>

          <figure className="home-intelligence__figure">
            <ol
              className="home-intelligence__sequence"
              aria-label="Editorial summary of Constituency Intelligence evidence categories; not a product interface"
            >
              {intelligenceEvidence.map((item, index) => (
                <li key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item}</strong>
                </li>
              ))}
            </ol>
            <figcaption>Constituency Intelligence in the Political Solutions portal.</figcaption>
          </figure>
        </div>
      </section>

      <section className="home-section home-experience" aria-labelledby="home-experience-title">
        <div className="container home-experience__layout">
          <div className="home-experience__media">
            <picture>
              <source media="(max-width: 720px)" srcSet={experienceImageMobile} />
              <img
                src={experienceImage}
                alt="Close overhead view of a worn clipboard holding fictional register sheets with a navy pen, binder clips and blue tab on a deep-navy surface."
                width="1536"
                height="1024"
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>

          <div className="home-experience__copy">
            <div className="home-section-heading">
              <h2 id="home-experience-title">Built for controlled campaign work</h2>
              <p>
                Political Solutions is designed for Conservative associations, campaign managers
                and MPs&apos; offices.
              </p>
            </div>

            <dl className="home-proof-points">
              {proofPoints.map((point) => (
                <div key={point.label}>
                  <dt>{point.label}</dt>
                  <dd>{point.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="home-section home-process" aria-labelledby="home-process-title">
        <div className="container">
          <div className="home-section-heading home-section-heading--wide">
            <h2 id="home-process-title">Start with the job in front of you</h2>
          </div>

          <ol className="home-process__steps">
            {processSteps.map((step, index) => (
              <li key={step.title}>
                <span className="home-process__number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="home-section home-closing" aria-labelledby="home-closing-title">
        <div className="container home-closing__panel">
          <div>
            <h2 id="home-closing-title">Not sure which product fits the job?</h2>
            <p>
              Tell us what you need. We will route your enquiry to the right product and confirm the
              next step.
            </p>
          </div>
          <div className="home-actions home-closing__actions">
            <Button
              as={Link}
              to="/enquire?service=platform-briefing"
              variant="primary"
            >
              Request a briefing
            </Button>
            <Link className="home-text-link" to="/services">
              View products <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
