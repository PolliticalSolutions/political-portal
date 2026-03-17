import { describe, expect, it } from "vitest";
import { getModelPresentationState } from "./modelPresentationState.js";

describe("model presentation state", () => {
  it("maps the scenario simulator to planning-only presentation", () => {
    expect(
      getModelPresentationState({ modelKey: "scenario_simulator", confidenceLevel: "low" })
    ).toBe("planning_only");
  });

  it("keeps by-election risk in watchlist mode", () => {
    expect(
      getModelPresentationState({ modelKey: "byElectionRisk", confidenceLevel: "low" })
    ).toBe("watchlist");
  });

  it("allows vulnerability to use standard presentation at high confidence", () => {
    expect(
      getModelPresentationState({ modelKey: "vulnerability", confidenceLevel: "high" })
    ).toBe("standard");
  });
});
