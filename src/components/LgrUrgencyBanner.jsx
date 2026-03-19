import { getDaysUntil, SURREY_SHADOW_ELECTION_DATE, WAVE2_CONSULTATION_CLOSE_DATE } from "../lib/lgrUrgency.js";

/**
 * Persistent urgency banner for LGR pages.
 * Shows when Surrey shadow elections or Wave 2 consultation deadline are imminent.
 * Returns null once both dates have passed.
 */
export default function LgrUrgencyBanner() {
  const surreyDays = getDaysUntil(SURREY_SHADOW_ELECTION_DATE);
  const wave2Days = getDaysUntil(WAVE2_CONSULTATION_CLOSE_DATE);

  if (surreyDays === 0 && wave2Days === 0) return null;

  const isCritical = wave2Days <= 7 || surreyDays <= 14;

  return (
    <div
      role="alert"
      style={{
        background: isCritical ? "#7f1d1d" : "#991b1b",
        color: "#fef2f2",
        padding: "10px 16px",
        borderRadius: 6,
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 14 }}>LGR — Immediate action required</span>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {wave2Days > 0 && (
          <span>
            Wave 2 consultation closes in{" "}
            <strong style={{ fontWeight: 800 }}>{wave2Days} days</strong>
            {" "}(26 Mar 2026)
          </span>
        )}
        {surreyDays > 0 && (
          <span>
            Surrey shadow elections in{" "}
            <strong style={{ fontWeight: 800 }}>{surreyDays} days</strong>
            {" "}(7 May 2026)
          </span>
        )}
      </div>
    </div>
  );
}
