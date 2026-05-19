import { Link } from "react-router-dom";
import SessionTypeBadge from "./SessionTypeBadge.jsx";
import CapacityBar from "./CapacityBar.jsx";
import { CAMPAIGN_CONTEXT_LABELS } from "../../lib/campaignConfig.js";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(time) {
  if (!time) return "";
  return time.slice(0, 5);
}

export default function SessionCard({ session, rsvpCount = 0, compact = false }) {
  return (
    <article className="campaign-session-card" style={{
      background: "var(--portal-surface)",
      border: "1px solid var(--portal-border)",
      borderRadius: 4,
      padding: "var(--space-5)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <SessionTypeBadge types={session.session_types} />
        {session.campaign_context && session.campaign_context !== "general_campaigning" && (
          <span style={{
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--portal-text-secondary)",
            border: "1px solid var(--portal-border-strong)",
            borderRadius: 2,
            padding: "0.2em 0.6em",
          }}>
            {CAMPAIGN_CONTEXT_LABELS[session.campaign_context] || session.campaign_context}
          </span>
        )}
        {session.status === "draft" && (
          <span style={{
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--portal-text-muted)",
          }}>
            Draft
          </span>
        )}
      </div>

      <h3 style={{
        margin: 0,
        fontSize: compact ? "var(--text-lg)" : "var(--text-xl)",
        fontWeight: 600,
        color: "var(--portal-text-primary)",
        letterSpacing: "-0.01em",
      }}>
        <Link to={`/portal/campaigns/${session.id}`} style={{ color: "inherit", textDecoration: "none" }}>
          {session.title}
        </Link>
      </h3>

      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: "var(--text-sm)",
        color: "var(--portal-text-secondary)",
        lineHeight: 1.5,
      }}>
        <div>{formatDate(session.session_date)} · {formatTime(session.start_time)} · {session.duration_minutes} min</div>
        <div>
          {session.venue_name && <><strong style={{ color: "var(--portal-text-primary)" }}>{session.venue_name}</strong><br /></>}
          {session.street_address}
          {session.postcode && <><br />{session.postcode}</>}
        </div>
        {session.region && <div style={{ color: "var(--portal-text-muted)", fontSize: "var(--text-xs)" }}>{session.region}</div>}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto" }}>
        <div style={{ flex: 1 }}>
          <CapacityBar filled={rsvpCount} max={session.max_capacity} />
          {session.max_capacity == null && (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--portal-text-muted)" }}>
              {rsvpCount} {rsvpCount === 1 ? "person" : "people"} attending
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
