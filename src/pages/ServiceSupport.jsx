import { useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import { postServiceEnquiry } from "../lib/quoteApi.js";

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
  const [status, setStatus] = useState({ submitting: false, error: "", referenceId: "" });

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
    setStatus({ submitting: true, error: "", referenceId: "" });
    try {
      const result = await postServiceEnquiry({
        name: formValues.name.trim(),
        email: formValues.email.trim(),
        phone: formValues.phone.trim(),
        organisation: formValues.organisation.trim(),
        message: formValues.message.trim(),
        consent: formValues.consent,
      });
      setStatus({
        submitting: false,
        error: "",
        referenceId: result.referenceId || "",
      });
    } catch (error) {
      setStatus({
        submitting: false,
        error: "Unable to submit right now. Please try again shortly.",
        referenceId: "",
      });
    }
  };

  if (status.referenceId) {
    return (
      <div className="page stack">
        <Card>
          <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Request received</h1>
          <p className="muted">
            Thank you. We have received your enquiry and will be in touch shortly.
          </p>
          <div className="status" style={{ marginTop: 16 }}>
            Reference: {status.referenceId}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page stack">
      <section className="hero">
        <div>
          <h1>Request election & by-election support</h1>
          <p className="muted">
            This is a separate, chargeable service. Provide a brief outline and we will confirm scope and
            next steps.
          </p>
        </div>
      </section>

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
          {status.error && <div className="status error">{status.error}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button type="submit" variant="primary" loading={status.submitting}>
              Submit enquiry
            </Button>
            <Button as={Link} to="/services" variant="ghost">
              Back to services
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Compliance note">
        <p className="muted" style={{ margin: 0 }}>
          This service is separate from subscriptions. Clients remain responsible for compliance with
          electoral law and regulated spending. We do not provide statutory electoral services.
        </p>
      </Card>
    </div>
  );
}
