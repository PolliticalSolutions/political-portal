import { findCurrentMpStatus } from "../../../data/currentMPs.js";

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
      colourHex: party.colour_hex || "#e31d1a",
    };
  }

  return {
    key: name || "Unknown",
    name: name || party.name || "Unknown",
    shortName: party.short_name || name || "Unknown",
    colourHex: party.colour_hex || null,
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

  return [...grouped.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });
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
