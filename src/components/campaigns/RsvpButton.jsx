import { useState } from "react";
import { rsvpSession, cancelRsvp } from "../../lib/campaignApi.js";

export default function RsvpButton({ session, currentSub, currentName, currentEmail, currentAssociationId, currentRsvp, rsvpCount, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [optimisticRsvpd, setOptimisticRsvpd] = useState(Boolean(currentRsvp));

  const isFull = session.max_capacity != null && rsvpCount >= session.max_capacity && !optimisticRsvpd;
  const rsvpd = optimisticRsvpd;

  const handleClick = async () => {
    if (busy || !currentSub) return;
    setError("");
    setBusy(true);
    try {
      if (rsvpd) {
        setOptimisticRsvpd(false);
        await cancelRsvp(session.id, currentSub);
        onChange && onChange({ rsvpd: false });
      } else {
        setOptimisticRsvpd(true);
        await rsvpSession(session.id, currentSub, currentName || "Anonymous", currentEmail || "", currentAssociationId || null);
        onChange && onChange({ rsvpd: true });
      }
    } catch (err) {
      setOptimisticRsvpd(!optimisticRsvpd);
      setError(err.message || "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const baseStyle = {
    width: "100%",
    padding: "12px 20px",
    border: "1.5px solid transparent",
    borderRadius: 3,
    fontSize: "var(--text-sm)",
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    cursor: busy || !currentSub || isFull ? "not-allowed" : "pointer",
    transition: "background 0.15s ease, color 0.15s ease",
  };

  let style;
  let label;
  if (!currentSub) {
    style = { ...baseStyle, background: "var(--portal-surface-raised)", color: "var(--portal-text-muted)" };
    label = "Log in to RSVP";
  } else if (isFull) {
    style = { ...baseStyle, background: "var(--portal-surface-raised)", color: "var(--portal-text-muted)" };
    label = "Session full";
  } else if (rsvpd) {
    style = { ...baseStyle, background: "transparent", color: "var(--portal-danger)", borderColor: "var(--portal-danger)" };
    label = busy ? "Cancelling…" : "Cancel RSVP";
  } else {
    style = { ...baseStyle, background: "var(--portal-cta)", color: "#FFFFFF" };
    label = busy ? "Saving…" : "I'm attending";
  }

  return (
    <div>
      <button type="button" onClick={handleClick} disabled={busy || !currentSub || isFull} style={style}>
        {label}
      </button>
      {error && (
        <p role="alert" style={{ marginTop: 8, color: "var(--portal-danger)", fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
