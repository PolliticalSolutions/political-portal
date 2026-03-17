import { describe, expect, it } from "vitest";

import { buildModelPerformancePageSummary, buildModelPerformanceSummary, getModelPerformanceModels } from "./modelPerformanceSummary.js";

describe("modelPerformanceSummary", () => {
  it("builds summaries for the core model set", () => {
    expect(getModelPerformanceModels()).toEqual([
      "vulnerability",
      "reformThreat",
      "byElectionRisk",
      "scenarioSimulator",
    ]);
  });

  it("marks the scenario simulator as a planning-only model", () => {
    const summary = buildModelPerformanceSummary({ modelKey: "scenario_simulator" });

    expect(summary.label).toBe("Constituency Scenario Simulator");
    expect(summary.historicalBacktestability).toBe("not_applicable");
    expect(summary.backtest.state).toBe("not_applicable");
    expect(summary.confidence.presentationMode).toBe("planning_only");
  });

  it("surfaces runtime backtest availability when metric rows exist", () => {
    const pageSummary = buildModelPerformancePageSummary({
      runtimeBacktests: {
        models: {
          vulnerability: {
            hasRuntimeMetrics: true,
            latestEvaluatedAt: "2026-03-16T00:00:00.000Z",
            metricCount: 2,
            metricNames: ["precision_at_20", "top_decile_capture"],
            notes: ["Dry-run artifact mirrored to runtime row"],
          },
        },
      },
    });

    const vulnerability = pageSummary.models.find((model) => model.modelKey === "vulnerability");

    expect(vulnerability.backtest.state).toBe("available");
    expect(vulnerability.metricLabels).toEqual(["Precision At 20", "Top Decile Capture"]);
    expect(pageSummary.maturityCounts.strong).toBe(1);
  });

  it("adds calibration guidance and cross-model priorities to the page summary", () => {
    const pageSummary = buildModelPerformancePageSummary({
      runtimeBacktests: {
        models: {},
      },
    });

    expect(pageSummary.models[0].calibration.immediateNextStep).toBeTruthy();
    expect(pageSummary.crossModelPriorities.bestTuningCandidate).toBe("Conservative Seat Vulnerability");
    expect(pageSummary.crossModelPriorities.overInterpretationRisk).toContain("Reform UK Threat Index");
  });
});
