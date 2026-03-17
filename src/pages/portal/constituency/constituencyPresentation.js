import { findCurrentMpStatus } from "../../../data/currentMPs.js";

const PARTY_COLOUR_FALLBACKS = {
  Labour: "#E4003B",
  Conservative: "#0087DC",
  "Liberal Democrat": "#FAA61A",
  "Reform UK": "#12B6CF",
  SNP: "#FDF38E",
  Green: "#00B140",
  "Plaid Cymru": "#005B54",
  DUP: "#D46A4C",
  "Sinn Féin": "#326760",
  Independent: "#64748b",
};

export const GE2024_SEAT_CHANGES = {
  Labour: 211,
  Conservative: -244,
  "Liberal Democrat": 61,
  "Reform UK": 5,
  Green: 3,
  SNP: -39,
  Independent: 4,
};

export const CURRENT_COMPOSITION = [
  { party: "Labour", electedSeats: 403, currentSeats: 396 },
  { party: "Conservative", electedSeats: 121, currentSeats: 116 },
  { party: "Liberal Democrat", electedSeats: 72, currentSeats: 72 },
  { party: "Reform UK", electedSeats: 5, currentSeats: 9 },
  { party: "Green", electedSeats: 4, currentSeats: 5 },
  { party: "SNP", electedSeats: 9, currentSeats: 9 },
  { party: "Independent", electedSeats: 6, currentSeats: 13 },
  { party: "Others", electedSeats: 30, currentSeats: 30 },
].map((row) => ({
  ...row,
  change: row.currentSeats - row.electedSeats,
}));

export function normalizePartyName(name = "") {
  const value = (name || "").trim();
  if (!value) return "";
  const lower = value.toLowerCase();

  if (
    lower === "labour co-operative" ||
    lower === "labour co-op" ||
    lower === "labour and co-operative party" ||
    lower === "labour and co-operative" ||
    lower === "labour (co-op)" ||
    lower === "labour (co-operative)"
  ) {
    return "Labour";
  }

  return value;
}

export function normalizePartyRecord(party = {}) {
  const name = normalizePartyName(party.name || party.short_name || "");

  if (name === "Labour") {
    return {
      key: "Labour",
      name: "Labour",
      shortName: "Lab",
      colourHex: party.colour_hex || PARTY_COLOUR_FALLBACKS.Labour,
    };
  }

  return {
    key: name || "Unknown",
    name: name || party.name || "Unknown",
    shortName: party.short_name || name || "Unknown",
    colourHex: party.colour_hex || PARTY_COLOUR_FALLBACKS[name] || null,
  };
}

export function buildSeatsByPartySummary(winners = []) {
  const grouped = new Map();

  winners.forEach((winner) => {
    if (!winner?.parties) return;
    const normalized = normalizePartyRecord(winner.parties);
    const existing = grouped.get(normalized.key);

    if (existing) {
      existing.count += 1;
      return;
    }

    grouped.set(normalized.key, {
      name: normalized.name,
      shortName: normalized.shortName,
      hex: normalized.colourHex,
      count: 1,
    });
  });

  const sorted = [...grouped.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });

  const mapped = sorted.map((party) => ({
    ...party,
    change: GE2024_SEAT_CHANGES[party.name] ?? null,
  }));

  const greenIndex = mapped.findIndex((party) => party.name === "Green");

  if (greenIndex === -1) {
    return mapped;
  }

  const primaryParties = mapped.slice(0, greenIndex + 1);
  const remainingParties = mapped.slice(greenIndex + 1);

  if (!remainingParties.length) {
    return primaryParties;
  }

  const otherCount = remainingParties.reduce((sum, party) => sum + party.count, 0);

  return [
    ...primaryParties,
    {
      name: "Others",
      shortName: "Others",
      hex: null,
      count: otherCount,
      change: null,
    },
  ];
}

export function getCurrentStatus(constituencyName, electedPartyName = "") {
  const current = findCurrentMpStatus(constituencyName);
  if (!current) return null;

  return {
    ...current,
    differsFromElected:
      normalizePartyName(current.currentPartyName) !== normalizePartyName(electedPartyName),
  };
}
