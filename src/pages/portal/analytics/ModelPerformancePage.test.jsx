import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/modelPerformanceApi.js", () => ({
  getModelPerformanceSummaries: vi.fn(),
}));

import ModelPerformancePage from "./ModelPerformancePage.jsx";
import { getModelPerformanceSummaries } from "../../../lib/modelPerformanceApi.js";

describe("ModelPerformancePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders fallback cards when no backtest data exists", async () => {
    getModelPerformanceSummaries.mockResolvedValue([]);

    render(
      <HelmetProvider>
        <MemoryRouter>
          <ModelPerformancePage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(await screen.findByRole("heading", { name: "Model performance" })).toBeInTheDocument();
    expect(screen.getAllByText("Backtest data required").length).toBeGreaterThan(0);
    expect(screen.getByText("Validation standard")).toBeInTheDocument();
    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(screen.getByText("Directional assessment")).toBeInTheDocument();
    expect(screen.getByText("Watchlist mode")).toBeInTheDocument();
  });
});
