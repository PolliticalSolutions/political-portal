import { describe, expect, it } from "vitest";

import { getModelCalibrationSummary } from "./modelCalibrationSummary.js";

describe("getModelCalibrationSummary", () => {
  it("returns a compact summary for model-performance surfaces", () => {
    const result = getModelCalibrationSummary({ modelKey: "vulnerability" });

    expect(result.modelKey).toBe("vulnerability");
    expect(result.topIssues.length).toBeGreaterThan(0);
    expect(result.immediateNextStep).toBeTruthy();
  });
});
