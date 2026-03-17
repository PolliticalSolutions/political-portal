import { describe, expect, it } from "vitest";
import {
  buildSeatsByPartySummary,
  CURRENT_COMPOSITION,
  GE2024_SEAT_CHANGES,
  getCurrentStatus,
  normalizePartyName,
  normalizePartyRecord,
} from "./constituencyPresentation.js";

describe("constituencyPresentation", () => {
  it("normalizes Labour Co-operative naming to Labour", () => {
    expect(normalizePartyName("Labour Co-operative")).toBe("Labour");
    expect(normalizePartyName("Labour and Co-operative Party")).toBe("Labour");
    expect(normalizePartyRecord({ name: "Labour Co-operative", short_name: "Labour Co-op" })).toMatchObject({
      name: "Labour",
      shortName: "Lab",
    });
  });

  it("combines Labour and Labour Co-operative winners into one seat summary row", () => {
    const summary = buildSeatsByPartySummary([
      { parties: { name: "Labour", short_name: "Lab", colour_hex: "#e31d1a" } },
      { parties: { name: "Labour Co-operative", short_name: "Labour Co-op", colour_hex: "#e31d1a" } },
      { parties: { name: "Conservative", short_name: "Con", colour_hex: "#0087dc" } },
    ]);

    expect(summary).toEqual([
      { name: "Labour", shortName: "Lab", hex: "#e31d1a", count: 2, change: 211 },
      { name: "Conservative", shortName: "Con", hex: "#0087dc", count: 1, change: -244 },
    ]);
  });

  it("collapses minor parties into Others below the Green threshold and attaches seat changes", () => {
    const summary = buildSeatsByPartySummary([
      ...Array.from({ length: 403 }, () => ({
        parties: { name: "Labour", short_name: "Lab", colour_hex: "#E4003B" },
      })),
      ...Array.from({ length: 121 }, () => ({
        parties: { name: "Conservative", short_name: "Con", colour_hex: "#0087DC" },
      })),
      ...Array.from({ length: 72 }, () => ({
        parties: { name: "Liberal Democrat", short_name: "LD", colour_hex: "#FAA61A" },
      })),
      ...Array.from({ length: 9 }, () => ({
        parties: { name: "SNP", short_name: "SNP", colour_hex: "#FDF38E" },
      })),
      ...Array.from({ length: 6 }, () => ({
        parties: { name: "Independent", short_name: "Ind", colour_hex: "#94a3b8" },
      })),
      ...Array.from({ length: 5 }, () => ({
        parties: { name: "Reform UK", short_name: "Reform", colour_hex: "#12B6CF" },
      })),
      ...Array.from({ length: 4 }, () => ({
        parties: { name: "Green", short_name: "Green", colour_hex: "#00B140" },
      })),
      ...Array.from({ length: 4 }, () => ({
        parties: { name: "Plaid Cymru", short_name: "PC", colour_hex: "#005B54" },
      })),
      ...Array.from({ length: 1 }, () => ({
        parties: { name: "DUP", short_name: "DUP", colour_hex: "#D46A4C" },
      })),
    ]);

    expect(summary.map((row) => row.name)).toEqual([
      "Labour",
      "Conservative",
      "Liberal Democrat",
      "SNP",
      "Independent",
      "Reform UK",
      "Green",
      "Others",
    ]);
    expect(summary.at(-1)).toEqual({
      name: "Others",
      shortName: "Others",
      hex: null,
      count: 5,
      change: null,
    });
    expect(summary.find((row) => row.name === "Labour")?.change).toBe(211);
    expect(summary.find((row) => row.name === "Independent")?.change).toBe(4);
  });

  it("exposes the hard-coded GE2024 change map and current composition rows used by the index", () => {
    expect(GE2024_SEAT_CHANGES).toMatchObject({
      Labour: 211,
      Conservative: -244,
      "Reform UK": 5,
      Green: 3,
    });
    expect(CURRENT_COMPOSITION).toContainEqual({
      party: "Reform UK",
      electedSeats: 5,
      currentSeats: 9,
      change: 4,
    });
    expect(CURRENT_COMPOSITION).toContainEqual({
      party: "Others",
      electedSeats: 30,
      currentSeats: 30,
      change: 0,
    });
  });

  it("returns current status metadata when a constituency has changed hands or affiliation", () => {
    const status = getCurrentStatus("Runcorn and Helsby", "Labour");

    expect(status).toMatchObject({
      currentMemberName: "Sarah Pochin",
      currentPartyName: "Reform UK",
      differsFromElected: true,
    });
  });

  it("does not flag a difference when no current override exists", () => {
    expect(getCurrentStatus("Richmond and Northallerton", "Conservative")).toBeNull();
  });
});
