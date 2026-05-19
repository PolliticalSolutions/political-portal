import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { submitVolunteerSignup, checkMembership } from "../lib/volunteerApi.js";
import { JOIN_PARTY_URL, HEARD_VIA_LABELS } from "../lib/campaignConfig.js";
import { getRegionFromPostcode } from "../lib/postcodeRegions.js";

const HEARD_VIA_ORDER = ["association", "social_media", "friend", "email", "other"];

export default function VolunteerSignUpPage() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    postcode: "",
    membershipNumber: "",
    associationPreference: "",
    heardVia: "",
    consent: false,
  });
  const [touched, setTouched] = useState({});
  const [associations, setAssociations] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [membershipFeedback, setMembershipFeedback] = useState(null);

  useEffect(() => {
    supabase.from("associations").select("id, name, region").order("name").then(({ data }) => {
      setAssociations(data || []);
    });
  }, []);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleMembershipBlur = async () => {
    setTouched((t) => ({ ...t, membershipNumber: true }));
    const num = form.membershipNumber.trim().toUpperCase();
    if (!num) { setMembershipFeedback(null); return; }
    try {
      const { match } = await checkMembership(num);
      setMembershipFeedback(match ? "verified" : "unrecognised");
    } catch {
      setMembershipFeedback(null);
    }
  };

  const previewRegion = form.associationPreference
    ? (associations.find((a) => a.id === form.associationPreference) || {}).region
    : getRegionFromPostcode(form.postcode);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.firstName.trim() || !form.lastName.trim()) { setError("Enter your first and last name."); return; }
    if (!/.+@.+\..+/.test(form.email)) { setError("Enter a valid email address."); return; }
    if (!form.postcode.trim()) { setError("Postcode is required."); return; }
    if (!form.consent) { setError("Please consent to be contacted."); return; }

    setSubmitting(true);
    try {
      const out = await submitVolunteerSignup({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        postcode: form.postcode.trim().toUpperCase(),
        membershipNumber: form.membershipNumber.trim().toUpperCase() || undefined,
        associationPreference: form.associationPreference || undefined,
        heardVia: form.heardVia || undefined,
        consent: true,
      });
      setResult(out);
    } catch (err) {
      setError(err.message || "Sign-up failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) return <SuccessView result={result} firstName={form.firstName} />;

  return (
    <>
      <Helmet>
        <title>Become a Conservative campaign volunteer — Political Solutions</title>
        <meta name="description" content="Sign up to be invited to Conservative campaign sessions in your area. Canvassing, leafleting, phone banks, and more — no commitment, just an email when we need help." />
      </Helmet>

      <div className="container" style={{ padding: "var(--space-12) 0", maxWidth: 720 }}>
        <header style={{ marginBottom: "var(--space-8)" }}>
          <h1 style={{ margin: 0, fontSize: "var(--text-3xl)", fontWeight: 700, color: "var(--color-navy)", letterSpacing: "-0.02em" }}>
            Become a Conservative campaign volunteer
          </h1>
          <p style={{ margin: "var(--space-3) 0 0 0", color: "var(--color-text-secondary)", fontSize: "var(--text-md)", lineHeight: 1.6 }}>
            Sign up to be invited to campaign sessions in your area — canvassing, leafleting, phone banks, and committee-room shifts.
            We'll email you each Monday with what's coming up. No commitment.
          </p>
        </header>

        <Card>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <Field id="firstName" label="First name" required>
              <input id="firstName" type="text" value={form.firstName} onChange={(e) => setField("firstName", e.target.value)} required autoComplete="given-name" />
            </Field>
            <Field id="lastName" label="Last name" required>
              <input id="lastName" type="text" value={form.lastName} onChange={(e) => setField("lastName", e.target.value)} required autoComplete="family-name" />
            </Field>
            <Field id="email" label="Email address" required>
              <input id="email" type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} required autoComplete="email" />
            </Field>
            <Field id="phone" label="Phone (optional)">
              <input id="phone" type="tel" value={form.phone} onChange={(e) => setField("phone", e.target.value)} autoComplete="tel" />
            </Field>
            <Field id="postcode" label="Postcode" required help={previewRegion ? `We'll assign you to ${previewRegion}.` : null}>
              <input id="postcode" type="text" value={form.postcode} onChange={(e) => setField("postcode", e.target.value.toUpperCase())} onBlur={() => setTouched((t) => ({ ...t, postcode: true }))} required autoComplete="postal-code" />
            </Field>

            <Field
              id="membershipNumber"
              label="Conservative Party membership number (optional)"
              help="Enter your membership number for instant approval."
            >
              <input
                id="membershipNumber"
                type="text"
                value={form.membershipNumber}
                onChange={(e) => setField("membershipNumber", e.target.value.toUpperCase())}
                onBlur={handleMembershipBlur}
                placeholder="CON-XXXXXX"
                autoComplete="off"
              />
              {membershipFeedback === "verified" && (
                <p role="status" style={{ margin: "4px 0 0 0", color: "var(--color-cta)", fontSize: "var(--text-sm)" }}>
                  ✓ Membership verified — you'll be auto-approved.
                </p>
              )}
              {membershipFeedback === "unrecognised" && (
                <p style={{ margin: "4px 0 0 0", color: "var(--color-warning)", fontSize: "var(--text-sm)" }}>
                  We couldn't match this number, but you can still sign up — your application will go to manual review.
                </p>
              )}
              <p style={{ marginTop: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                Not a member yet?{" "}
                <a href={JOIN_PARTY_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-navy)", fontWeight: 600, textDecoration: "underline" }}>
                  Join the Conservative Party here.
                </a>
              </p>
            </Field>

            <Field id="associationPreference" label="Association preference (optional)">
              <select id="associationPreference" value={form.associationPreference} onChange={(e) => setField("associationPreference", e.target.value)}>
                <option value="">I'm not sure — assign me by postcode</option>
                {associations.map((a) => <option key={a.id} value={a.id}>{a.name}{a.region ? ` — ${a.region}` : ""}</option>)}
              </select>
            </Field>

            <Field id="heardVia" label="How did you hear about campaigning? (optional)">
              <select id="heardVia" value={form.heardVia} onChange={(e) => setField("heardVia", e.target.value)}>
                <option value="">Choose one</option>
                {HEARD_VIA_ORDER.map((k) => <option key={k} value={k}>{HEARD_VIA_LABELS[k]}</option>)}
              </select>
            </Field>

            <label style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) => setField("consent", e.target.checked)}
                required
                style={{ marginTop: 4 }}
              />
              <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>
                I agree to be contacted about campaign sessions in my area.
              </span>
            </label>

            {error && <p role="alert" style={{ color: "var(--color-danger)", margin: 0 }}>{error}</p>}

            <Button type="submit" loading={submitting}>
              Sign up
            </Button>
          </form>
        </Card>
      </div>
      <Footer />
    </>
  );
}

function Field({ id, label, required, help, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label htmlFor={id} style={{ fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>
        {label}{required && <span style={{ color: "var(--color-danger)", marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {help && <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-muted)" }}>{help}</p>}
    </div>
  );
}

function SuccessView({ result, firstName }) {
  const message = (() => {
    if (result.status === "approved") {
      return {
        title: "You're approved. Welcome to the campaign.",
        body: "Look out for an email this coming Monday listing upcoming sessions in your area.",
      };
    }
    if (result.region === "pending_region") {
      return {
        title: "Thanks — your sign-up is in.",
        body: "We've recorded your sign-up. A coordinator will assign you to an association shortly.",
      };
    }
    return {
      title: "Thanks for signing up.",
      body: "Your application is being reviewed. You'll receive an email confirming your status within a few days.",
    };
  })();

  return (
    <>
      <Helmet><title>You're signed up — Political Solutions</title></Helmet>
      <div className="container" style={{ padding: "var(--space-12) 0", maxWidth: 640 }}>
        <Card>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", color: "var(--color-navy)", letterSpacing: "-0.01em" }}>
            {message.title}
          </h1>
          <p style={{ marginTop: "var(--space-4)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
            Hi {firstName}, {message.body}
          </p>
        </Card>
      </div>
      <Footer />
    </>
  );
}
