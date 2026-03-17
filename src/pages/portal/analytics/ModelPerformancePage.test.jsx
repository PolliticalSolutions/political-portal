import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/modelBacktestApi.js", () => ({
  getModelBacktestAvailability: vi.fn(),
}));

import ModelPerformancePage from "./ModelPerformancePage.jsx";
import { getModelBacktestAvailability } from "../../../lib/modelBacktestApi.js";

describe("ModelPerformancePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the upgraded validation structure when runtime artifacts are unavailable", async () => {
    getModelBacktestAvailability.mockResolvedValue({
      ok: true,
      hasRuntimeMetrics: false,
      models: {},
      limitations: [
        "No runtime backtest metric rows are available in Supabase.",
        "Local dry-run artifacts are not exposed directly to the browser runtime in the current app architecture.",
      ],
    });

    render(
      <HelmetProvider>
        <MemoryRouter>
          <ModelPerformancePage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(await screen.findByRole("heading", { name: "Model performance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Model maturity summary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Detailed model cards" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Signal quality and validation caveats" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Backtest availability and run status" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Limitations and next steps" })).toBeInTheDocument();

    expect(screen.getAllByText("Conservative Seat Vulnerability").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reform UK Threat Index").length).toBeGreaterThan(0);
    expect(screen.getAllByText("By-Election Risk Model").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Constituency Scenario Simulator").length).toBeGreaterThan(0);

    expect(
      (await screen.findAllByText(/historical backtest artifacts not yet available in runtime context/i)).length
    ).toBeGreaterThan(0);
    expect(screen.getByText(/planning tool only/i)).toBeInTheDocument();
    expect(screen.getByText(/watchlist-grade validation/i)).toBeInTheDocument();
  });

  it("renders runtime metric availability when backtest metadata exists", async () => {
    getModelBacktestAvailability.mockResolvedValue({
      ok: true,
      hasRuntimeMetrics: true,
      limitations: [
        "Runtime status is derived from Supabase metric rows, not direct frontend access to local backtest artifact files.",
      ],
      models: {
        vulnerability: {
          hasRuntimeMetrics: true,
          latestEvaluatedAt: "2026-03-16T00:00:00.000Z",
          metricCount: 2,
          metricNames: ["precision_at_20", "top_decile_capture"],
          notes: ["Dry-run artifact mirrored to runtime row"],
        },
      },
    });

    render(
      <HelmetProvider>
        <MemoryRouter>
          <ModelPerformancePage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(await screen.findByText("Runtime backtest metrics available")).toBeInTheDocument();
    expect(screen.getByText(/precision at 20, top decile capture/i)).toBeInTheDocument();
    expect(screen.getByText(/runtime status is derived from supabase metric rows/i)).toBeInTheDocument();
    expect(screen.getAllByText(/high confidence/i).length).toBeGreaterThan(0);
  });
});
