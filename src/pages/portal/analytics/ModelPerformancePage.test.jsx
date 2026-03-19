import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/runtimeValidationSummaries.js", () => ({
  buildValidationDeliverySummary: () => ({
    contractVersion: 2,
    generatedAt: "2026-03-19T00:00:00Z",
    models: [
      {
        modelKey: "vulnerability",
        modelName: "Conservative Seat Vulnerability",
        modelCategory: "validated",
        categoryLabel: "Validated",
        modelStatus: "empirical_ranking_available",
        summaryInterpretation: "Strongest evidence-backed ranking model.",
        confidenceTreatment: "Use as ranking model.",
        caveats: ["Boundary caveat"],
        keyValidationMetrics: {
          precision_at_20: { latest: 0.85, average: 0.53 },
        },
        evidenceCompletenessLabel: "Strongest empirical evidence available",
        backtestAvailable: true,
        latestAvailableCycles: [2017, 2019, 2024],
        strongestVariant: "baseline_demographic",
        recommendedVariant: "baseline",
        artifactProvenance: { last_updated: "2026-03-18T00:00:00Z" },
      },
      {
        modelKey: "reform_threat",
        modelName: "Reform UK Threat Index",
        modelCategory: "directional",
        categoryLabel: "Directional",
        modelStatus: "directional_evidence_partial",
        summaryInterpretation: "Directional prioritisation model.",
        confidenceTreatment: "Directional assessment only.",
        caveats: ["Historical comparability is partial."],
        keyValidationMetrics: {},
        evidenceCompletenessLabel: "Partial directional evidence",
        backtestAvailable: false,
        latestAvailableCycles: [2017, 2019, 2024],
        strongestVariant: null,
        recommendedVariant: null,
        artifactProvenance: { last_updated: "2026-03-18T00:00:00Z" },
      },
      {
        modelKey: "by_election_risk",
        modelName: "By-Election Risk Watch",
        modelCategory: "watchlist_event",
        categoryLabel: "Watchlist / event",
        modelStatus: "event_history_incomplete",
        summaryInterpretation: "Event-driven watchlist model.",
        confidenceTreatment: "Watchlist only.",
        caveats: ["Event history is incomplete."],
        keyValidationMetrics: {},
        evidenceCompletenessLabel: "Limited event-history evidence",
        backtestAvailable: false,
        latestAvailableCycles: [2017, 2019, 2024],
        strongestVariant: null,
        recommendedVariant: null,
        artifactProvenance: { last_updated: "2026-03-18T00:00:00Z" },
      },
      {
        modelKey: "scenario_simulator",
        modelName: "Constituency Scenario Simulator",
        modelCategory: "planning_tool",
        categoryLabel: "Planning tool",
        modelStatus: "planning_tool_only",
        summaryInterpretation: "Planning aid only.",
        confidenceTreatment: "Non-predictive.",
        caveats: ["Not a forecast."],
        keyValidationMetrics: {},
        evidenceCompletenessLabel: "Governed planning-only evidence",
        backtestAvailable: false,
        latestAvailableCycles: [],
        strongestVariant: null,
        recommendedVariant: null,
        artifactProvenance: { last_updated: null },
      },
    ],
    categories: [
      { key: "validated", title: "Validated models", description: "Validated description", models: [{ modelKey: "vulnerability", modelName: "Conservative Seat Vulnerability", modelCategory: "validated", categoryLabel: "Validated", modelStatus: "empirical_ranking_available", summaryInterpretation: "Strongest evidence-backed ranking model.", confidenceTreatment: "Use as ranking model.", caveats: ["Boundary caveat"], keyValidationMetrics: { precision_at_20: { latest: 0.85, average: 0.53 } }, evidenceCompletenessLabel: "Strongest empirical evidence available", backtestAvailable: true, latestAvailableCycles: [2017, 2019, 2024], strongestVariant: "baseline_demographic", recommendedVariant: "baseline", artifactProvenance: { last_updated: "2026-03-18T00:00:00Z" } }] },
      { key: "directional", title: "Directional models", description: "Directional description", models: [{ modelKey: "reform_threat", modelName: "Reform UK Threat Index", modelCategory: "directional", categoryLabel: "Directional", modelStatus: "directional_evidence_partial", summaryInterpretation: "Directional prioritisation model.", confidenceTreatment: "Directional assessment only.", caveats: ["Historical comparability is partial."], keyValidationMetrics: {}, evidenceCompletenessLabel: "Partial directional evidence", backtestAvailable: false, latestAvailableCycles: [2017, 2019, 2024], strongestVariant: null, recommendedVariant: null, artifactProvenance: { last_updated: "2026-03-18T00:00:00Z" } }] },
      { key: "watchlist_event", title: "Watchlist / event models", description: "Watchlist description", models: [{ modelKey: "by_election_risk", modelName: "By-Election Risk Watch", modelCategory: "watchlist_event", categoryLabel: "Watchlist / event", modelStatus: "event_history_incomplete", summaryInterpretation: "Event-driven watchlist model.", confidenceTreatment: "Watchlist only.", caveats: ["Event history is incomplete."], keyValidationMetrics: {}, evidenceCompletenessLabel: "Limited event-history evidence", backtestAvailable: false, latestAvailableCycles: [2017, 2019, 2024], strongestVariant: null, recommendedVariant: null, artifactProvenance: { last_updated: "2026-03-18T00:00:00Z" } }] },
      { key: "planning_tool", title: "Planning tools", description: "Planning description", models: [{ modelKey: "scenario_simulator", modelName: "Constituency Scenario Simulator", modelCategory: "planning_tool", categoryLabel: "Planning tool", modelStatus: "planning_tool_only", summaryInterpretation: "Planning aid only.", confidenceTreatment: "Non-predictive.", caveats: ["Not a forecast."], keyValidationMetrics: {}, evidenceCompletenessLabel: "Governed planning-only evidence", backtestAvailable: false, latestAvailableCycles: [], strongestVariant: null, recommendedVariant: null, artifactProvenance: { last_updated: null } }] },
    ],
  }),
}));

import ModelPerformancePage from "./ModelPerformancePage.jsx";

describe("ModelPerformancePage", () => {
  it("renders explicit model hierarchy sections from exported validation summaries", () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <ModelPerformancePage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByRole("heading", { name: /model performance & validation/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /validated models/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /directional models/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /watchlist \/ event models/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /planning tools/i })).toBeInTheDocument();

    expect(screen.getByText(/strongest evidence-backed ranking model/i)).toBeInTheDocument();
    expect(screen.getByText(/directional prioritisation model/i)).toBeInTheDocument();
    expect(screen.getByText(/event-driven watchlist model/i)).toBeInTheDocument();
    expect(screen.getByText(/planning aid only/i)).toBeInTheDocument();
  });

  it("renders explicit non-predictive treatment for the scenario simulator", () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <ModelPerformancePage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByText(/planning tool only/i)).toBeInTheDocument();
    expect(screen.getByText(/not to imply forecast confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/partial directional evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/limited event-history evidence/i)).toBeInTheDocument();
  });
});
