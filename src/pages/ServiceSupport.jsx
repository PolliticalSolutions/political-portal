import { useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import { insertEnquiry } from "../lib/enquiriesApi.js";
import logo from "../assets/brand/political-solutions-logo.png";

const MAX_MESSAGE = 1000;

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
    <div className="page">
      <section className="section">
        <div className="container hero">
          <div>
            <h1>Request election & by-election support</h1>
            <p className="muted">
              This is a separate, chargeable service. Provide a brief outline and we will confirm scope,
              timelines, and next steps.
            </p>
            <div className="hero-actions">
              <Button as={Link} to="/services" variant="secondary">
                Back to services
              </Button>
              <Button as={Link} to="/subscriptions" variant="ghost">
                View subscriptions
              </Button>
            </div>
          </div>
          <div
            className="hero-visual"
            aria-hidden="true"
            style={{ background: "#0a3b7c", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, minHeight: 180 }}
          >
            <img src={logo} alt="" style={{ maxWidth: 160, opacity: 0.9 }} />
          </div>
        </div>
      </section>

      <section className="section muted">
        <div className="container grid">
          <Card title="What we can support">
            <div className="stack" style={{ gap: 8 }}>
              <p className="muted" style={{ margin: 0 }}>
                UK-wide campaign operations support that may include planning, volunteer briefing, data
                coordination, print logistics, and delivery oversight.
              </p>
              <p className="muted" style={{ margin: 0 }}>
                We will confirm scope and pricing before any work starts. Election and by-election support is
                not included in subscription capability tiers.
              </p>
            </div>
          </Card>
          <Card title="Compliance note">
            <p className="muted" style={{ margin: 0 }}>
              This service is separate from subscriptions. Clients remain responsible for compliance with
              electoral law and regulated spending. We do not provide statutory electoral services.
            </p>
          </Card>
        </div>
      </section>

      <section className="section">
        <div className="container">
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
                <span>Phone</span>
                <input className="input" name="phone" value={formValues.phone} onChange={handleChange} />
              </label>
              <label className="field">
                <span>Organisation</span>
                <input
                  className="input"
                  name="organisation"
                  value={formValues.organisation}
                  onChange={handleChange}
                />
              </label>
              <label className="field">
                <span>Message</span>
                <textarea
                  className="input"
                  name="message"
                  rows={5}
                  value={formValues.message}
                  onChange={handleChange}
                />
                {errors.message && <span className="helper">{errors.message}</span>}
              </label>
              <label className="field">
                <span style={{ fontWeight: 600 }}>Consent *</span>
                <label className="muted" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    name="consent"
                    checked={formValues.consent}
                    onChange={handleChange}
                  />
                  I agree to be contacted about this enquiry.
                </label>
                {errors.consent && <span className="helper">{errors.consent}</span>}
              </label>
              <div className="stack" style={{ gap: 6 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button type="submit" variant="primary" loading={status.submitting}>
                    Submit enquiry
                  </Button>
                  <Button as={Link} to="/services" variant="ghost">
                    Back to services
                  </Button>
                </div>
                {status.success && (
                  <div className="status">
                    Thank you — we&apos;ll be in touch within one working day.
                  </div>
                )}
                {status.error && (
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
