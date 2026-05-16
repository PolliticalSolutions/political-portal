import { SESSION_TYPE_LABELS, SESSION_TYPE_COLOURS } from "../../lib/campaignConfig.js";

export default function SessionTypeBadge({ type }) {
  const label = SESSION_TYPE_LABELS[type] || "Activity";
  const colour = SESSION_TYPE_COLOURS[type] || "var(--portal-text-muted)";
  return (
    <span
      className="campaign-type-badge"
      style={{
        display: "inline-block",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "0.2em 0.6em",
        borderRadius: 2,
        background: colour,
        color: "#FFFFFF",
      }}
    >
      {label}
    </span>
  );
}
