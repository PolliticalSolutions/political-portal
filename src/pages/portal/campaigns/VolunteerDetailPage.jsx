import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import { useCampaignAccess } from "../../../hooks/useCampaignAccess.js";
import { getVolunteerById, approveVolunteer, rejectVolunteer } from "../../../lib/campaignApi.js";
import { supabase } from "../../../lib/supabaseClient.js";
import { HEARD_VIA_LABELS } from "../../../lib/campaignConfig.js";
import "./campaigns.css";

export default function VolunteerDetailPage() {
  const { volunteerId } = useParams();
  const access = useCampaignAccess();
  const [volunteer, setVolunteer] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const v = await getVolunteerById(volunteerId);
      setVolunteer(v);
      if (v) {
        const { data } = await supabase
          .from("volunteer_rsvps")
          .select("id, session_id, attendance_status, rsvp_at, campaign_sessions(title, session_date, session_types)")
          .eq("volunteer_id", volunteerId)
          .order("rsvp_at", { ascending: false });
        setRsvps(data || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [volunteerId]);

  if (loading) return <div className="page stack"><p style={{ color: "var(--portal-text-muted)" }}>Loading…</p></div>;
  if (error) return <div className="page stack"><p role="alert" style={{ color: "var(--portal-danger)" }}>{error}</p></div>;
  if (!volunteer) return <div className="page stack"><p>Volunteer not found.</p></div>;

  const canCoordinate = access.access && (
    access.access.isAdmin ||
    (volunteer.association_preference && access.access.isCoordinatorFor.has(volunteer.association_preference))
  );

  const handleApprove = async () => {
    setBusy(true);
    try {
      await approveVolunteer(volunteer.id, access.cognitoSub, actionNote || null);
      await load();
    } finally { setBusy(false); }
  };
  const handleReject = async () => {
    setBusy(true);
    try {
      await rejectVolunteer(volunteer.id, access.cognitoSub, actionNote || null);
      await load();
    } finally { setBusy(false); }
  };

  return (
    <div className="page stack campaigns-page">
      <Helmet><title>{volunteer.first_name} {volunteer.last_name} — Volunteer</title></Helmet>
      <p style={{ margin: 0 }}>
        <Link to="/portal/campaigns/volunteers" style={{ color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
          ← All volunteers
        </Link>
      </p>

      <header>
        <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--portal-text-primary)", letterSpacing: "-0.01em" }}>
          {volunteer.first_name} {volunteer.last_name}
        </h1>
        <p style={{ margin: "4px 0 0 0", color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
          {volunteer.email} · {volunteer.postcode} · {volunteer.region}
        </p>
      </header>

      <section style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4, padding: "var(--space-5)" }}>
        <Row label="Status">
          <Status status={volunteer.status} />
        </Row>
        <Row label="Membership">
          {volunteer.membership_number ? (
            <span style={{ color: volunteer.membership_verified ? "var(--portal-success)" : "var(--portal-warning)" }}>
              {volunteer.membership_number} {volunteer.membership_verified ? "(verified)" : "(unverified)"}
            </span>
          ) : <span style={{ color: "var(--portal-text-muted)" }}>No number provided</span>}
        </Row>
        <Row label="Phone">{volunteer.phone || <span style={{ color: "var(--portal-text-muted)" }}>—</span>}</Row>
        <Row label="Heard via">{HEARD_VIA_LABELS[volunteer.heard_via] || volunteer.heard_via || "—"}</Row>
        <Row label="Email opt-out">{volunteer.email_opt_out ? "Yes" : "No"}</Row>
        <Row label="Signed up">{new Date(volunteer.created_at).toLocaleString("en-GB")}</Row>
        {volunteer.approved_at && <Row label="Decision at">{new Date(volunteer.approved_at).toLocaleString("en-GB")}</Row>}
        {volunteer.approval_note && <Row label="Note">{volunteer.approval_note}</Row>}
      </section>

      {canCoordinate && volunteer.status === "pending" && (
        <section style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4, padding: "var(--space-5)" }}>
          <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 600 }}>Review</h2>
          <div className="campaigns-form-row" style={{ marginTop: "var(--space-3)" }}>
            <label htmlFor="action-note">Note (optional)</label>
            <textarea id="action-note" rows={3} value={actionNote} onChange={(e) => setActionNote(e.target.value)} />
          </div>
          <div style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-2)" }}>
            <Button onClick={handleApprove} loading={busy}>Approve</Button>
            <Button variant="secondary" onClick={handleReject} loading={busy}>Reject</Button>
          </div>
        </section>
      )}

      <section style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4, padding: "var(--space-5)" }}>
        <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 600 }}>RSVP history ({rsvps.length})</h2>
        {rsvps.length === 0 ? (
          <p style={{ marginTop: "var(--space-3)", color: "var(--portal-text-muted)" }}>
            This volunteer has not yet RSVP'd to any sessions.
          </p>
        ) : (
          <table className="data-table" style={{ width: "100%", marginTop: "var(--space-3)", borderCollapse: "collapse" }}>
            <thead><tr><th align="left">Session</th><th align="left">Date</th><th align="left">Status</th></tr></thead>
            <tbody>
              {rsvps.map((r) => (
                <tr key={r.id}>
                  <td>{r.campaign_sessions ? r.campaign_sessions.title : r.session_id}</td>
                  <td>{r.campaign_sessions ? r.campaign_sessions.session_date : "—"}</td>
                  <td>{r.attendance_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", padding: "var(--space-3) 0", borderBottom: "1px solid var(--portal-border)", gap: "var(--space-4)" }}>
      <div style={{ minWidth: 160, fontSize: "var(--text-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--portal-text-secondary)" }}>
        {label}
      </div>
      <div style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--portal-text-primary)" }}>{children}</div>
    </div>
  );
}

function Status({ status }) {
  const map = {
    pending: { bg: "#FDECD5", fg: "#7D3D00", label: "Pending" },
    approved: { bg: "#D4EDDA", fg: "#1A6B3C", label: "Approved" },
    rejected: { bg: "#FDEDEC", fg: "#922B21", label: "Rejected" },
  };
  const s = map[status] || { bg: "var(--portal-surface-raised)", fg: "var(--portal-text-secondary)", label: status };
  return (
    <span style={{
      display: "inline-block", padding: "0.2em 0.6em", borderRadius: 2,
      background: s.bg, color: s.fg, fontSize: "var(--text-xs)",
      fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
    }}>{s.label}</span>
  );
}
