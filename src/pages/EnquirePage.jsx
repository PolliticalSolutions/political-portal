import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import associations from "../data/associations.json";
import { insertEnquiry } from "../lib/enquiriesApi.js";
import enquireIllustration from "../assets/enquire-illustration.png";
import enquireIllustrationWebp from "../assets/enquire-illustration.webp";
import enquireIllustrationMobileWebp from "../assets/enquire-illustration-mobile.webp";

const SERVICE_OPTIONS = [
  "Marked Register Processing",
  "Constituency Intelligence",
  "Campaigning, Training & Election Support",
  "General campaigning consultancy",
  "Automated content generation for literature",
  "Clerical services for your association/federation",
  "Anything else not listed?",
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
    if (!formValues.name.trim()) nextErrors.name = "Name is required.";
    if (!formValues.email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!formValues.email.includes("@")) {
      nextErrors.email = "Enter a valid email.";
    }
    if (!formValues.organisation.trim()) nextErrors.organisation = "Organisation is required.";
    if (!formValues.message.trim()) nextErrors.message = "Message is required.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    setSubmitted(false);
    setSubmitError(false);
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
    }
  };

  return (
    <div className="page">
      <section className="section">
        <div className="container hero">
          <div>
            <h1>Enquire About Campaign Data Services</h1>
            <p className="muted">
              Tell us what you need, who it is for, and which service you want to discuss. We use this to route
              the enquiry properly and confirm the next step quickly. If your request is urgent, say so clearly
              in the message box.
            </p>
          </div>
          <div className="hero-visual">
            <picture>
              <source
                type="image/webp"
                srcSet={`${enquireIllustrationMobileWebp} 768w, ${enquireIllustrationWebp} 1536w`}
                sizes="(max-width: 768px) 768px, 1536px"
              />
              <img
                className="hero-visual-image"
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

      <section className="section">
        <div className="container stack">
          <Card title="What happens next">
            <p className="muted">
              We review the enquiry, confirm whether it is for Marked Register Processing, Constituency
              Intelligence, Campaigning, Training & Election Support, or subscriptions, and then reply with the
              appropriate next step.
            </p>
          </Card>

          <Card>
            <form className="stack" onSubmit={handleSubmit} noValidate>
              <label className="field">
                <span>Name *</span>
                <input className="input" name="name" value={formValues.name} onChange={handleChange} />
                {errors.name && <span className="helper">{errors.name}</span>}
              </label>
              <label className="field">
                <span>Email *</span>
                <input
                  className="input"
                  name="email"
                  type="email"
                  value={formValues.email}
                  onChange={handleChange}
                />
                {errors.email && <span className="helper">{errors.email}</span>}
              </label>
              <label className="field">
                <span>Organisation *</span>
                <select
                  className="input"
                  name="organisation"
                  value={formValues.organisation}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select an organisation…</option>
                  {organisationOptions.map((organisation) => (
                    <option key={organisation} value={organisation}>
                      {organisation}
                    </option>
                  ))}
                </select>
                {errors.organisation && <span className="helper">{errors.organisation}</span>}
              </label>
              <fieldset className="field">
                <legend>Which services are you interested in?</legend>
                <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                  {SERVICE_OPTIONS.map((option) => (
                    <label key={option} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        name="servicesInterested"
                        value={option}
                        checked={selectedServices.includes(option)}
                        onChange={handleServiceToggle}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="field">
                <span>Your role in the Association/Federation/Area/Region</span>
                <input className="input" name="role" value={formValues.role} onChange={handleChange} />
              </label>
              <label className="field">
                <span>Message *</span>
                <textarea
                  className="input"
                  name="message"
                  rows={6}
                  value={formValues.message}
                  onChange={handleChange}
                />
                {errors.message && <span className="helper">{errors.message}</span>}
              </label>
              <div className="stack" style={{ gap: 6 }}>
                <Button type="submit" variant="primary">
                  Send enquiry
                </Button>
                {submitted && (
                  <div className="status">
                    Thank you — we&apos;ll be in touch within one working day.
                  </div>
                )}
                {submitError && (
                  <div className="status error">
                    Something went wrong. Please email{" "}
                    <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>{" "}
                    directly.
                  </div>
                )}
              </div>
            </form>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
}
