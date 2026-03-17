import { describe, expect, it } from "vitest";
import { getScoringModel, SCORING_MODELS } from "./scoringModels.js";

describe("scoringModels", () => {
  it("exposes the expected hardening model definitions", () => {
    expect(Object.keys(SCORING_MODELS)).toEqual([
      "vulnerability",
      "reformThreat",
      "byElectionRisk",
    ]);
  });

  it("returns a structured model definition", () => {
    const model = getScoringModel("reformThreat");
    expect(model.title).toBe("Reform UK Threat Index");
    expect(model.version).toBe("v1.0");
    expect(model.components.length).toBeGreaterThan(0);
    expect(model.weights).toBeDefined();
    expect(model.explanationText).toContain("Higher scores");
  });
});
