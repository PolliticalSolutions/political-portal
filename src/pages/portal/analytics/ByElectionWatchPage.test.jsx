import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../constituency/constituencyApi.js", () => ({
  getByElectionWatchlist: vi.fn(),
  getCouncilData: vi.fn(),
}));

import ByElectionWatchPage from "./ByElectionWatchPage.jsx";
import { getByElectionWatchlist, getCouncilData } from "../constituency/constituencyApi.js";

describe("ByElectionWatchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the by-election watchlist criteria table", async () => {
    getByElectionWatchlist.mockResolvedValue([
      {
        constituency_id: "seat-1",
        candidate_id: "cand-1",
        majority: 1420,
        electorate: 72000,
        vote_share: 0.35,
        constituencies: { id: "seat-1", ons_code: "E14000005", name: "East Mercia", region: "East Midlands", leave_vote_share: 62 },
        candidates: { id: "cand-1", first_name: "Alex", last_name: "Harper", first_elected_year: 2019 },
      },
    ]);

    getCouncilData.mockResolvedValue([]);

    render(
      <HelmetProvider>
        <MemoryRouter>
          <ByElectionWatchPage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(await screen.findByRole("heading", { name: "By-Election Watch" })).toBeInTheDocument();

    // Constituency link present
    expect(screen.getByRole("link", { name: "East Mercia" })).toHaveAttribute(
      "href",
      "/portal/constituency/E14000005"
    );

    // MP name rendered
    expect(screen.getByText("Alex Harper")).toBeInTheDocument();

    // Criteria section
    expect(screen.getByText(/Majority < 5,000/i)).toBeInTheDocument();
    expect(screen.getByText(/First\/second-term MP/i)).toBeInTheDocument();

    // Disclaimer
    expect(screen.getByText(/This is not a by-election prediction model/i)).toBeInTheDocument();
  });
});
