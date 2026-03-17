import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./constituencyApi.js", () => ({
  getReformThreatIndex: vi.fn(),
  getLatestElectionWinners: vi.fn(),
}));

vi.mock("./AnalyticsChoroplethMapClient.jsx", () => ({
  default: ({ seatsByOnsCode }) => (
    <div data-testid="analytics-map">{Object.keys(seatsByOnsCode).length} highlighted seats</div>
  ),
}));

import ReformThreatIndex from "./ReformThreatIndex.jsx";
import { getLatestElectionWinners, getReformThreatIndex } from "./constituencyApi.js";

describe("ReformThreatIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the choropleth map summary and ranked table", async () => {
    getReformThreatIndex.mockResolvedValue([
      {
        constituency_id: "con-1",
        threat_score: 8.8,
        threat_rank: 1,
        con_ruk_swing: 6.2,
        ruk_2024_share: 23.4,
        con_majority: 3.1,
      },
      {
        constituency_id: "con-2",
        threat_score: 7.4,
        threat_rank: 2,
        con_ruk_swing: 5.1,
        ruk_2024_share: 19.2,
        con_majority: 4.8,
      },
    ]);

    getLatestElectionWinners.mockResolvedValue({
      winners: [
        { constituencies: { id: "con-1", ons_code: "E14000001", name: "Aldershire" } },
        { constituencies: { id: "con-2", ons_code: "E14000002", name: "Bramley West" } },
      ],
    });

    render(
      <HelmetProvider>
        <MemoryRouter>
          <ReformThreatIndex />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(await screen.findByRole("heading", { name: "Reform UK Threat Index" })).toBeInTheDocument();
    expect(screen.getByText("Threat gradient")).toBeInTheDocument();
    expect(await screen.findByTestId("analytics-map")).toHaveTextContent("2 highlighted seats");
    expect(screen.getByRole("link", { name: "Aldershire" })).toHaveAttribute(
      "href",
      "/portal/constituency/E14000001"
    );
    expect(screen.getAllByText("Extreme").length).toBeGreaterThan(0);
    expect(screen.getAllByText("High").length).toBeGreaterThan(0);
  });
});
