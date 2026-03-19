import { describe, expect, it } from "vitest";
import { normalisePartyName, projectNationalScenario } from "./scenarioModeller.js";

const sampleRows = [
  {
    constituency_id: "seat-1",
    vote_share: 42,
    votes: 20000,
    is_winner: true,
    parties: { short_name: "Con" },
    constituencies: { id: "seat-1", ons_code: "E14000001", name: "North Example" },
  },
  {
    constituency_id: "seat-1",
    vote_share: 40,
    votes: 19000,
    is_winner: false,
    parties: { short_name: "Lab" },
    constituencies: { id: "seat-1", ons_code: "E14000001", name: "North Example" },
  },
  {
    constituency_id: "seat-1",
    vote_share: 12,
    votes: 6000,
    is_winner: false,
    parties: { short_name: "Reform UK" },
    constituencies: { id: "seat-1", ons_code: "E14000001", name: "North Example" },
  },
  {
    constituency_id: "seat-2",
    vote_share: 44,
    votes: 21000,
    is_winner: true,
    parties: { short_name: "Lab" },
    constituencies: { id: "seat-2", ons_code: "E14000002", name: "South Example" },
  },
  {
    constituency_id: "seat-2",
    vote_share: 34,
    votes: 17000,
    is_winner: false,
    parties: { short_name: "Con" },
    constituencies: { id: "seat-2", ons_code: "E14000002", name: "South Example" },
  },
  {
    constituency_id: "seat-2",
    vote_share: 15,
    votes: 7000,
    is_winner: false,
    parties: { short_name: "Reform" },
    constituencies: { id: "seat-2", ons_code: "E14000002", name: "South Example" },
  },
];

describe("scenarioModeller", () => {
  it("normalises core party labels", () => {
    expect(normalisePartyName("Con")).toBe("Conservative");
    expect(normalisePartyName("Labour Co-operative")).toBe("Labour");
    expect(normalisePartyName("Reform")).toBe("Reform UK");
  });

  it("projects seat changes under a uniform swing", () => {
    const result = projectNationalScenario(sampleRows, {
      conservative: -5,
      labour: 4,
      reform: 3,
    });

    expect(result.summary.totalSeats).toBe(2);
    expect(result.summary.changedHands).toBe(1);
    expect(result.summary.labourProjected).toBe(2);
    expect(result.changedSeats[0]).toMatchObject({
      constituencyName: "North Example",
      baselineWinner: "Conservative",
      projectedWinner: "Labour",
      changedHands: true,
    });
  });

  it("returns an empty summary when no rows are available", () => {
    const result = projectNationalScenario([], { conservative: 0, labour: 0, reform: 0 });
    expect(result.summary.totalSeats).toBe(0);
    expect(result.projectedSeatTotals).toEqual([]);
    expect(result.changedSeats).toEqual([]);
  });
});
