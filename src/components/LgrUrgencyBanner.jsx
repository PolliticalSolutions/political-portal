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
  const className = `lgr-urgency-banner${isCritical ? " lgr-urgency-banner--critical" : ""}`;

  return (
    <div role="alert" className={className}>
      <span className="lgr-urgency-banner__title">LGR — Immediate action required</span>
      <div className="lgr-urgency-banner__items">
        {wave2Days > 0 && (
          <span>
            Wave 2 consultation closes in{" "}
            <strong>{wave2Days} days</strong>
            {" "}(26 Mar 2026)
          </span>
        )}
        {surreyDays > 0 && (
          <span>
            Surrey shadow elections in{" "}
            <strong>{surreyDays} days</strong>
            {" "}(7 May 2026)
          </span>
        )}
      </div>
    </div>
  );
}
