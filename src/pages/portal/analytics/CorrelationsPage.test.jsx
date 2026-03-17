import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../constituency/constituencyApi.js", () => ({
  getNationalCorrelations: vi.fn(),
  getRegionalCorrelations: vi.fn(),
}));

import CorrelationsPage from "./CorrelationsPage.jsx";
import { getNationalCorrelations, getRegionalCorrelations } from "../constituency/constituencyApi.js";

describe("CorrelationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the national briefing and regional sections", async () => {
    getNationalCorrelations.mockResolvedValue([
      {
        demographic_variable: "pct_owner_occupied",
        correlation_coefficient: 0.72,
        sample_size: 650,
        parties: { id: "con", name: "Conservative", short_name: "Con", colour_hex: "#0087DC" },
      },
      {
        demographic_variable: "pct_social_rented",
        correlation_coefficient: 0.65,
        sample_size: 650,
        parties: { id: "lab", name: "Labour", short_name: "Lab", colour_hex: "#E4003B" },
      },
    ]);

    getRegionalCorrelations.mockImplementation(async (region) => {
      if (region === "South East") {
        return [
          {
            demographic_variable: "pct_owner_occupied",
            correlation_coefficient: 0.68,
            sample_size: 84,
            parties: { id: "con", name: "Conservative", short_name: "Con", colour_hex: "#0087DC" },
          },
        ];
      }
      if (region === "North West") {
        return [
          {
            demographic_variable: "pct_social_rented",
            correlation_coefficient: 0.59,
            sample_size: 73,
            parties: { id: "lab", name: "Labour", short_name: "Lab", colour_hex: "#E4003B" },
          },
        ];
      }
      return [];
    });

    render(
      <HelmetProvider>
        <MemoryRouter>
          <CorrelationsPage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(await screen.findByRole("heading", { name: "National Correlations" })).toBeInTheDocument();
    expect(screen.getByText("National briefing")).toBeInTheDocument();
    expect(screen.getByText("South East")).toBeInTheDocument();
    expect(screen.getByText("North West")).toBeInTheDocument();
    expect(
      screen.getAllByText(/Owner-occupancy predicts stronger Conservative support/i).length
    ).toBeGreaterThan(0);
  });
});
