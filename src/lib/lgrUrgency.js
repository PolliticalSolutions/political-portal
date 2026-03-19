/**
 * LGR urgency constants and utilities.
 *
 * Central source of truth for Surrey LGR structure, key dates,
 * countdown logic, and record grouping used by LGRTrackerPage
 * and LgrUrgencyBanner.
 */

// ── Key dates ─────────────────────────────────────────────────────────────

export const SURREY_SHADOW_ELECTION_DATE = new Date("2026-05-07T00:00:00Z");
export const WAVE2_CONSULTATION_CLOSE_DATE = new Date("2026-03-26T23:59:00Z");
export const DPP_DECISION_DATE = new Date("2026-07-01T00:00:00Z"); // approximate mid-year

// ── Surrey structure ───────────────────────────────────────────────────────

export const SURREY_REPLACEMENT_AUTHORITIES = [
  {
    name: "East Surrey Council",
    abolishedCouncils: [
      "Elmbridge Borough Council",
      "Epsom and Ewell Borough Council",
      "Mole Valley District Council",
      "Reigate and Banstead Borough Council",
      "Tandridge District Council",
    ],
  },
  {
    name: "West Surrey Council",
    abolishedCouncils: [
      "Guildford Borough Council",
      "Runnymede Borough Council",
      "Spelthorne Borough Council",
      "Surrey Heath Borough Council",
      "Waverley Borough Council",
      "Woking Borough Council",
    ],
  },
];

// ── Utilities ──────────────────────────────────────────────────────────────

/**
 * Returns the number of whole days from now until `date`.
 * Returns 0 if the date has passed.
 */
export function getDaysUntil(date) {
  const diff = date - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Returns a formatted date string like "7 May 2026".
 */
export function formatKeyDate(date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Returns an array of key date display objects for the countdown strip.
 * Each object: { id, tone, label, displayLabel, description }
 */
export function getKeyDateDisplay() {
  const surreyDays = getDaysUntil(SURREY_SHADOW_ELECTION_DATE);
  const wave2Days = getDaysUntil(WAVE2_CONSULTATION_CLOSE_DATE);
  const dppDays = getDaysUntil(DPP_DECISION_DATE);

  return [
    {
      id: "wave2",
      tone: wave2Days <= 7 ? "critical" : "high",
      label: `${wave2Days} days`,
      displayLabel: "Wave 2 consultation closes",
      description: `${formatKeyDate(WAVE2_CONSULTATION_CLOSE_DATE)} — MHCLG deadline for 14 county areas`,
    },
    {
      id: "surrey",
      tone: surreyDays <= 30 ? "critical" : "high",
      label: `${surreyDays} days`,
      displayLabel: "Surrey shadow elections",
      description: `${formatKeyDate(SURREY_SHADOW_ELECTION_DATE)} — First elections for East Surrey & West Surrey Councils`,
    },
    {
      id: "dpp",
      tone: "medium",
      label: `~${dppDays} days`,
      displayLabel: "DPP decisions expected",
      description: `Approx. ${formatKeyDate(DPP_DECISION_DATE)} — Norfolk/Suffolk, Essex, Hampshire, Sussex`,
    },
  ];
}

/**
 * Groups LGR authority records by wave/status into display groups.
 * Returns: Array<{ key, title, subtitle, tone, records }>
 */
export function groupLgrRecords(records) {
  const surrey = records.filter((r) => r.lgr_wave === "Surrey");
  const dpp = records.filter((r) => r.lgr_wave === "DPP");
  const wave2 = records.filter((r) => r.lgr_wave === "Wave 2");
  const other = records.filter((r) => !["Surrey", "DPP", "Wave 2"].includes(r.lgr_wave));

  const groups = [];

  if (surrey.length > 0) {
    groups.push({
      key: "surrey",
      tone: "critical",
      title: "Surrey — Order made",
      subtitle: "Statutory basis confirmed. Abolition 1 April 2027. Shadow elections 7 May 2026.",
      records: surrey,
    });
  }

  if (dpp.length > 0) {
    groups.push({
      key: "dpp",
      tone: "high",
      title: "Devolution Priority Programme — consultation closed",
      subtitle: "MHCLG consultation closed January 2026. Government decisions expected spring/summer 2026.",
      records: dpp,
    });
  }

  if (wave2.length > 0) {
    groups.push({
      key: "wave2",
      tone: "medium",
      title: "Wave 2 — consultation open",
      subtitle: "Consultation closes 26 March 2026. Decisions expected summer 2026. Target vesting 1 April 2028.",
      records: wave2,
    });
  }

  if (other.length > 0) {
    groups.push({
      key: "other",
      tone: "low",
      title: "Other LGR areas",
      subtitle: "Additional reorganisation records.",
      records: other,
    });
  }

  return groups;
}
