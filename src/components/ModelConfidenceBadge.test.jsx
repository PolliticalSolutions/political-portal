import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ModelConfidenceBadge from "./ModelConfidenceBadge.jsx";

describe("ModelConfidenceBadge", () => {
  it("renders high-confidence summary cleanly", () => {
    render(
      <ModelConfidenceBadge
        confidence={{
          confidenceLevel: "high",
          presentationMode: "standard",
          summaryText: "Based primarily on robust electoral ranking signals.",
          coverageSummary: "3 robust, 1 noisy, 0 insufficient-data signals available",
          recommendedPresentation: "Ranking tool for exposed Conservative-held seats.",
        }}
      />
    );

    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(screen.getByText("Standard presentation")).toBeInTheDocument();
    expect(screen.getByText(/robust electoral ranking signals/i)).toBeInTheDocument();
  });

  it("renders planning-only copy for simulator use", () => {
    render(
      <ModelConfidenceBadge
        confidence={{
          confidenceLevel: "low",
          presentationMode: "planning_only",
          summaryText: "Planning tool based on simplified assumptions.",
          coverageSummary: "2 robust, 1 noisy, 0 insufficient-data signals available",
          recommendedPresentation: "Planning aid with explicit simplification warnings.",
        }}
        compact
      />
    );

    expect(screen.getByText("Low confidence")).toBeInTheDocument();
    expect(screen.getByText("Planning tool")).toBeInTheDocument();
  });
});
