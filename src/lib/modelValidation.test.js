import { describe, expect, it } from "vitest";
import { getModelValidationSummary, validateModelValidationSpec } from "./modelValidation.js";
import { getModelValidationSpec } from "../config/modelValidationSpecs.js";

describe("model validation helper", () => {
  it("validates required fields for core specs", () => {
    const result = validateModelValidationSpec(getModelValidationSpec("vulnerability"));
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  it("aligns minimum signal requirements with scoring model definitions", () => {
    expect(getModelValidationSummary("vulnerability").alignedSignalKeys).toBe(true);
    expect(getModelValidationSummary("reformThreat").alignedSignalKeys).toBe(true);
    expect(getModelValidationSummary("byElectionRisk").alignedSignalKeys).toBe(true);
  });

  it("treats the scenario simulator as a planning tool rather than a backtested ranking model", () => {
    const summary = getModelValidationSummary("scenario_simulator");
    expect(summary.spec.predictionType).toBe("scenario_projection");
    expect(summary.spec.historicalBacktestability).toBe("not_applicable");
    expect(summary.spec.recommendedPresentation).toMatch(/Planning aid/i);
  });
});
