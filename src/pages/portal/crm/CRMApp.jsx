import { useState, useEffect, useCallback } from "react";
import {
  getDashboardSummary,
  getContacts, getContact, createContact, updateContact,
  getOrganisations, createOrganisation,
  getOpportunities, createOpportunity, updateOpportunity,
  getTasks, createTask, updateTask,
  getProjects, createProject,
  createNote, createInteraction,
} from "../../../lib/crmApi.js";

// ============================================================================
// CONSTANTS
// ============================================================================

const PIPELINE_STAGES = [
  "Identified", "First_contact", "Demo_booked", "Proposal_sent",
  "Negotiating", "Won", "Lost", "Parked",
];

const CONTACT_TYPES = [
  "Conservative_MP", "Conservative_Councillor", "Conservative_Candidate",
  "Association_Officer", "Agent", "Donor", "Vendor", "Media", "Staff", "Other",
];

const RELATIONSHIP_LEVELS = ["Hot", "Warm", "Cold", "Unknown"];
const INFLUENCE_LEVELS = ["Very_High", "High", "Medium", "Low"];
const TASK_STATUSES = ["To_do", "In_progress", "Waiting", "Complete", "Dropped"];
const PROJECT_STATUSES = ["Idea", "Planning", "Active", "On_hold", "Complete", "Archived"];
const NOTE_COLOURS = { Warning: "#ef4444", Action_Followup: "#f59e0b", Action_Execute: "#22c55e", General_Note: "#3b82f6" };

// ============================================================================
// HELPERS
// ============================================================================

function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function currency(val) {
  if (val == null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(val);
}

function fullName(c) {
  if (!c) return "Unknown";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unknown";
}

// ============================================================================
// SHARED UI PRIMITIVES
// ============================================================================

function Badge({ children, color = "#64748b" }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4,
      background: color + "22", color, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function Pill({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 12px", borderRadius: 20, border: "1px solid",
        borderColor: active ? "var(--accent, #2563eb)" : "var(--border, #e2e8f0)",
        background: active ? "var(--accent, #2563eb)" : "transparent",
        color: active ? "#fff" : "inherit",
        fontSize: 13, cursor: "pointer", fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({ ...props }) {
  return (
    <input
      style={{ padding: "6px 10px", border: "1px solid var(--border, #e2e8f0)", borderRadius: 6, fontSize: 14, width: "100%", boxSizing: "border-box" }}
      {...props}
    />
  );
}

function Select({ children, ...props }) {
  return (
    <select
      style={{ padding: "6px 10px", border: "1px solid var(--border, #e2e8f0)", borderRadius: 6, fontSize: 14, width: "100%", boxSizing: "border-box" }}
      {...props}
    >
      {children}
    </select>
  );
}

function Btn({ children, variant = "primary", onClick, type = "button", disabled, style = {} }) {
  const base = {
    padding: "7px 16px", borderRadius: 6, border: "none", cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 14, fontWeight: 600, opacity: disabled ? 0.6 : 1, ...style,
  };
  const styles = {
    primary: { background: "var(--accent, #2563eb)", color: "#fff" },
    secondary: { background: "transparent", border: "1px solid var(--border, #e2e8f0)", color: "inherit" },
    danger: { background: "#ef4444", color: "#fff" },
    ghost: { background: "transparent", color: "var(--accent, #2563eb)", padding: "4px 8px" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...styles[variant] }}>
      {children}
    </button>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "var(--surface, #fff)", borderRadius: 10, padding: 24, width: "100%",
        maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <Btn variant="ghost" onClick={onClose}>✕</Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return <p style={{ color: "var(--muted, #64748b)", textAlign: "center", padding: "40px 0" }}>{message}</p>;
}

function ErrorMsg({ msg }) {
  return msg ? <p style={{ color: "#ef4444", margin: "8px 0", fontSize: 13 }}>{msg}</p> : null;
}

// ============================================================================
// DASHBOARD VIEW
// ============================================================================

function DashboardView({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    getDashboardSummary()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="muted">Loading dashboard…</p>;
  if (error) return <p style={{ color: "#ef4444" }}>Error: {error}</p>;
  if (!data) return null;

  const totalPipeline = data.pipeline.reduce((s, r) => s + r.total_value, 0);

  return (
    <div className="stack">
      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {[
          { label: "Follow-ups today", value: data.todays_followups.length, color: "#f59e0b", action: () => onNavigate("contacts") },
          { label: "Overdue tasks", value: data.overdue_tasks.length, color: "#ef4444", action: () => onNavigate("tasks") },
          { label: "Hot leads", value: data.hot_leads.length, color: "#8b5cf6", action: () => onNavigate("opportunities") },
          { label: "Active projects", value: data.active_projects.length, color: "#22c55e", action: () => onNavigate("projects") },
          { label: "Pipeline value", value: currency(totalPipeline), color: "#2563eb", action: () => onNavigate("opportunities") },
        ].map(({ label, value, color, action }) => (
          <button
            key={label}
            type="button"
            onClick={action}
            style={{
              background: color + "11", border: `1px solid ${color}33`, borderRadius: 8,
              padding: 16, textAlign: "left", cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 13, color: "var(--muted, #64748b)", marginTop: 4 }}>{label}</div>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Follow-ups today */}
        <div className="card">
          <h4 style={{ margin: "0 0 12px" }}>Follow-ups today</h4>
          {data.todays_followups.length === 0
            ? <EmptyState message="Nothing due today" />
            : data.todays_followups.map((c) => (
              <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                <strong>{fullName(c)}</strong>
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted, #64748b)" }}>{c.contact_type}</span>
              </div>
            ))}
        </div>

        {/* Overdue tasks */}
        <div className="card">
          <h4 style={{ margin: "0 0 12px" }}>Overdue tasks</h4>
          {data.overdue_tasks.length === 0
            ? <EmptyState message="No overdue tasks" />
            : data.overdue_tasks.slice(0, 8).map((t) => (
              <div key={t.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                <span style={{ color: "#ef4444", marginRight: 6 }}>⚠</span>
                <strong style={{ fontSize: 14 }}>{t.title}</strong>
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted, #64748b)" }}>{fmt(t.due_date)}</span>
              </div>
            ))}
        </div>

        {/* Pipeline */}
        <div className="card">
          <h4 style={{ margin: "0 0 12px" }}>Pipeline</h4>
          {data.pipeline.length === 0
            ? <EmptyState message="No open opportunities" />
            : data.pipeline.map((row) => (
              <div key={row.stage} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border, #e2e8f0)", fontSize: 14 }}>
                <span>{row.stage.replace(/_/g, " ")}</span>
                <span style={{ fontWeight: 600 }}>{currency(row.total_value)} <span style={{ fontWeight: 400, color: "var(--muted, #64748b)" }}>({row.count})</span></span>
              </div>
            ))}
        </div>

        {/* Active projects */}
        <div className="card">
          <h4 style={{ margin: "0 0 12px" }}>Active projects</h4>
          {data.active_projects.length === 0
            ? <EmptyState message="No active projects" />
            : data.active_projects.map((p) => (
              <div key={p.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                <strong style={{ fontSize: 14 }}>{p.name}</strong>
                <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted, #64748b)" }}>{p.project_type?.replace(/_/g, " ")}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CONTACTS VIEW
// ============================================================================

function ContactsView() {
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [relFilter, setRelFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [organisations, setOrganisations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", contact_type: "Other", influence_level: "Medium", relationship_strength: "Cold", current_organisation_id: "", next_followup: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { contacts: data } = await getContacts({ search, contactType: typeFilter, relationship: relFilter });
      setContacts(data);
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, relFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getOrganisations({ limit: 200 }).then(setOrganisations).catch(() => {});
  }, []);

  const openContact = async (id) => {
    try {
      const c = await getContact(id);
      setSelected(c);
    } catch { /* ignore */ }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setErr("");
    if (!form.first_name && !form.last_name) { setErr("Name required"); return; }
    setSaving(true);
    try {
      await createContact({ ...form, current_organisation_id: form.current_organisation_id || null });
      setShowCreate(false);
      setForm({ first_name: "", last_name: "", email: "", phone: "", contact_type: "Other", influence_level: "Medium", relationship_strength: "Cold", current_organisation_id: "", next_followup: "" });
      load();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const relColor = { Hot: "#ef4444", Warm: "#f59e0b", Cold: "#3b82f6", Unknown: "#94a3b8" };

  return (
    <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1fr" : "1fr", gap: 16 }}>
      {/* List panel */}
      <div className="stack">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input placeholder="Search name / email…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: "auto" }}>
            <option value="">All types</option>
            {CONTACT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </Select>
          <Select value={relFilter} onChange={(e) => setRelFilter(e.target.value)} style={{ width: "auto" }}>
            <option value="">All relationships</option>
            {RELATIONSHIP_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
          <Btn onClick={() => setShowCreate(true)}>+ New</Btn>
        </div>

        {loading
          ? <p className="muted">Loading…</p>
          : contacts.length === 0
            ? <EmptyState message="No contacts found" />
            : (
              <div style={{ border: "1px solid var(--border, #e2e8f0)", borderRadius: 8, overflow: "hidden" }}>
                {contacts.map((c, i) => (
                  <div
                    key={c.id}
                    onClick={() => openContact(c.id)}
                    style={{
                      padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                      borderBottom: i < contacts.length - 1 ? "1px solid var(--border, #e2e8f0)" : "none",
                      background: selected?.id === c.id ? "var(--accent-subtle, #eff6ff)" : "transparent",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{fullName(c)}</div>
                      <div style={{ fontSize: 12, color: "var(--muted, #64748b)" }}>{c.contact_type?.replace(/_/g, " ")} {c.crm_organisations?.name ? `· ${c.crm_organisations.name}` : ""}</div>
                    </div>
                    <Badge color={relColor[c.relationship_strength] || "#94a3b8"}>{c.relationship_strength}</Badge>
                    {c.next_followup && <span style={{ fontSize: 11, color: "#f59e0b" }}>📅 {fmt(c.next_followup)}</span>}
                  </div>
                ))}
              </div>
            )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="card stack" style={{ alignSelf: "start" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h3 style={{ margin: 0 }}>{fullName(selected)}</h3>
              <p className="muted" style={{ margin: "4px 0 0" }}>{selected.contact_type?.replace(/_/g, " ")}</p>
            </div>
            <Btn variant="ghost" onClick={() => setSelected(null)}>✕</Btn>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 14 }}>
            {selected.email && <span>✉ {selected.email}</span>}
            {selected.phone && <span>📞 {selected.phone}</span>}
            {selected.crm_organisations?.name && <span>🏢 {selected.crm_organisations.name}</span>}
            {selected.next_followup && <span style={{ color: "#f59e0b" }}>📅 Follow up {fmt(selected.next_followup)}</span>}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Badge color={relColor[selected.relationship_strength]}>{selected.relationship_strength}</Badge>
            <Badge color="#8b5cf6">{selected.influence_level}</Badge>
          </div>

          {/* Opportunities */}
          {selected.opportunities?.length > 0 && (
            <div>
              <h4 style={{ margin: "0 0 8px" }}>Opportunities</h4>
              {selected.opportunities.map((o) => (
                <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border, #e2e8f0)", fontSize: 13 }}>
                  <span>{o.title}</span>
                  <span style={{ fontWeight: 600 }}>{o.stage?.replace(/_/g, " ")} {o.estimated_value ? `· ${currency(o.estimated_value)}` : ""}</span>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {selected.notes?.length > 0 && (
            <div>
              <h4 style={{ margin: "0 0 8px" }}>Notes</h4>
              {selected.notes.map((n) => (
                <div key={n.id} style={{ padding: 8, borderRadius: 6, marginBottom: 6, background: (NOTE_COLOURS[n.note_type] || "#3b82f6") + "11", borderLeft: `3px solid ${NOTE_COLOURS[n.note_type] || "#3b82f6"}`, fontSize: 13 }}>
                  {n.content}
                  <div style={{ fontSize: 11, color: "var(--muted, #64748b)", marginTop: 4 }}>{fmt(n.created_at)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Interactions */}
          {selected.interactions?.length > 0 && (
            <div>
              <h4 style={{ margin: "0 0 8px" }}>Interactions</h4>
              {selected.interactions.map((i) => (
                <div key={i.id} style={{ fontSize: 13, padding: "5px 0", borderBottom: "1px solid var(--border, #e2e8f0)" }}>
                  <strong>{i.interaction_type}</strong> — {i.summary || "No summary"} <span style={{ color: "var(--muted, #64748b)" }}>{fmt(i.interaction_date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <Modal title="New contact" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="stack">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="First name"><Input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} /></Field>
              <Field label="Last name"><Input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} /></Field>
            </div>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
            <Field label="Contact type">
              <Select value={form.contact_type} onChange={(e) => setForm((f) => ({ ...f, contact_type: e.target.value }))}>
                {CONTACT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </Select>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Relationship">
                <Select value={form.relationship_strength} onChange={(e) => setForm((f) => ({ ...f, relationship_strength: e.target.value }))}>
                  {RELATIONSHIP_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="Influence">
                <Select value={form.influence_level} onChange={(e) => setForm((f) => ({ ...f, influence_level: e.target.value }))}>
                  {INFLUENCE_LEVELS.map((l) => <option key={l} value={l}>{l.replace(/_/g, " ")}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Organisation">
              <Select value={form.current_organisation_id} onChange={(e) => setForm((f) => ({ ...f, current_organisation_id: e.target.value }))}>
                <option value="">None</option>
                {organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
            <Field label="Next follow-up">
              <Input type="date" value={form.next_followup} onChange={(e) => setForm((f) => ({ ...f, next_followup: e.target.value }))} />
            </Field>
            <ErrorMsg msg={err} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Btn>
              <Btn type="submit" disabled={saving}>{saving ? "Saving…" : "Create contact"}</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// OPPORTUNITIES VIEW
// ============================================================================

function OpportunitiesView() {
  const [opps, setOpps] = useState([]);
  const [stageFilter, setStageFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [organisations, setOrganisations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ title: "", contact_id: "", organisation_id: "", service_type: "Other", stage: "Identified", estimated_value: "", expected_close_date: "", probability_percent: 50 });

  const load = useCallback(async () => {
    setLoading(true);
    try { setOpps(await getOpportunities({ stage: stageFilter })); }
    finally { setLoading(false); }
  }, [stageFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getContacts({ limit: 200 }).then(({ contacts: c }) => setContacts(c)).catch(() => {});
    getOrganisations({ limit: 200 }).then(setOrganisations).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setErr("");
    if (!form.title || !form.contact_id) { setErr("Title and contact required"); return; }
    setSaving(true);
    try {
      await createOpportunity({ ...form, estimated_value: form.estimated_value ? Number(form.estimated_value) : null, organisation_id: form.organisation_id || null });
      setShowCreate(false);
      setForm({ title: "", contact_id: "", organisation_id: "", service_type: "Other", stage: "Identified", estimated_value: "", expected_close_date: "", probability_percent: 50 });
      load();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const moveStage = async (opp, stage) => {
    try {
      await updateOpportunity(opp.id, { stage });
      setOpps((prev) => prev.map((o) => o.id === opp.id ? { ...o, stage } : o));
    } catch { /* ignore */ }
  };

  const stageColor = { Won: "#22c55e", Lost: "#ef4444", Parked: "#94a3b8" };

  return (
    <div className="stack">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={{ width: "auto" }}>
          <option value="">All stages</option>
          {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </Select>
        <Btn onClick={() => setShowCreate(true)}>+ New opportunity</Btn>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted, #64748b)" }}>
          {opps.length} opportunities · {currency(opps.reduce((s, o) => s + Number(o.estimated_value || 0), 0))} total
        </span>
      </div>

      {loading ? <p className="muted">Loading…</p> : opps.length === 0 ? <EmptyState message="No opportunities" /> : (
        <div style={{ border: "1px solid var(--border, #e2e8f0)", borderRadius: 8, overflow: "hidden" }}>
          {opps.map((o, i) => (
            <div key={o.id} style={{ padding: "12px 16px", borderBottom: i < opps.length - 1 ? "1px solid var(--border, #e2e8f0)" : "none", display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{o.title}</div>
                <div style={{ fontSize: 12, color: "var(--muted, #64748b)" }}>
                  {o.crm_contacts ? fullName(o.crm_contacts) : "—"}
                  {o.crm_organisations?.name ? ` · ${o.crm_organisations.name}` : ""}
                  {o.expected_close_date ? ` · Close ${fmt(o.expected_close_date)}` : ""}
                </div>
              </div>
              {o.estimated_value && <span style={{ fontWeight: 700 }}>{currency(o.estimated_value)}</span>}
              <Badge color={stageColor[o.stage] || "#6366f1"}>{o.stage?.replace(/_/g, " ")}</Badge>
              <Select
                value={o.stage}
                onChange={(e) => moveStage(o, e.target.value)}
                style={{ width: "auto", fontSize: 12 }}
              >
                {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </Select>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal title="New opportunity" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="stack">
            <Field label="Title"><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></Field>
            <Field label="Contact">
              <Select value={form.contact_id} onChange={(e) => setForm((f) => ({ ...f, contact_id: e.target.value }))}>
                <option value="">Select contact</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
              </Select>
            </Field>
            <Field label="Organisation">
              <Select value={form.organisation_id} onChange={(e) => setForm((f) => ({ ...f, organisation_id: e.target.value }))}>
                <option value="">None</option>
                {organisations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Stage">
                <Select value={form.stage} onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}>
                  {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </Select>
              </Field>
              <Field label="Value (£)">
                <Input type="number" value={form.estimated_value} onChange={(e) => setForm((f) => ({ ...f, estimated_value: e.target.value }))} />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Close date"><Input type="date" value={form.expected_close_date} onChange={(e) => setForm((f) => ({ ...f, expected_close_date: e.target.value }))} /></Field>
              <Field label="Probability %"><Input type="number" min={0} max={100} value={form.probability_percent} onChange={(e) => setForm((f) => ({ ...f, probability_percent: e.target.value }))} /></Field>
            </div>
            <ErrorMsg msg={err} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Btn>
              <Btn type="submit" disabled={saving}>{saving ? "Saving…" : "Create"}</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// TASKS VIEW
// ============================================================================

function TasksView() {
  const [tasks, setTasks] = useState([]);
  const [statusFilter, setStatusFilter] = useState("To_do");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ title: "", description: "", status: "To_do", priority: 2, due_date: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try { setTasks(await getTasks({ status: overdueOnly ? "" : statusFilter, overdueOnly })); }
    finally { setLoading(false); }
  }, [statusFilter, overdueOnly]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (task) => {
    const next = task.status === "Complete" ? "To_do" : "Complete";
    try {
      await updateTask(task.id, { status: next });
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: next } : t));
    } catch { /* ignore */ }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setErr("");
    if (!form.title) { setErr("Title required"); return; }
    setSaving(true);
    try {
      await createTask(form);
      setShowCreate(false);
      setForm({ title: "", description: "", status: "To_do", priority: 2, due_date: "" });
      load();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const priorityLabel = (p) => ["", "Critical", "High", "Normal", "Low"][p] || "Normal";
  const priorityColor = (p) => ["", "#ef4444", "#f59e0b", "#3b82f6", "#94a3b8"][p] || "#3b82f6";

  return (
    <div className="stack">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {TASK_STATUSES.map((s) => (
          <Pill key={s} label={s.replace(/_/g, " ")} active={!overdueOnly && statusFilter === s} onClick={() => { setOverdueOnly(false); setStatusFilter(s); }} />
        ))}
        <Pill label="Overdue" active={overdueOnly} onClick={() => setOverdueOnly((v) => !v)} />
        <Btn onClick={() => setShowCreate(true)} style={{ marginLeft: "auto" }}>+ New task</Btn>
      </div>

      {loading ? <p className="muted">Loading…</p> : tasks.length === 0 ? <EmptyState message="No tasks" /> : (
        <div style={{ border: "1px solid var(--border, #e2e8f0)", borderRadius: 8, overflow: "hidden" }}>
          {tasks.map((t, i) => (
            <div key={t.id} style={{ padding: "10px 14px", borderBottom: i < tasks.length - 1 ? "1px solid var(--border, #e2e8f0)" : "none", display: "flex", gap: 10, alignItems: "center" }}>
              <input type="checkbox" checked={t.status === "Complete"} onChange={() => toggle(t)} style={{ cursor: "pointer" }} />
              <div style={{ flex: 1, textDecoration: t.status === "Complete" ? "line-through" : "none", color: t.status === "Complete" ? "var(--muted, #64748b)" : "inherit" }}>
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                {t.description && <div style={{ fontSize: 12, color: "var(--muted, #64748b)" }}>{t.description}</div>}
              </div>
              <Badge color={priorityColor(t.priority)}>{priorityLabel(t.priority)}</Badge>
              {t.due_date && (
                <span style={{ fontSize: 12, color: t.due_date < new Date().toISOString().slice(0, 10) ? "#ef4444" : "var(--muted, #64748b)" }}>
                  {fmt(t.due_date)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal title="New task" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="stack">
            <Field label="Title"><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></Field>
            <Field label="Description"><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Priority">
                <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}>
                  <option value={1}>Critical</option>
                  <option value={2}>High</option>
                  <option value={3}>Normal</option>
                  <option value={4}>Low</option>
                </Select>
              </Field>
              <Field label="Due date"><Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} /></Field>
            </div>
            <ErrorMsg msg={err} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Btn>
              <Btn type="submit" disabled={saving}>{saving ? "Saving…" : "Create task"}</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// PROJECTS VIEW
// ============================================================================

function ProjectsView() {
  const [projects, setProjects] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", project_type: "Admin_Ops", status: "Idea", description: "" });

  const PROJECT_TYPES = ["Campaign", "Admin_Ops", "Outreach", "Data", "Event", "Research", "Other"];

  const load = useCallback(async () => {
    setLoading(true);
    try { setProjects(await getProjects({ status: statusFilter })); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setErr("");
    if (!form.name) { setErr("Name required"); return; }
    setSaving(true);
    try {
      await createProject(form);
      setShowCreate(false);
      setForm({ name: "", project_type: "Admin_Ops", status: "Idea", description: "" });
      load();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const statusColor = { Active: "#22c55e", Planning: "#3b82f6", On_hold: "#f59e0b", Complete: "#94a3b8", Idea: "#a78bfa", Archived: "#64748b" };

  return (
    <div className="stack">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Pill label="All" active={!statusFilter} onClick={() => setStatusFilter("")} />
        {PROJECT_STATUSES.map((s) => <Pill key={s} label={s.replace(/_/g, " ")} active={statusFilter === s} onClick={() => setStatusFilter(s)} />)}
        <Btn onClick={() => setShowCreate(true)} style={{ marginLeft: "auto" }}>+ New project</Btn>
      </div>

      {loading ? <p className="muted">Loading…</p> : projects.length === 0 ? <EmptyState message="No projects" /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {projects.map((p) => (
            <div key={p.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <h4 style={{ margin: 0 }}>{p.name}</h4>
                <Badge color={statusColor[p.status] || "#64748b"}>{p.status?.replace(/_/g, " ")}</Badge>
              </div>
              <p style={{ fontSize: 13, color: "var(--muted, #64748b)", margin: 0 }}>
                {p.project_type?.replace(/_/g, " ")}
                {p.description ? ` · ${p.description.slice(0, 80)}…` : ""}
              </p>
              {(p.start_date || p.end_date) && (
                <p style={{ fontSize: 12, color: "var(--muted, #64748b)", margin: "6px 0 0" }}>
                  {p.start_date ? fmt(p.start_date) : "?"} → {p.end_date ? fmt(p.end_date) : "ongoing"}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal title="New project" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="stack">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Type">
                <Select value={form.project_type} onChange={(e) => setForm((f) => ({ ...f, project_type: e.target.value }))}>
                  {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Description"><Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
            <ErrorMsg msg={err} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Btn>
              <Btn type="submit" disabled={saving}>{saving ? "Saving…" : "Create project"}</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ============================================================================
// ROOT CRM APP
// ============================================================================

const VIEWS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "contacts", label: "Contacts" },
  { id: "opportunities", label: "Opportunities" },
  { id: "tasks", label: "Tasks" },
  { id: "projects", label: "Projects" },
];

export default function CRMApp() {
  const [view, setView] = useState("dashboard");

  return (
    <div className="page">
      {/* CRM header + tab nav */}
      <div style={{ marginBottom: 20, borderBottom: "1px solid var(--border, #e2e8f0)", paddingBottom: 0 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>CRM</h2>
        <div style={{ display: "flex", gap: 0 }}>
          {VIEWS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              style={{
                padding: "8px 18px", border: "none", background: "transparent", cursor: "pointer",
                fontWeight: view === id ? 700 : 400, fontSize: 14,
                borderBottom: view === id ? "2px solid var(--accent, #2563eb)" : "2px solid transparent",
                color: view === id ? "var(--accent, #2563eb)" : "inherit",
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* View content */}
      {view === "dashboard" && <DashboardView onNavigate={setView} />}
      {view === "contacts" && <ContactsView />}
      {view === "opportunities" && <OpportunitiesView />}
      {view === "tasks" && <TasksView />}
      {view === "projects" && <ProjectsView />}
    </div>
  );
}
