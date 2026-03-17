import { describe, expect, it } from "vitest";

import { getCalibrationRecommendations } from "./calibrationRecommendations.js";

describe("getCalibrationRecommendations", () => {
  it("gives vulnerability retain and review guidance rather than blanket downgrade", () => {
    const result = getCalibrationRecommendations({ modelKey: "vulnerability" });

    expect(result.recommendations.some((item) => item.recommendationLevel === "retain")).toBe(true);
    expect(result.recommendations.some((item) => item.recommendationLevel === "review")).toBe(true);
    expect(result.overallPosture).not.toBe("downgrade");
  });

  it("keeps Reform Threat in a review-oriented posture", () => {
    const result = getCalibrationRecommendations({ modelKey: "reform_threat" });

    expect(result.recommendations.some((item) => item.category === "presentation_risk")).toBe(true);
    expect(result.recommendations.some((item) => item.recommendationLevel === "review")).toBe(true);
  });

  it("flags by-election risk as data-gap and downgrade constrained", () => {
    const result = getCalibrationRecommendations({ modelKey: "byElectionRisk" });

    expect(result.recommendations.some((item) => item.recommendationLevel === "data_gap")).toBe(true);
    expect(result.recommendations.some((item) => item.recommendationLevel === "downgrade")).toBe(true);
    expect(["data_gap", "downgrade"]).toContain(result.overallPosture);
  });

  it("treats the scenario simulator as governance-focused rather than calibratable", () => {
    const result = getCalibrationRecommendations({ modelKey: "scenario_simulator" });

    expect(result.recommendations[0].recommendationLevel).toBe("not_applicable");
    expect(result.recommendations[0].title).toMatch(/governance/i);
  });
});
