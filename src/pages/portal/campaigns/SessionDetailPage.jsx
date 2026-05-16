import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams, useNavigate } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import SessionTypeBadge from "../../../components/campaigns/SessionTypeBadge.jsx";
import CapacityBar from "../../../components/campaigns/CapacityBar.jsx";
import RsvpButton from "../../../components/campaigns/RsvpButton.jsx";
import { useCampaignAccess } from "../../../hooks/useCampaignAccess.js";
import { getSessionById, countRsvpsForSession, getMyRsvp, cancelSession, listRsvpsForSession } from "../../../lib/campaignApi.js";
import { STATUS_LABELS } from "../../../lib/campaignConfig.js";
import "./campaigns.css";

function formatDateLong(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function formatTime(t) { return t ? t.slice(0, 5) : ""; }

export default function SessionDetailPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const access = useCampaignAccess();
  const [session, setSession] = useState(null);
  const [rsvpCount, setRsvpCount] = useState(0);
  const [myRsvp, setMyRsvp] = useState(null);
  const [rsvps, setRsvps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (access.loading) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getSessionById(sessionId),
      countRsvpsForSession(sessionId),
      access.cognitoSub ? getMyRsvp(sessionId, access.cognitoSub) : Promise.resolve(null),
    ])
      .then(([s, count, myr]) => {
        if (cancelled) return;
        setSession(s);
        setRsvpCount(count);
        setMyRsvp(myr);
        // Owner / admin can see full RSVP list.
        const isOwner = s && access.cognitoSub && s.created_by_sub === access.cognitoSub;
        const canSeeFullList = isOwner || (access.access && access.access.isAdmin);
        if (canSeeFullList) {
          return listRsvpsForSession(sessionId).then((list) => {
            if (!cancelled) setRsvps(list);
          });
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId, access.loading, access.cognitoSub, access.access]);

  const isOwner = session && access.cognitoSub && session.created_by_sub === access.cognitoSub;
  const isAdmin = access.access && access.access.isAdmin;
  const canEdit = isOwner || isAdmin;
  const sessionPassed = session && (new Date(`${session.session_date}T${session.start_time || "00:00:00"}`) < new Date());

  const handleCancel = async () => {
    if (!session || !canEdit) return;
    if (typeof window !== "undefined" && !window.confirm("Cancel this session? Attendees will no longer see it.")) return;
    setCancelling(true);
    try {
      await cancelSession(session.id);
      navigate("/portal/campaigns");
    } catch (err) {
      setError(err.message);
      setCancelling(false);
    }
  };

  if (loading) return <div className="page stack"><p style={{ color: "var(--portal-text-muted)" }}>Loading session…</p></div>;
  if (error) return <div className="page stack"><p role="alert" style={{ color: "var(--portal-danger)" }}>{error}</p></div>;
  if (!session) return <div className="page stack"><p>Session not found.</p></div>;

  return (
    <div className="page stack campaigns-page">
      <Helmet><title>{session.title} — Political Solutions</title></Helmet>

      <p style={{ margin: 0 }}>
        <Link to="/portal/campaigns" style={{ color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
          ← All sessions
        </Link>
      </p>

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-5)", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", marginBottom: "var(--space-3)" }}>
            <SessionTypeBadge types={session.session_types} />
            {session.status !== "published" && (
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--portal-text-muted)" }}>
                {STATUS_LABELS[session.status]}
              </span>
            )}
          </div>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--portal-text-primary)", letterSpacing: "-0.01em" }}>
            {session.title}
          </h1>
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <Button as={Link} to={`/portal/campaigns/${session.id}/register`}>Take register</Button>
            <Button as={Link} to={`/portal/campaigns/${session.id}/edit`} variant="secondary">Edit</Button>
            {sessionPassed && (
              <Button as={Link} to={`/portal/campaigns/${session.id}/attendance`} variant="secondary">
                Confirm attendance
              </Button>
            )}
            <Button variant="secondary" onClick={handleCancel} loading={cancelling}>Cancel session</Button>
          </div>
        )}
      </header>

      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 320px",
        gap: "var(--space-6)",
      }} className="campaigns-detail-grid">
        <div style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4, padding: "var(--space-5)" }}>
          <DetailRow label="Date">{formatDateLong(session.session_date)}</DetailRow>
          <DetailRow label="Time">{formatTime(session.start_time)} · {session.duration_minutes} minutes</DetailRow>
          <DetailRow label="Meeting place">
            {session.venue_name && <><strong>{session.venue_name}</strong><br /></>}
            {session.street_address}
            {session.postcode && <><br />{session.postcode}</>}
            {(session.street_address || session.postcode) && (
              <>
                <br />
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([session.street_address, session.postcode].filter(Boolean).join(", "))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--portal-cta)", fontSize: "var(--text-sm)", fontWeight: 600 }}
                >
                  Get directions →
                </a>
              </>
            )}
          </DetailRow>
          <DetailRow label="Region">{session.region}</DetailRow>
          <DetailRow label="Contact">
            {session.contact_name} · <a href={`mailto:${session.contact_email}`} style={{ color: "var(--portal-text-primary)" }}>{session.contact_email}</a> · {session.contact_phone}
          </DetailRow>
          {session.notes && <DetailRow label="Notes">{session.notes}</DetailRow>}
        </div>

        <aside style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4, padding: "var(--space-5)" }}>
          <CapacityBar filled={rsvpCount} max={session.max_capacity} />
          {session.max_capacity == null && (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--portal-text-secondary)", marginBottom: "var(--space-4)" }}>
              {rsvpCount} {rsvpCount === 1 ? "person" : "people"} attending
            </div>
          )}
          <div style={{ marginTop: "var(--space-4)" }}>
            <RsvpButton
              session={session}
              currentSub={access.cognitoSub}
              currentName={access.userEmail || "Member"}
              currentEmail={access.userEmail}
              currentRsvp={myRsvp}
              rsvpCount={rsvpCount}
              onChange={() => {
                if (myRsvp) { setMyRsvp(null); setRsvpCount((c) => Math.max(0, c - 1)); }
                else { setMyRsvp({}); setRsvpCount((c) => c + 1); }
              }}
            />
          </div>
        </aside>
      </div>

      {rsvps && (
        <section style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4, padding: "var(--space-5)" }}>
          <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--portal-text-primary)" }}>
            Attendees ({rsvps.length})
          </h2>
          {rsvps.length === 0 ? (
            <p style={{ marginTop: "var(--space-3)", color: "var(--portal-text-muted)" }}>No RSVPs yet.</p>
          ) : (
            <table className="data-table" style={{ width: "100%", marginTop: "var(--space-3)", borderCollapse: "collapse" }}>
              <thead><tr><th align="left">Name</th><th align="left">Email</th><th align="left">RSVP at</th></tr></thead>
              <tbody>
                {rsvps.map((r) => (
                  <tr key={r.id}>
                    <td>{r.display_name}</td>
                    <td>{r.user_email}</td>
                    <td>{new Date(r.rsvp_at).toLocaleString("en-GB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "var(--space-3) 0", borderBottom: "1px solid var(--portal-border)" }}>
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--portal-text-secondary)" }}>
        {label}
      </div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--portal-text-primary)" }}>{children}</div>
    </div>
  );
}
