import { describe, expect, it } from "vitest";

import {
  buildValidationDeliverySummary,
  getRuntimeValidationPayload,
  normalizeValidationModel,
} from "./runtimeValidationSummaries.js";

describe("runtimeValidationSummaries", () => {
  it("normalizes a representative exported model contract", () => {
    const normalized = normalizeValidationModel({
      model_key: "vulnerability",
      model_name: "Conservative Seat Vulnerability",
      model_category: "validated",
      model_status: "empirical_ranking_available",
      summary_interpretation: "Ranking model summary",
      confidence_treatment: "Use as ranking aid",
      caveats: ["Boundary caveat"],
      key_validation_metrics: {
        precision_at_20: { latest: 0.85, average: 0.53 },
      },
      evidence_completeness: "empirical_strongest_available",
      artifact_provenance: {
        generated_at: "2026-03-19T00:00:00Z",
        last_updated: "2026-03-18T00:00:00Z",
        source_artifacts: ["artifacts/backtests/vulnerability_variant_summary.csv"],
      },
    });

    expect(normalized.modelName).toBe("Conservative Seat Vulnerability");
    expect(normalized.categoryLabel).toBe("Validated");
    expect(normalized.evidenceCompletenessLabel).toMatch(/strongest empirical evidence/i);
    expect(normalized.missingFields).toEqual([]);
  });

  it("exposes a stable payload with all four model categories present", () => {
    const payload = getRuntimeValidationPayload();

    expect(payload.contractVersion).toBeGreaterThan(0);
    expect(payload.models).toHaveLength(4);
    expect(payload.models.map((model) => model.modelKey)).toEqual(
      expect.arrayContaining(["vulnerability", "reform_threat", "by_election_risk", "scenario_simulator"]),
    );
  });

  it("groups exported models into explicit category sections", () => {
    const summary = buildValidationDeliverySummary();

    expect(summary.categories.find((category) => category.key === "validated")?.models).toHaveLength(1);
    expect(summary.categories.find((category) => category.key === "directional")?.models).toHaveLength(1);
    expect(summary.categories.find((category) => category.key === "watchlist_event")?.models).toHaveLength(1);
    expect(summary.categories.find((category) => category.key === "planning_tool")?.models).toHaveLength(1);
  });
});
