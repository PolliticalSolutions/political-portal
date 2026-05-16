// Live register / on-the-day check-in page. Mobile-first.
// Three sections: portal-user RSVPs, volunteer RSVPs, walk-ins.
// Each row has one big "Present" tap target. Counts update live.
// New walk-ins capture name + optional contact, persist immediately.

import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import { useCampaignAccess } from "../../../hooks/useCampaignAccess.js";
import {
  getSessionById,
  listRsvpsForSession,
  listVolunteerRsvpsForSession,
  listWalkInsForSession,
  setAttendance,
  setVolunteerRsvpAttendance,
  addWalkIn,
  removeWalkIn,
  getSessionAttendanceSummary,
} from "../../../lib/campaignApi.js";
import "./campaigns.css";

function formatDateLong(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
function formatTime(t) { return t ? t.slice(0, 5) : ""; }

export default function SessionRegisterPage() {
  const { sessionId } = useParams();
  const access = useCampaignAccess();
  const [session, setSession] = useState(null);
  const [portalRsvps, setPortalRsvps] = useState([]);
  const [volunteerRsvps, setVolunteerRsvps] = useState([]);
  const [walkIns, setWalkIns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reloadSummary = async () => {
    try {
      const s = await getSessionAttendanceSummary(sessionId);
      setSummary(s);
    } catch { /* non-fatal — counts will re-fetch on next refresh */ }
  };

  useEffect(() => {
    if (access.loading) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getSessionById(sessionId),
      listRsvpsForSession(sessionId),
      listVolunteerRsvpsForSession(sessionId),
      listWalkInsForSession(sessionId),
      getSessionAttendanceSummary(sessionId),
    ])
      .then(([s, pr, vr, wi, sum]) => {
        if (cancelled) return;
        setSession(s);
        setPortalRsvps(pr);
        setVolunteerRsvps(vr);
        setWalkIns(wi);
        setSummary(sum);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId, access.loading]);

  if (loading) return <div className="page stack"><p style={{ color: "var(--portal-text-muted)" }}>Loading register…</p></div>;
  if (error) return <div className="page stack"><p role="alert" style={{ color: "var(--portal-danger)" }}>{error}</p></div>;
  if (!session) return <div className="page stack"><p>Session not found.</p></div>;

  const isOwner = access.cognitoSub && session.created_by_sub === access.cognitoSub;
  const isAdmin = access.access && access.access.isAdmin;
  if (!isOwner && !isAdmin) {
    return <div className="page stack"><p>Only the session creator can take the register.</p></div>;
  }

  const togglePortalPresent = async (rsvp) => {
    const next = rsvp.attendance_status === "attended" ? "pending" : "attended";
    setPortalRsvps((prev) => prev.map((r) => (r.id === rsvp.id ? { ...r, attendance_status: next } : r)));
    try {
      await setAttendance(rsvp.id, next);
      reloadSummary();
    } catch (err) {
      setPortalRsvps((prev) => prev.map((r) => (r.id === rsvp.id ? { ...r, attendance_status: rsvp.attendance_status } : r)));
      setError(err.message);
    }
  };

  const toggleVolunteerPresent = async (rsvp) => {
    const next = rsvp.attendance_status === "attended" ? "pending" : "attended";
    setVolunteerRsvps((prev) => prev.map((r) => (r.id === rsvp.id ? { ...r, attendance_status: next } : r)));
    try {
      await setVolunteerRsvpAttendance(rsvp.id, next);
      reloadSummary();
    } catch (err) {
      setVolunteerRsvps((prev) => prev.map((r) => (r.id === rsvp.id ? { ...r, attendance_status: rsvp.attendance_status } : r)));
      setError(err.message);
    }
  };

  const handleAddWalkIn = async (input) => {
    const created = await addWalkIn(sessionId, input, access.cognitoSub);
    setWalkIns((prev) => [...prev, created]);
    reloadSummary();
  };

  const handleRemoveWalkIn = async (walkInId) => {
    await removeWalkIn(walkInId);
    setWalkIns((prev) => prev.filter((w) => w.id !== walkInId));
    reloadSummary();
  };

  const expected = (summary?.portalUserRsvps.total || 0) + (summary?.volunteerRsvps.total || 0);
  const presentTotal = summary?.totalAttended || 0;

  return (
    <div className="page stack campaigns-page">
      <Helmet><title>Take register — {session.title}</title></Helmet>

      <p style={{ margin: 0 }}>
        <Link to={`/portal/campaigns/${sessionId}`} style={{ color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
          ← Back to session
        </Link>
      </p>

      <header>
        <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--portal-text-primary)", letterSpacing: "-0.01em" }}>
          Take register
        </h1>
        <p style={{ margin: "4px 0 0 0", color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
          {session.title} · {formatDateLong(session.session_date)} · {formatTime(session.start_time)}
        </p>
      </header>

      <div style={{
        background: "var(--portal-navy)",
        color: "#FFFFFF",
        padding: "var(--space-4)",
        borderRadius: 4,
        display: "flex",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "var(--space-3)",
      }}>
        <div>
          <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700 }}>{presentTotal}</div>
          <div style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em", textTransform: "uppercase", color: "#B8C2CE" }}>Present</div>
        </div>
        <div>
          <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700 }}>{expected}</div>
          <div style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em", textTransform: "uppercase", color: "#B8C2CE" }}>Expected</div>
        </div>
        <div>
          <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700 }}>{walkIns.length}</div>
          <div style={{ fontSize: "var(--text-xs)", letterSpacing: "0.08em", textTransform: "uppercase", color: "#B8C2CE" }}>Walk-ins</div>
        </div>
      </div>

      <Section title={`Portal members (${portalRsvps.length})`} empty="No portal-user RSVPs for this session.">
        {portalRsvps.map((r) => (
          <RegisterRow
            key={r.id}
            name={r.display_name}
            subtitle={r.user_email}
            present={r.attendance_status === "attended"}
            onToggle={() => togglePortalPresent(r)}
          />
        ))}
      </Section>

      <Section title={`Volunteers (${volunteerRsvps.length})`} empty="No volunteer RSVPs for this session.">
        {volunteerRsvps.map((r) => (
          <RegisterRow
            key={r.id}
            name={`${r.first_name} ${r.last_name}`}
            subtitle={r.email}
            present={r.attendance_status === "attended"}
            onToggle={() => toggleVolunteerPresent(r)}
          />
        ))}
      </Section>

      <Section title={`Walk-ins (${walkIns.length})`}>
        {walkIns.map((w) => (
          <div key={w.id} className="campaigns-register-row">
            <div>
              <div style={{ fontWeight: 600, color: "var(--portal-text-primary)" }}>{w.first_name} {w.last_name}</div>
              {(w.email || w.phone) && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--portal-text-muted)" }}>
                  {[w.email, w.phone].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
            <button
              type="button"
              className="campaigns-register-row__present"
              onClick={() => handleRemoveWalkIn(w.id)}
              style={{ minWidth: 80, color: "var(--portal-danger)", borderColor: "var(--portal-danger)" }}
            >
              Remove
            </button>
          </div>
        ))}
        <WalkInForm onSubmit={handleAddWalkIn} />
      </Section>
    </div>
  );
}

function Section({ title, empty, children }) {
  return (
    <section className="campaigns-register-section">
      <div className="campaigns-register-section__heading">{title}</div>
      {empty && (Array.isArray(children) ? children.length === 0 : !children)
        ? <div style={{ padding: "var(--space-4)", color: "var(--portal-text-muted)", fontSize: "var(--text-sm)" }}>{empty}</div>
        : children}
    </section>
  );
}

function RegisterRow({ name, subtitle, present, onToggle }) {
  return (
    <div className="campaigns-register-row" onClick={onToggle} style={{ cursor: "pointer" }}>
      <div>
        <div style={{ fontWeight: 600, color: "var(--portal-text-primary)" }}>{name}</div>
        {subtitle && <div style={{ fontSize: "var(--text-xs)", color: "var(--portal-text-muted)" }}>{subtitle}</div>}
      </div>
      <button
        type="button"
        className={`campaigns-register-row__present${present ? " is-present" : ""}`}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
      >
        {present ? "✓ Present" : "Present"}
      </button>
    </div>
  );
}

function WalkInForm({ onSubmit }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!first.trim() || !last.trim()) { setErr("First and last name are required."); return; }
    setBusy(true);
    try {
      await onSubmit({
        first_name: first.trim(),
        last_name: last.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
      setFirst(""); setLast(""); setEmail(""); setPhone("");
    } catch (e2) {
      setErr(e2.message || "Couldn't add walk-in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="campaigns-register-add" onSubmit={submit}>
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--portal-text-secondary)" }}>
        Add walk-in
      </div>
      <input type="text" placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} required />
      <input type="text" placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} required />
      <input type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="tel" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      {err && <p role="alert" style={{ margin: 0, color: "var(--portal-danger)", fontSize: "var(--text-sm)" }}>{err}</p>}
      <Button type="submit" loading={busy}>Add to register</Button>
    </form>
  );
}
