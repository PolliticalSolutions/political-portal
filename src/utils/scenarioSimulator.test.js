import { describe, expect, it } from "vitest";
import {
  getScenarioAssumptions,
  simulateConstituencyScenario,
} from "./scenarioSimulator.js";

const baselineRows = [
  {
    election_id: "ge-2024",
    vote_share: 41,
    votes: 21000,
    elections: { election_type: "general", election_date: "2024-07-04", name: "General Election 2024" },
    parties: { id: "con", short_name: "Conservative", colour_hex: "#0087DC" },
  },
  {
    election_id: "ge-2024",
    vote_share: 35,
    votes: 17900,
    elections: { election_type: "general", election_date: "2024-07-04", name: "General Election 2024" },
    parties: { id: "lab", short_name: "Labour", colour_hex: "#E4003B" },
  },
  {
    election_id: "ge-2024",
    vote_share: 14,
    votes: 7200,
    elections: { election_type: "general", election_date: "2024-07-04", name: "General Election 2024" },
    parties: { id: "reform", short_name: "Reform UK", colour_hex: "#12B6CF" },
  },
  {
    election_id: "ge-2024",
    vote_share: 10,
    votes: 5100,
    elections: { election_type: "general", election_date: "2024-07-04", name: "General Election 2024" },
    parties: { id: "ld", short_name: "Liberal Democrat", colour_hex: "#FAA61A" },
  },
];

describe("scenario simulator", () => {
  it("returns a graceful fallback when no baseline data exists", () => {
    const result = simulateConstituencyScenario({ rows: [] });
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/No general election result data/i);
  });

  it("projects a winner and majority band deterministically", () => {
    const result = simulateConstituencyScenario({
      rows: baselineRows,
      nationalSwingToConservative: 2,
      reformVoteChange: -1,
      turnoutChange: 5,
    });

    expect(result.available).toBe(true);
    expect(result.electionName).toBe("General Election 2024");
    expect(result.projectedWinner).toBe("Conservative");
    expect(result.projectedMajority).toBeGreaterThan(0);
    expect(result.projectedMajorityBand).toMatch(/Knife-edge|Tight|Manageable|Comfortable/);
    expect(result.projectedRows).toHaveLength(4);
    expect(result.projectedRows[0].projectedVotes).toBeGreaterThan(result.projectedRows[1].projectedVotes);
  });

  it("keeps shares normalised after adjustments", () => {
    const result = simulateConstituencyScenario({
      rows: baselineRows,
      nationalSwingToConservative: -3,
      reformVoteChange: 4,
      turnoutChange: -8,
    });

    const totalShare = result.projectedRows.reduce((sum, row) => sum + row.projectedShare, 0);
    expect(totalShare).toBeCloseTo(100, 4);
    expect(result.turnoutMultiplier).toBeCloseTo(0.92, 4);
  });

  it("provides explicit planning assumptions", () => {
    expect(getScenarioAssumptions()).toHaveLength(4);
    expect(getScenarioAssumptions()[0]).toMatch(/uniform national swing/i);
  });
});
