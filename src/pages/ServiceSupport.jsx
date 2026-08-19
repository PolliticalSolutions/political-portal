import { useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Footer from "../components/PublicFooter.jsx";
import { insertEnquiry } from "../lib/enquiriesApi.js";

const MAX_MESSAGE = 1000;

const supportAreas = [
  {
    number: "01",
    title: "Campaign management and strategy",
    body: "Agree the campaign objective, scope, responsibilities, timing and delivery requirements.",
  },
  {
    number: "02",
    title: "Candidate coaching",
    body: "Include candidate coaching where it forms part of the agreed campaign scope.",
  },
  {
    number: "03",
    title: "Association and council-group support",
    body:
      "Retained or defined support can cover campaign planning, data and standing strategic advice across the electoral cycle.",
  },
  {
    number: "04",
    title: "Officer mentoring and volunteer briefings",
    body:
      "Association-officer mentoring and volunteer briefings can be scoped around the people, purpose and practical information involved.",
  },
  {
    number: "05",
    title: "Data coordination",
    body: "Confirm the inputs, ownership and handovers required for the agreed work.",
  },
  {
    number: "06",
    title: "Print logistics and delivery oversight",
    body:
      "Define the materials, responsibilities and delivery checkpoints within the agreed scope.",
  },
];

const campaignCycle = [
  "Plan the work",
  "Coach the people",
  "Coordinate the inputs",
  "Oversee delivery",
];

export default function ServiceSupport() {
  const [formValues, setFormValues] = useState({
    name: "",
    email: "",
    phone: "",
    organisation: "",
    message: "",
    consent: false,
  });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ submitting: false, success: false, error: "" });

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!formValues.name.trim()) nextErrors.name = "Name is required.";
    if (!formValues.email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!formValues.email.includes("@")) {
      nextErrors.email = "Enter a valid email.";
    }
    if (formValues.message.length > MAX_MESSAGE) {
      nextErrors.message = "Message is too long.";
    }
    if (!formValues.consent) nextErrors.consent = "Consent is required.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setStatus({ submitting: true, success: false, error: "" });

    const messageWithPhone = formValues.phone.trim()
      ? `Phone: ${formValues.phone.trim()}\n\n${formValues.message.trim()}`
      : formValues.message.trim();

    try {
      await insertEnquiry({
        name: formValues.name.trim(),
        email: formValues.email.trim(),
        organisation: formValues.organisation.trim(),
        message: messageWithPhone,
      });
      setStatus({ submitting: false, success: true, error: "" });
    } catch {
      setStatus({
        submitting: false,
        success: false,
        error: "Something went wrong. Please email paul@politicalsolutions.uk directly.",
      });
    }
  };

  return (
    <div className="page product-page support-page">
      <section className="product-section product-hero-section" aria-labelledby="support-hero-title">
        <div className="container product-hero support-hero">
          <div className="product-hero__copy">
            <p className="product-eyebrow">Campaigning, Training &amp; Election Support</p>
            <h1 id="support-hero-title">Data-led campaign management across the electoral cycle</h1>
            <p className="product-hero__lead">
              Political Solutions works with Conservative associations, candidates, councillors
              and council groups on campaign planning and strategy, candidate coaching,
              association support and practical delivery.
            </p>
            <p className="product-hero__audience">
              For teams that want ongoing or defined support built on electoral evidence rather
              than assumption.
            </p>
            <div className="product-actions">
              <Link className="product-text-link" to="/enquire?service=election-support">
                Use the general enquiry form <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          <div className="support-hero__cycle" aria-label="Campaign support cycle">
            <p>Campaign support / working cycle</p>
            <ol>
              {campaignCycle.map((item, index) => (
                <li key={item}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item}</strong>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="product-section support-engagement" aria-labelledby="support-engagement-title">
        <div className="container">
          <div className="support-engagement__intro">
            <header className="product-section-heading">
              <p className="product-eyebrow">Engagement model</p>
              <h2 id="support-engagement-title">Support shaped around the campaign</h2>
            </header>
            <p>
              Support can be scoped for a defined campaign job or retained across the electoral
              cycle. Political Solutions confirms the organisation, relevant constituencies,
              requirements, timing, responsibilities and price before work begins.
            </p>
          </div>

          <ol className="support-areas">
            {supportAreas.map((area) => (
              <li key={area.title}>
                <span aria-hidden="true">{area.number}</span>
                <div>
                  <h3>{area.title}</h3>
                  <p>{area.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="product-section support-data" aria-labelledby="support-data-title">
        <div className="container support-data__layout">
          <div>
            <p className="product-eyebrow">Data relationship</p>
            <h2 id="support-data-title">Data underpins the work; the services remain distinct</h2>
          </div>
          <p>
            Political Solutions&apos; campaign work is informed by electoral data. Constituency
            Intelligence and Marked Register Processing remain distinct services with their own
            access, workflow and commercial arrangements; neither is automatically included in a
            campaign-support engagement.
          </p>
        </div>
      </section>

      <section className="product-section support-compliance" aria-labelledby="support-compliance-title">
        <div className="container support-compliance__layout">
          <h2 id="support-compliance-title">Client responsibilities remain with the campaign</h2>
          <p>
            Clients remain responsible for compliance with electoral law and regulated spending.
            Political Solutions does not provide statutory electoral services.
          </p>
        </div>
      </section>

      <section
        className="product-section support-enquiry"
        id="campaign-support-enquiry"
        aria-labelledby="support-enquiry-title"
      >
        <div className="container support-enquiry__layout">
          <div className="support-enquiry__intro">
            <p className="product-eyebrow">Campaign-support enquiry</p>
            <h2 id="support-enquiry-title">Tell us about the campaign</h2>
            <p>
              Give us enough detail to understand the organisation, electoral challenge and support
              you want to discuss. We will use your brief to confirm scope and next steps.
            </p>
          </div>

          <form className="support-form" onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="campaign-support-name">Name *</label>
              <input
                className="input"
                id="campaign-support-name"
                name="name"
                value={formValues.name}
                onChange={handleChange}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "campaign-support-name-error" : undefined}
              />
              {errors.name && (
                <span className="helper" id="campaign-support-name-error">
                  {errors.name}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="campaign-support-email">Email *</label>
              <input
                className="input"
                id="campaign-support-email"
                name="email"
                type="email"
                value={formValues.email}
                onChange={handleChange}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? "campaign-support-email-error" : undefined}
              />
              {errors.email && (
                <span className="helper" id="campaign-support-email-error">
                  {errors.email}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="campaign-support-phone">Phone</label>
              <input
                className="input"
                id="campaign-support-phone"
                name="phone"
                value={formValues.phone}
                onChange={handleChange}
              />
            </div>

            <div className="field">
              <label htmlFor="campaign-support-organisation">Organisation</label>
              <input
                className="input"
                id="campaign-support-organisation"
                name="organisation"
                value={formValues.organisation}
                onChange={handleChange}
              />
            </div>

            <div className="field support-form__brief">
              <label htmlFor="campaign-support-message">Campaign-support brief</label>
              <textarea
                className="input"
                id="campaign-support-message"
                name="message"
                rows={6}
                value={formValues.message}
                onChange={handleChange}
                aria-invalid={Boolean(errors.message)}
                aria-describedby={[
                  "campaign-support-message-help",
                  errors.message ? "campaign-support-message-error" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
              <span className="helper" id="campaign-support-message-help">
                Include the relevant constituencies, timing and work you want scoped.
              </span>
              {errors.message && (
                <span className="helper" id="campaign-support-message-error">
                  {errors.message}
                </span>
              )}
            </div>

            <div className="field support-form__consent">
              <span>Consent *</span>
              <label htmlFor="campaign-support-consent">
                <input
                  id="campaign-support-consent"
                  type="checkbox"
                  name="consent"
                  checked={formValues.consent}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.consent)}
                  aria-describedby={errors.consent ? "campaign-support-consent-error" : undefined}
                />
                <span>I agree to be contacted about this enquiry.</span>
              </label>
              {errors.consent && (
                <span className="helper" id="campaign-support-consent-error">
                  {errors.consent}
                </span>
              )}
            </div>

            <div className="support-form__actions">
              <Button type="submit" variant="primary" loading={status.submitting}>
                Send campaign-support enquiry
              </Button>
              <Link className="product-text-link" to="/enquire?service=election-support">
                Use the general enquiry form <span aria-hidden="true">→</span>
              </Link>
            </div>

            {status.success && (
              <div className="status support-form__status" role="status">
                Thank you. Your campaign-support enquiry has been sent.
              </div>
            )}
            {status.error && (
              <div className="status error support-form__status" role="alert">
                Something went wrong. Please email{" "}
                <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>{" "}
                directly.
              </div>
            )}
          </form>
        </div>
      </section>

      <Footer />
    </div>
  );
}
