import { describe, expect, it, vi } from "vitest";

vi.mock("./modelPerformanceApi.js", () => ({
  getModelPerformanceSummaries: vi.fn(),
}));

import { getModelPerformanceSummaries } from "./modelPerformanceApi.js";
import { getModelBacktestAvailability } from "./modelBacktestApi.js";

describe("getModelBacktestAvailability", () => {
  it("groups runtime metrics by canonical model key", async () => {
    getModelPerformanceSummaries.mockResolvedValue([
      {
        model_key: "reform_threat",
        metric_name: "precision_at_20",
        metric_value: 0.55,
        sample_size: 20,
        last_evaluated_at: "2026-03-15T00:00:00.000Z",
        notes: "Dry-run placeholder",
      },
      {
        model_key: "reformThreat",
        metric_name: "top_decile_capture",
        metric_value: 0.6,
        sample_size: 12,
        last_evaluated_at: "2026-03-16T00:00:00.000Z",
        notes: "Latest run",
      },
    ]);

    const result = await getModelBacktestAvailability();

    expect(result.ok).toBe(true);
    expect(result.hasRuntimeMetrics).toBe(true);
    expect(result.models.reformThreat.metricCount).toBe(2);
    expect(result.models.reformThreat.latestEvaluatedAt).toBe("2026-03-16T00:00:00.000Z");
    expect(result.models.reformThreat.metricNames).toEqual(["top_decile_capture", "precision_at_20"]);
  });

  it("returns a safe fallback when runtime metrics are unavailable", async () => {
    getModelPerformanceSummaries.mockRejectedValue(new Error("offline"));

    const result = await getModelBacktestAvailability();

    expect(result.ok).toBe(false);
    expect(result.hasRuntimeMetrics).toBe(false);
    expect(result.models).toEqual({});
    expect(result.limitations[0]).toMatch(/could not be loaded/i);
  });
});
