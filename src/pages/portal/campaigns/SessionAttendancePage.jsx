import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import AttendanceToggle from "../../../components/campaigns/AttendanceToggle.jsx";
import { useCampaignAccess } from "../../../hooks/useCampaignAccess.js";
import { getSessionById, listRsvpsForSession } from "../../../lib/campaignApi.js";
import "./campaigns.css";

function formatDateLong(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function SessionAttendancePage() {
  const { sessionId } = useParams();
  const access = useCampaignAccess();
  const [session, setSession] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (access.loading) return;
    let cancelled = false;
    Promise.all([getSessionById(sessionId), listRsvpsForSession(sessionId)])
      .then(([s, r]) => {
        if (cancelled) return;
        setSession(s);
        setRsvps(r);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId, access.loading]);

  if (loading) return <div className="page stack"><p style={{ color: "var(--portal-text-muted)" }}>Loading…</p></div>;
  if (error) return <div className="page stack"><p role="alert" style={{ color: "var(--portal-danger)" }}>{error}</p></div>;
  if (!session) return <div className="page stack"><p>Session not found.</p></div>;

  const isOwner = access.cognitoSub && session.created_by_sub === access.cognitoSub;
  const isAdmin = access.access && access.access.isAdmin;
  if (!isOwner && !isAdmin) {
    return <div className="page stack"><p>Only the session creator can confirm attendance.</p></div>;
  }

  const attended = rsvps.filter((r) => r.attendance_status === "attended").length;
  const handleChanged = (rsvpId, next) => {
    setRsvps((prev) => prev.map((r) => (r.id === rsvpId ? { ...r, attendance_status: next } : r)));
  };

  return (
    <div className="page stack campaigns-page">
      <Helmet><title>Confirm attendance — {session.title}</title></Helmet>
      <p style={{ margin: 0 }}>
        <Link to={`/portal/campaigns/${sessionId}`} style={{ color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
          ← Back to session
        </Link>
      </p>

      <header>
        <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--portal-text-primary)", letterSpacing: "-0.01em" }}>
          Confirm attendance
        </h1>
        <p style={{ margin: "4px 0 0 0", color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
          {session.title} · {formatDateLong(session.session_date)}
        </p>
      </header>

      <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--portal-text-secondary)" }}>
          <strong style={{ color: "var(--portal-text-primary)" }}>{attended}</strong> of {rsvps.length} marked as attended
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--portal-text-muted)" }}>
          Changes save automatically — no submit button.
        </div>
      </div>

      {rsvps.length === 0 ? (
        <p style={{ color: "var(--portal-text-muted)" }}>No RSVPs were recorded for this session.</p>
      ) : (
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4 }}>
          <thead>
            <tr>
              <th align="left">Name</th>
              <th align="left">Email</th>
              <th align="left">Attendance</th>
            </tr>
          </thead>
          <tbody>
            {rsvps.map((r) => (
              <tr key={r.id}>
                <td>{r.display_name}</td>
                <td>{r.user_email}</td>
                <td><AttendanceToggle rsvp={r} onChanged={handleChanged} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
