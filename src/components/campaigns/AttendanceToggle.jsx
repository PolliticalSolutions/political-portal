import { useState } from "react";
import { setAttendance } from "../../lib/campaignApi.js";

export default function AttendanceToggle({ rsvp, onChanged }) {
  const [status, setStatus] = useState(rsvp.attendance_status);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const set = async (next) => {
    if (saving || status === next) return;
    setError("");
    setSaving(true);
    const prev = status;
    setStatus(next);
    try {
      await setAttendance(rsvp.id, next);
      setSaved(true);
      onChanged && onChanged(rsvp.id, next);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setStatus(prev);
      setError(err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const baseBtn = {
    fontSize: "var(--text-sm)",
    fontWeight: 600,
    padding: "var(--space-2) var(--space-3)",
    border: "1px solid var(--portal-border-strong)",
    borderRadius: 3,
    cursor: saving ? "wait" : "pointer",
    background: "var(--portal-bg)",
    color: "var(--portal-text-secondary)",
  };
  const activeAttended = { ...baseBtn, background: "var(--portal-cta)", color: "#FFFFFF", borderColor: "var(--portal-cta)" };
  const activeNo = { ...baseBtn, background: "var(--portal-surface-raised)", color: "var(--portal-text-primary)", borderColor: "var(--portal-border-strong)" };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
      <button type="button" onClick={() => set("attended")} style={status === "attended" ? activeAttended : baseBtn}>
        Attended
      </button>
      <button type="button" onClick={() => set("did_not_attend")} style={status === "did_not_attend" ? activeNo : baseBtn}>
        Did not attend
      </button>
      {saved && (
        <span style={{ color: "var(--portal-success)", fontSize: "var(--text-xs)", opacity: saved ? 1 : 0, transition: "opacity 0.5s ease" }}>
          ✓ saved
        </span>
      )}
      {error && <span style={{ color: "var(--portal-danger)", fontSize: "var(--text-xs)" }}>{error}</span>}
    </div>
  );
}
