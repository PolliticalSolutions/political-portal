// Shared form for SessionCreate and SessionEdit. Single source of truth
// for field validation so create and edit cannot drift.

import { useEffect, useState } from "react";
import Button from "../Button.jsx";
import { supabase } from "../../lib/supabaseClient.js";
import { SESSION_TYPE_LABELS, SESSION_TYPE_ORDER } from "../../lib/campaignConfig.js";

const REQUIRED_KEYS = [
  "title", "session_type", "constituency_id", "association_id",
  "meeting_place", "session_date", "start_time", "duration_minutes",
  "contact_name", "contact_phone", "contact_email",
];

function validate(form) {
  const errors = {};
  for (const key of REQUIRED_KEYS) {
    if (form[key] === "" || form[key] == null) errors[key] = "Required";
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
    if (touched[key]) {
      setErrors(validate({ ...form, [key]: value }));
    }
  };

  const blur = (key) => () => {
    setTouched((prev) => ({ ...prev, [key]: true }));
    setErrors(validate(form));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    const validation = validate(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      setTouched(Object.fromEntries(REQUIRED_KEYS.map((k) => [k, true])));
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

      <div className="campaigns-form-grid">
        <div className="campaigns-form-row">
          <label htmlFor="session_type">Session type</label>
          <select id="session_type" value={form.session_type} onChange={(e) => setField("session_type", e.target.value)} onBlur={blur("session_type")} required>
            <option value="">Choose a type</option>
            {SESSION_TYPE_ORDER.map((t) => <option key={t} value={t}>{SESSION_TYPE_LABELS[t]}</option>)}
          </select>
          {touched.session_type && errors.session_type && <FieldError msg={errors.session_type} />}
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
        <label htmlFor="meeting_place">Meeting place</label>
        <input id="meeting_place" type="text" value={form.meeting_place} onChange={(e) => setField("meeting_place", e.target.value)} onBlur={blur("meeting_place")} required />
        {touched.meeting_place && errors.meeting_place && <FieldError msg={errors.meeting_place} />}
      </div>

      <div className="campaigns-form-grid">
        <div className="campaigns-form-row">
          <label htmlFor="session_date">Date</label>
          <input id="session_date" type="date" value={form.session_date} onChange={(e) => setField("session_date", e.target.value)} onBlur={blur("session_date")} required />
          {touched.session_date && errors.session_date && <FieldError msg={errors.session_date} />}
        </div>

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
          <input id="max_capacity" type="number" min="1" placeholder="Leave blank for unlimited" value={form.max_capacity ?? ""} onChange={(e) => setField("max_capacity", e.target.value)} />
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
    session_type: "",
    constituency_id: "",
    association_id: "",
    meeting_place: "",
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
  };
}

function serialise(form) {
  return {
    ...form,
    duration_minutes: Number(form.duration_minutes),
    max_capacity: form.max_capacity === "" || form.max_capacity == null ? null : Number(form.max_capacity),
    notes: form.notes && form.notes.trim() !== "" ? form.notes : null,
  };
}
