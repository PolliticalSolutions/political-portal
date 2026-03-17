import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../constituency/constituencyApi.js", () => ({
  getByElectionWatchSeats: vi.fn(),
  getLatestElectionWinners: vi.fn(),
}));

vi.mock("../constituency/AnalyticsChoroplethMapClient.jsx", () => ({
  default: ({ seatsByOnsCode }) => (
    <div data-testid="by-election-map">{Object.keys(seatsByOnsCode).length} watched seats</div>
  ),
}));

import ByElectionWatchPage from "./ByElectionWatchPage.jsx";
import { getByElectionWatchSeats, getLatestElectionWinners } from "../constituency/constituencyApi.js";

describe("ByElectionWatchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the by-election watch list and map", async () => {
    getByElectionWatchSeats.mockResolvedValue([
      {
        constituency_id: "seat-1",
        risk_score: 8.9,
        risk_level: "Very High",
        majority_factor: 8,
        council_instability_factor: 4,
        defection_risk_factor: 3,
        polling_trend_factor: 5,
        risk_summary: "Tight majority and deteriorating local conditions.",
      },
    ]);

    getLatestElectionWinners.mockResolvedValue({
      winners: [
        {
          constituency_id: "seat-1",
          majority: 1420,
          candidates: { first_name: "Alex", last_name: "Harper" },
          parties: { name: "Conservative", short_name: "Con", colour_hex: "#0087DC" },
          constituencies: { id: "seat-1", ons_code: "E14000005", name: "East Mercia" },
        },
      ],
    });

    render(
      <HelmetProvider>
        <MemoryRouter>
          <ByElectionWatchPage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(await screen.findByRole("heading", { name: "By-Election Watch" })).toBeInTheDocument();
    expect(await screen.findByTestId("by-election-map")).toHaveTextContent("1 watched seats");
    expect(screen.getByRole("link", { name: "East Mercia" })).toHaveAttribute(
      "href",
      "/portal/constituency/E14000005"
    );
    expect(screen.getByText("Majority exposure")).toBeInTheDocument();
    expect(screen.getByText("No scheduled election trigger recorded")).toBeInTheDocument();
    expect(screen.getByText("Scoring methodology")).toBeInTheDocument();
    expect(screen.getByText("Council instability")).toBeInTheDocument();
    expect(screen.getAllByText("Low confidence").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Watchlist mode").length).toBeGreaterThan(0);
  });
});
