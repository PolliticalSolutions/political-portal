import { describe, expect, it } from "vitest";
import { getModelConfidence } from "./modelConfidence.js";

describe("model confidence", () => {
  it("allows vulnerability to reach high confidence with core signals present", () => {
    const result = getModelConfidence({
      modelKey: "vulnerability",
      availableSignalKeys: [
        "conservative_majority_pct",
        "challenger_gap",
        "conservative_vote_share_change",
      ],
    });

    expect(result.confidenceLevel).toBe("high");
    expect(result.presentationMode).toBe("standard");
  });

  it("downgrades when critical vulnerability signals are missing", () => {
    const result = getModelConfidence({
      modelKey: "vulnerability",
      availableSignalKeys: ["conservative_majority_pct"],
    });

    expect(["low", "insufficient_data"]).toContain(result.confidenceLevel);
    expect(result.missingCriticalSignals).toContain("challenger_gap");
  });

  it("does not over-penalise vulnerability for missing optional signals", () => {
    const result = getModelConfidence({
      modelKey: "vulnerability",
      availableSignalKeys: [
        "conservative_majority_pct",
        "challenger_gap",
        "conservative_vote_share_change",
      ],
      missingSignalKeys: ["demographic_headwinds", "anti_incumbent_pressure"],
    });

    expect(result.confidenceLevel).toBe("high");
  });

  it("caps reform threat at a directional medium-confidence assessment", () => {
    const result = getModelConfidence({
      modelKey: "reform_threat",
      availableSignalKeys: [
        "reform_vote_share",
        "conservative_majority_pct",
        "con_reform_swing",
      ],
    });

    expect(result.confidenceLevel).toBe("medium");
    expect(result.presentationMode).toBe("directional");
  });

  it("keeps by-election risk constrained to watchlist confidence", () => {
    const result = getModelConfidence({
      modelKey: "by_election_risk",
      availableSignalKeys: [
        "conservative_majority_pct",
        "challenger_gap",
        "anti_incumbent_pressure",
      ],
    });

    expect(result.confidenceLevel).toBe("low");
    expect(result.presentationMode).toBe("watchlist");
  });

  it("treats the scenario simulator as planning-only", () => {
    const result = getModelConfidence({
      modelKey: "scenario_simulator",
      availableSignalKeys: [
        "conservative_vote_share_change",
        "reform_vote_share",
        "turnout_volatility",
      ],
    });

    expect(result.confidenceLevel).toBe("low");
    expect(result.presentationMode).toBe("planning_only");
  });
});
