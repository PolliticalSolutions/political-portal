// Shared form for SessionCreate and SessionEdit. Single source of truth
// for field validation so create and edit cannot drift.

import { useEffect, useState } from "react";
import Button from "../Button.jsx";
import { supabase } from "../../lib/supabaseClient.js";
import { SESSION_TYPE_LABELS, SESSION_TYPE_ORDER, SESSION_TYPE_COLOURS, CAMPAIGN_CONTEXT_LABELS, CAMPAIGN_CONTEXT_ORDER } from "../../lib/campaignConfig.js";
import { validateAndGeocodePostcode } from "../../lib/postcodeGeocoding.js";

const REQUIRED_TEXT_KEYS = [
  "title", "constituency_id", "association_id", "campaign_context",
  "street_address", "postcode",
  "session_date", "start_time", "duration_minutes",
  "contact_name", "contact_phone", "contact_email",
];

function validate(form) {
  const errors = {};
  for (const key of REQUIRED_TEXT_KEYS) {
    if (form[key] === "" || form[key] == null) errors[key] = "Required";
  }
  if (!Array.isArray(form.session_types) || form.session_types.length === 0) {
    errors.session_types = "Tick at least one session type";
  }
  if (form.contact_email && !/.+@.+\..+/.test(form.contact_email)) {
    errors.contact_email = "Enter a valid email address";
  }
  if (form.duration_minutes && (isNaN(form.duration_minutes) || form.duration_minutes <= 0)) {
    errors.duration_minutes = "Must be a positive number";
  }
  if (form.max_capacity !== "" && form.max_capacity != null && form.max_capacity !== undefined) {
    const n = Number(form.max_capacity);
    if (isNaN(n) || n <= 0) errors.max_capacity = "Leave blank or enter a positive number";
  }
  return errors;
}

export default function SessionForm({ initial, associations, onSubmit, submitting, submitLabel = "Save" }) {
  const [form, setForm] = useState(() => normalise(initial));
  const [touched, setTouched] = useState({});
  const [constituencies, setConstituencies] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [postcodeStatus, setPostcodeStatus] = useState(null); // null | "checking" | "valid" | "invalid"

  useEffect(() => {
    if (!form.association_id) {
      setConstituencies([]);
      return;
    }
    let cancelled = false;
    supabase
      .from("association_constituencies")
      .select("constituency_id, constituencies(id, name, ons_code)")
      .eq("association_id", form.association_id)
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setConstituencies((data || []).map((row) => row.constituencies).filter(Boolean));
      });
    return () => { cancelled = true; };
  }, [form.association_id]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (touched[key]) setErrors(validate({ ...form, [key]: value }));
  };

  const toggleType = (t) => {
    setForm((prev) => {
      const has = prev.session_types.includes(t);
      const next = has ? prev.session_types.filter((x) => x !== t) : [...prev.session_types, t];
      return { ...prev, session_types: next };
    });
    setTouched((prev) => ({ ...prev, session_types: true }));
  };

  const blur = (key) => () => {
    setTouched((prev) => ({ ...prev, [key]: true }));
    setErrors(validate(form));
  };

  const handlePostcodeBlur = async () => {
    blur("postcode")();
    if (!form.postcode || !form.postcode.trim()) { setPostcodeStatus(null); return; }
    setPostcodeStatus("checking");
    const result = await validateAndGeocodePostcode(form.postcode);
    if (result.valid) {
      setForm((prev) => ({ ...prev, latitude: result.lat, longitude: result.lon }));
      setPostcodeStatus("valid");
    } else {
      setForm((prev) => ({ ...prev, latitude: null, longitude: null }));
      setPostcodeStatus("invalid");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    const validation = validate(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      setTouched(Object.fromEntries([...REQUIRED_TEXT_KEYS, "session_types"].map((k) => [k, true])));
      return;
    }
    try {
      await onSubmit(serialise(form));
    } catch (err) {
      setSubmitError(err.message || "Save failed.");
    }
  };

  return (
    <form className="campaigns-form" onSubmit={handleSubmit}>
      <div className="campaigns-form-row">
        <label htmlFor="title">Title</label>
        <input id="title" type="text" value={form.title} onChange={(e) => setField("title", e.target.value)} onBlur={blur("title")} required />
        {touched.title && errors.title && <FieldError msg={errors.title} />}
      </div>

      <fieldset className="campaigns-form-row" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: "var(--text-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--portal-text-secondary)", padding: 0 }}>
          Session type(s) — tick all that apply
        </legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "var(--space-2)", marginTop: 4 }}>
          {SESSION_TYPE_ORDER.map((t) => (
            <label key={t} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", padding: "var(--space-2)", border: "1px solid var(--portal-border)", borderRadius: 3, background: form.session_types.includes(t) ? "var(--portal-surface-raised)" : "transparent" }}>
              <input type="checkbox" checked={form.session_types.includes(t)} onChange={() => toggleType(t)} />
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: SESSION_TYPE_COLOURS[t], flexShrink: 0 }} />
              <span style={{ fontSize: "var(--text-sm)" }}>{SESSION_TYPE_LABELS[t]}</span>
            </label>
          ))}
        </div>
        {touched.session_types && errors.session_types && <FieldError msg={errors.session_types} />}
      </fieldset>

      <div className="campaigns-form-grid">
        <div className="campaigns-form-row">
          <label htmlFor="campaign_context">Campaign context</label>
          <select id="campaign_context" value={form.campaign_context} onChange={(e) => setField("campaign_context", e.target.value)} onBlur={blur("campaign_context")} required>
            <option value="">What's this session for?</option>
            {CAMPAIGN_CONTEXT_ORDER.map((c) => <option key={c} value={c}>{CAMPAIGN_CONTEXT_LABELS[c]}</option>)}
          </select>
          {touched.campaign_context && errors.campaign_context && <FieldError msg={errors.campaign_context} />}
        </div>

        <div className="campaigns-form-row">
          <label htmlFor="status">Status</label>
          <select id="status" value={form.status} onChange={(e) => setField("status", e.target.value)}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
      </div>

      <div className="campaigns-form-grid">
        <div className="campaigns-form-row">
          <label htmlFor="association_id">Association</label>
          <select id="association_id" value={form.association_id} onChange={(e) => { setField("association_id", e.target.value); setField("constituency_id", ""); }} onBlur={blur("association_id")} required>
            <option value="">Choose an association</option>
            {associations.map((a) => <option key={a.id} value={a.id}>{a.name}{a.region ? ` — ${a.region}` : ""}</option>)}
          </select>
          {touched.association_id && errors.association_id && <FieldError msg={errors.association_id} />}
        </div>

        <div className="campaigns-form-row">
          <label htmlFor="constituency_id">Constituency</label>
          <select id="constituency_id" value={form.constituency_id} onChange={(e) => setField("constituency_id", e.target.value)} onBlur={blur("constituency_id")} disabled={constituencies.length === 0} required>
            <option value="">{form.association_id ? "Choose a constituency" : "Pick an association first"}</option>
            {constituencies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {touched.constituency_id && errors.constituency_id && <FieldError msg={errors.constituency_id} />}
        </div>
      </div>

      <div className="campaigns-form-row">
        <label htmlFor="venue_name">Venue name (optional)</label>
        <input id="venue_name" type="text" value={form.venue_name} onChange={(e) => setField("venue_name", e.target.value)} placeholder="e.g. Volunteer HQ" />
      </div>

      <div className="campaigns-form-row">
        <label htmlFor="street_address">Street address</label>
        <textarea id="street_address" rows={2} value={form.street_address} onChange={(e) => setField("street_address", e.target.value)} onBlur={blur("street_address")} placeholder="House number, street, town" required />
        {touched.street_address && errors.street_address && <FieldError msg={errors.street_address} />}
      </div>

      <div className="campaigns-form-grid">
        <div className="campaigns-form-row">
          <label htmlFor="postcode">Postcode</label>
          <input
            id="postcode"
            type="text"
            value={form.postcode}
            onChange={(e) => { setField("postcode", e.target.value.toUpperCase()); setPostcodeStatus(null); }}
            onBlur={handlePostcodeBlur}
            placeholder="e.g. SW1A 1AA"
            required
            style={{ maxWidth: 200, textTransform: "uppercase" }}
          />
          {postcodeStatus === "checking" && <span style={{ fontSize: "var(--text-xs)", color: "var(--portal-text-muted)" }}>Checking…</span>}
          {postcodeStatus === "valid" && <span style={{ fontSize: "var(--text-xs)", color: "var(--portal-success)" }}>✓ Postcode verified</span>}
          {postcodeStatus === "invalid" && <span style={{ fontSize: "var(--text-xs)", color: "var(--portal-danger)" }}>We couldn't verify that postcode</span>}
          {touched.postcode && errors.postcode && <FieldError msg={errors.postcode} />}
        </div>

        <div className="campaigns-form-row">
          <label htmlFor="session_date">Date</label>
          <input id="session_date" type="date" value={form.session_date} onChange={(e) => setField("session_date", e.target.value)} onBlur={blur("session_date")} required />
          {touched.session_date && errors.session_date && <FieldError msg={errors.session_date} />}
        </div>
      </div>

      <div className="campaigns-form-grid">
        <div className="campaigns-form-row">
          <label htmlFor="start_time">Start time</label>
          <input id="start_time" type="time" value={form.start_time} onChange={(e) => setField("start_time", e.target.value)} onBlur={blur("start_time")} required />
          {touched.start_time && errors.start_time && <FieldError msg={errors.start_time} />}
        </div>

        <div className="campaigns-form-row">
          <label htmlFor="duration_minutes">Duration (minutes)</label>
          <input id="duration_minutes" type="number" min="1" value={form.duration_minutes} onChange={(e) => setField("duration_minutes", e.target.value)} onBlur={blur("duration_minutes")} required />
          {touched.duration_minutes && errors.duration_minutes && <FieldError msg={errors.duration_minutes} />}
        </div>

        <div className="campaigns-form-row">
          <label htmlFor="max_capacity">Capacity (optional)</label>
          <input id="max_capacity" type="number" min="1" placeholder="Blank = unlimited" value={form.max_capacity ?? ""} onChange={(e) => setField("max_capacity", e.target.value)} />
          {touched.max_capacity && errors.max_capacity && <FieldError msg={errors.max_capacity} />}
        </div>
      </div>

      <div className="campaigns-form-grid">
        <div className="campaigns-form-row">
          <label htmlFor="contact_name">Contact name</label>
          <input id="contact_name" type="text" value={form.contact_name} onChange={(e) => setField("contact_name", e.target.value)} onBlur={blur("contact_name")} required />
          {touched.contact_name && errors.contact_name && <FieldError msg={errors.contact_name} />}
        </div>

        <div className="campaigns-form-row">
          <label htmlFor="contact_phone">Contact phone</label>
          <input id="contact_phone" type="tel" value={form.contact_phone} onChange={(e) => setField("contact_phone", e.target.value)} onBlur={blur("contact_phone")} required />
          {touched.contact_phone && errors.contact_phone && <FieldError msg={errors.contact_phone} />}
        </div>
      </div>

      <div className="campaigns-form-row">
        <label htmlFor="contact_email">Contact email</label>
        <input id="contact_email" type="email" value={form.contact_email} onChange={(e) => setField("contact_email", e.target.value)} onBlur={blur("contact_email")} required />
        {touched.contact_email && errors.contact_email && <FieldError msg={errors.contact_email} />}
      </div>

      <div className="campaigns-form-row">
        <label htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" rows={4} value={form.notes || ""} onChange={(e) => setField("notes", e.target.value)} />
      </div>

      {submitError && <p role="alert" style={{ color: "var(--portal-danger)" }}>{submitError}</p>}

      <Button type="submit" loading={submitting}>{submitLabel}</Button>
    </form>
  );
}

function FieldError({ msg }) {
  return <span style={{ color: "var(--portal-danger)", fontSize: "var(--text-xs)" }}>{msg}</span>;
}

function normalise(initial) {
  return {
    title: "",
    session_types: [],
    campaign_context: "",
    constituency_id: "",
    association_id: "",
    venue_name: "",
    street_address: "",
    postcode: "",
    latitude: null,
    longitude: null,
    session_date: "",
    start_time: "",
    duration_minutes: "",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    max_capacity: "",
    notes: "",
    status: "draft",
    ...(initial || {}),
    // Ensure session_types is always an array even if initial passes a string.
    session_types: Array.isArray(initial?.session_types)
      ? initial.session_types
      : (initial?.session_type ? [initial.session_type] : []),
  };
}

function serialise(form) {
  return {
    ...form,
    duration_minutes: Number(form.duration_minutes),
    max_capacity: form.max_capacity === "" || form.max_capacity == null ? null : Number(form.max_capacity),
    notes: form.notes && form.notes.trim() !== "" ? form.notes : null,
    venue_name: form.venue_name && form.venue_name.trim() !== "" ? form.venue_name.trim() : null,
    postcode: form.postcode ? form.postcode.toUpperCase().trim() : null,
  };
}
