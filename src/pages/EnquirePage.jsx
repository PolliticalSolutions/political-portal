import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import Footer from "../components/PublicFooter.jsx";
import associations from "../data/associations.json";
import { insertEnquiry } from "../lib/enquiriesApi.js";
import enquireIllustration from "../assets/enquire-illustration.png";
import enquireIllustrationWebp from "../assets/enquire-illustration.webp";
import enquireIllustrationMobileWebp from "../assets/enquire-illustration-mobile.webp";

const SERVICE_OPTIONS = [
  {
    label: "Campaigning, Training & Election Support",
    value: "Campaigning, Training & Election Support",
  },
  { label: "Constituency Intelligence", value: "Constituency Intelligence" },
  { label: "Marked Register Processing", value: "Marked Register Processing" },
  { label: "General campaigning consultancy", value: "General campaigning consultancy" },
  {
    label: "Automated content generation for literature",
    value: "Automated content generation for literature",
  },
  {
    label: "Clerical services for your association or federation",
    value: "Clerical services for your association/federation",
  },
  { label: "Something else", value: "Anything else not listed?" },
];

const SERVICE_PARAM_MAP = {
  "constituency-intelligence": { service: "Constituency Intelligence" },
  "marked-register": { service: "Marked Register Processing" },
  "election-support": { service: "Campaigning, Training & Election Support" },
  "platform-briefing": { message: "I'd like to request a platform briefing." },
};

export default function EnquirePage() {
  const [searchParams] = useSearchParams();
  const preset = SERVICE_PARAM_MAP[searchParams.get("service")] ?? {};

  const [formValues, setFormValues] = useState({
    name: "",
    email: "",
    organisation: "",
    role: "",
    message: preset.message ?? "",
  });
  const [selectedServices, setSelectedServices] = useState(
    preset.service ? [preset.service] : []
  );
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const organisationOptions = useMemo(
    () => Object.keys(associations.byAssociation ?? {}).sort(),
    []
  );

  const handleServiceToggle = (event) => {
    const { checked, value } = event.target;
    setSelectedServices((prev) => {
      if (checked) return [...prev, value];
      return prev.filter((s) => s !== value);
    });
  };

  const validate = () => {
    const nextErrors = {};
    if (!formValues.name.trim()) nextErrors.name = "Enter your name.";
    if (!formValues.email.trim()) {
      nextErrors.email = "Enter your email address.";
    } else if (!formValues.email.includes("@")) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!formValues.organisation.trim()) nextErrors.organisation = "Select an organisation.";
    if (!formValues.message.trim()) nextErrors.message = "Enter a message.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitted(false);
    setSubmitError(false);
    setSubmitting(true);
    try {
      await insertEnquiry({
        name: formValues.name.trim(),
        email: formValues.email.trim(),
        organisation: formValues.organisation.trim(),
        services_interested: selectedServices,
        role: formValues.role.trim(),
        message: formValues.message.trim(),
      });
      setSubmitted(true);
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page conversion-page enquire-page">
      <section className="conversion-hero-section">
        <div className="container conversion-hero conversion-hero--enquire">
          <div className="conversion-hero__copy">
            <p className="conversion-eyebrow">Contact Political Solutions</p>
            <h1>Discuss your campaign, data or support needs</h1>
            <p className="conversion-hero__lead">
              Tell us about the organisation, campaign job or data requirement you want to discuss. Choose any
              relevant services and include the context Political Solutions should review.
            </p>
          </div>
          <div className="conversion-hero__media">
            <picture>
              <source
                type="image/webp"
                srcSet={`${enquireIllustrationMobileWebp} 768w, ${enquireIllustrationWebp} 1536w`}
                sizes="(max-width: 768px) 768px, 1536px"
              />
              <img
                className="conversion-hero__image"
                src={enquireIllustration}
                alt="People submitting an enquiry to Political Solutions"
                width={1536}
                height={1024}
                loading="eager"
                decoding="async"
              />
            </picture>
          </div>
        </div>
      </section>

      <section className="conversion-section conversion-section--form">
        <div className="container conversion-form-layout">
          <div className="conversion-form-intro">
            <p className="conversion-eyebrow">Your brief</p>
            <h2>Send a useful brief</h2>
            <p>
              Your enquiry is recorded with the contact details, organisation, service interests and message
              you provide. Political Solutions can then use that information to follow up on the appropriate
              next step.
            </p>
          </div>

          <form className="conversion-form enquiry-form" onSubmit={handleSubmit} noValidate>
              <div className="field">
                <label htmlFor="enquiry-name">Name *</label>
                <input
                  id="enquiry-name"
                  className="input"
                  name="name"
                  value={formValues.name}
                  onChange={handleChange}
                  autoComplete="name"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? "enquiry-name-error" : undefined}
                />
                {errors.name && <span className="helper helper--error" id="enquiry-name-error">{errors.name}</span>}
              </div>
              <div className="field">
                <label htmlFor="enquiry-email">Email *</label>
                <input
                  id="enquiry-email"
                  className="input"
                  name="email"
                  type="email"
                  value={formValues.email}
                  onChange={handleChange}
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={`enquiry-email-help${errors.email ? " enquiry-email-error" : ""}`}
                />
                <span className="helper" id="enquiry-email-help">
                  Use the address Political Solutions should reply to.
                </span>
                {errors.email && <span className="helper helper--error" id="enquiry-email-error">{errors.email}</span>}
              </div>
              <div className="field">
                <label htmlFor="enquiry-organisation">Organisation *</label>
                <select
                  id="enquiry-organisation"
                  className="input"
                  name="organisation"
                  value={formValues.organisation}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.organisation)}
                  aria-describedby={errors.organisation ? "enquiry-organisation-error" : undefined}
                >
                  <option value="">Select an organisation</option>
                  {organisationOptions.map((organisation) => (
                    <option key={organisation} value={organisation}>
                      {organisation}
                    </option>
                  ))}
                </select>
                {errors.organisation && (
                  <span className="helper helper--error" id="enquiry-organisation-error">
                    {errors.organisation}
                  </span>
                )}
              </div>
              <fieldset className="field enquiry-form__services">
                <legend>What would you like to discuss?</legend>
                <p className="helper">Select all that apply. You can also explain the requirement in your message.</p>
                <div className="enquiry-service-grid">
                  {SERVICE_OPTIONS.map((option) => (
                    <label key={option.value} className="enquiry-service-option">
                      <input
                        type="checkbox"
                        name="servicesInterested"
                        value={option.value}
                        checked={selectedServices.includes(option.value)}
                        onChange={handleServiceToggle}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="field">
                <label htmlFor="enquiry-role">Your role</label>
                <input
                  id="enquiry-role"
                  className="input"
                  name="role"
                  value={formValues.role}
                  onChange={handleChange}
                  autoComplete="organization-title"
                  aria-describedby="enquiry-role-help"
                />
                <span className="helper" id="enquiry-role-help">
                  Optional. For example, agent, candidate, officer or campaign manager.
                </span>
              </div>
              <div className="field enquiry-form__message">
                <label htmlFor="enquiry-message">What would you like to discuss? *</label>
                <textarea
                  id="enquiry-message"
                  className="input"
                  name="message"
                  rows={6}
                  value={formValues.message}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors.message)}
                  aria-describedby={`enquiry-message-help${errors.message ? " enquiry-message-error" : ""}`}
                />
                <span className="helper" id="enquiry-message-help">
                  Include the relevant campaign, constituencies, timing and the decision or work you need support with.
                </span>
                {errors.message && <span className="helper helper--error" id="enquiry-message-error">{errors.message}</span>}
              </div>
              <div className="enquiry-form__actions">
                <Button type="submit" variant="cta" loading={submitting} disabled={submitting}>
                  {submitting ? "Sending enquiry…" : submitError ? "Try again" : "Send enquiry"}
                </Button>
                {submitted && (
                  <div className="status success" role="status" aria-live="polite">
                    Thank you. Your enquiry has been submitted.
                  </div>
                )}
                {submitError && (
                  <div className="status error" role="alert">
                    We couldn&apos;t send your enquiry. Please try again or email{" "}
                    <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>{" "}
                    directly.
                  </div>
                )}
              </div>
            </form>
        </div>
      </section>

      <Footer />
    </div>
  );
}
