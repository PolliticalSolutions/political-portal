import { describe, expect, it } from "vitest";
import {
  getCanonicalValidationKey,
  getModelValidationSpec,
  MODEL_VALIDATION_SPECS,
} from "./modelValidationSpecs.js";

describe("model validation specs", () => {
  it("defines validation specs for the core intelligence models", () => {
    expect(MODEL_VALIDATION_SPECS.vulnerability).toBeTruthy();
    expect(MODEL_VALIDATION_SPECS.reformThreat).toBeTruthy();
    expect(MODEL_VALIDATION_SPECS.byElectionRisk).toBeTruthy();
    expect(MODEL_VALIDATION_SPECS.scenarioSimulator).toBeTruthy();
  });

  it("supports snake_case aliases for externally described model names", () => {
    expect(getCanonicalValidationKey("reform_threat")).toBe("reformThreat");
    expect(getCanonicalValidationKey("by_election_risk")).toBe("byElectionRisk");
    expect(getCanonicalValidationKey("scenario_simulator")).toBe("scenarioSimulator");
  });

  it("includes explicit backtestability and anti-overclaim framing", () => {
    expect(getModelValidationSpec("vulnerability").historicalBacktestability).toBe("strong");
    expect(getModelValidationSpec("reform_threat").historicalBacktestability).toBe("partial");
    expect(getModelValidationSpec("by_election_risk").historicalBacktestability).toBe("weak");
    expect(getModelValidationSpec("scenario_simulator").historicalBacktestability).toBe("not_applicable");
    expect(getModelValidationSpec("scenarioSimulator").nonClaims.join(" ")).toMatch(/not a probabilistic seat forecast/i);
  });
});
