import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import associations from "../data/associations.json";
import { submitEnquiry } from "../lib/enquiryApi.js";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import enquireIllustration from "../assets/enquire-illustration.png";

const SERVICE_OPTIONS = [
  "Marked Register Processing",
  "By-Election campaign consultancy",
  "General campaigning consultancy",
  "Automated content generation for literature",
  "Clerical services for your association/federation",
  "Anything else not listed?",
];

function buildOrganisationLine(organisation = "") {
  const trimmed = organisation.trim();
  return `Organisation: ${trimmed || "(not specified)"}`;
}

function buildRoleLine(role = "") {
  const trimmed = role.trim();
  return `Role: ${trimmed || "(not specified)"}`;
}

function buildServicesLine(selectedServices = []) {
  if (!selectedServices.length) {
    return "Services interested in: (not specified)";
  }
  return `Services interested in: ${selectedServices.join(", ")}`;
}

function buildEnquiryMessage({ message, organisation, role, selectedServices = [] }) {
  const trimmedMessage = message.trim();
  const organisationLine = buildOrganisationLine(organisation);
  const roleLine = buildRoleLine(role);
  const servicesLine = buildServicesLine(selectedServices);
  return `${trimmedMessage}\n\n${organisationLine}\n${roleLine}\n${servicesLine}`;
}

export function buildEnquiryMailto({ name, email, organisation, message, context, pageUrl }) {
  const trimmedOrganisation = organisation.trim();
  const subjectParts = [name || "Enquiry"];
  if (trimmedOrganisation) subjectParts.push(trimmedOrganisation);
  const subject = `Political Solutions enquiry - ${subjectParts.join(" / ")}`;

  const lines = [
    `Name: ${name}`,
    `Email: ${email}`,
    "",
    "Message:",
    message,
  ].filter(Boolean);

  if (context) {
    lines.push("", "Context:");
    if (context.constituencyCount) lines.push(`Constituency count: ${context.constituencyCount}`);
  }

  if (pageUrl) {
    lines.push("", `Page: ${pageUrl}`);
  }

  const params = new URLSearchParams({
    subject,
    body: lines.join("\n"),
  });

  return `mailto:paul@politicalsolutions.uk?${params.toString()}`;
}

export default function EnquirePage() {
  const [searchParams] = useSearchParams();
  const association = searchParams.get("association") ?? "";
  const constituency = searchParams.get("constituency") ?? "";
  const countParam = Number(searchParams.get("count") ?? 0);

  const constituencies = useMemo(() => {
    if (!association) return [];
    return associations.byAssociation[association] ?? [];
  }, [association]);

  const constituencyCount = constituencies.length || countParam;
  const hasContext = Boolean(association || constituency || constituencyCount);

  const [formValues, setFormValues] = useState({
    name: "",
    email: "",
    organisation: "",
    role: "",
    message: "",
  });
  const [selectedServices, setSelectedServices] = useState([]);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ success: false, requestId: "" });
  const [autoFallbackNote, setAutoFallbackNote] = useState("");
  const [rateLimitMessage, setRateLimitMessage] = useState("");
  const [manualMailto, setManualMailto] = useState("");

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
      if (checked) {
        return [...prev, value];
      }
      return prev.filter((service) => service !== value);
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
    setAutoFallbackNote("");
    setRateLimitMessage("");
    setManualMailto("");
    setStatus({ success: false, requestId: "" });

    const pageUrl = typeof window !== "undefined" ? window.location.href : "";
    const enquiryMessage = buildEnquiryMessage({
      message: formValues.message,
      organisation: formValues.organisation,
      role: formValues.role,
      selectedServices,
    });
    const context = hasContext
      ? {
          association,
          constituency,
          constituencyCount,
          constituencies,
        }
      : null;
    const payload = {
      ...formValues,
      message: enquiryMessage,
      context,
      pageUrl,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      timestampIso: new Date().toISOString(),
    };
    const mailto = buildEnquiryMailto({
      ...formValues,
      message: enquiryMessage,
      context,
      pageUrl,
    });

    const apiUrl = getRuntimeConfig().enquiryApiUrl;
    if (apiUrl) {
      try {
        const result = await submitEnquiry(apiUrl, payload);
        if (!result?.ok) {
          throw new Error("Enquiry API response not OK.");
        }
        setStatus({ success: true, requestId: result.requestId || "" });
        return;
      } catch (err) {
        const message = err?.message || "";
        const statusMatch = message.match(/\((\d{3})\)/);
        const statusCode = statusMatch ? Number(statusMatch[1]) : null;
        if (statusCode === 429) {
          setRateLimitMessage("Too many requests -- please wait a minute and try again.");
          setManualMailto(mailto);
          return;
        }
        setAutoFallbackNote("Automatic send isn't available right now -- opening your email client instead.");
      }
    }

    window.location.href = mailto;
  };

  return (
    <div className="page">
      <section className="section">
        <div className="container hero">
          <div>
            <h1>Enquire</h1>
            <p className="muted">
              Tell us what you need, who it is for, and which service you want to discuss. We use this to route
              the enquiry properly and confirm the next step quickly. If your request is urgent, say so clearly
              in the message box.
            </p>
          </div>
          <div className="hero-visual">
            <img
              className="hero-visual-image"
              src={enquireIllustration}
              alt="People submitting an enquiry to Political Solutions"
              width={1536}
              height={1024}
              loading="eager"
              decoding="async"
            />
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
                {!status.success && (
                  <span className="helper">
                    We will respond by email. Your email client may open to send this enquiry.
                  </span>
                )}
                {autoFallbackNote && <span className="helper">{autoFallbackNote}</span>}
                {rateLimitMessage && <div className="status">{rateLimitMessage}</div>}
                {rateLimitMessage && manualMailto && (
                  <a className="helper" href={manualMailto}>
                    Or email us directly instead.
                  </a>
                )}
                {status.success && (
                  <div className="status">
                    Enquiry sent. We will get back to you shortly.
                    {status.requestId && <div className="helper">Reference: {status.requestId}</div>}
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
