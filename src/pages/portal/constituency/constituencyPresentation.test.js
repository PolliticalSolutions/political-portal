import { describe, expect, it } from "vitest";
import {
  buildSeatsByPartySummary,
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
      { name: "Labour", shortName: "Lab", hex: "#e31d1a", count: 2 },
      { name: "Conservative", shortName: "Con", hex: "#0087dc", count: 1 },
    ]);
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
