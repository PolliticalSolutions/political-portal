import { fireEvent, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../constituency/constituencyApi.js", () => ({
  getLatestElectionScenarioBaseline: vi.fn(),
}));

import ScenarioPage from "./ScenarioPage.jsx";
import { getLatestElectionScenarioBaseline } from "../constituency/constituencyApi.js";

const sampleBaseline = {
  electionName: "2024 General Election",
  electionDate: "2024-07-04",
  rows: [
    {
      constituency_id: "seat-1",
      vote_share: 42,
      votes: 20000,
      is_winner: true,
      parties: { short_name: "Con" },
      constituencies: { id: "seat-1", ons_code: "E14000001", name: "North Example" },
    },
    {
      constituency_id: "seat-1",
      vote_share: 40,
      votes: 19000,
      is_winner: false,
      parties: { short_name: "Lab" },
      constituencies: { id: "seat-1", ons_code: "E14000001", name: "North Example" },
    },
    {
      constituency_id: "seat-1",
      vote_share: 12,
      votes: 6000,
      is_winner: false,
      parties: { short_name: "Reform UK" },
      constituencies: { id: "seat-1", ons_code: "E14000001", name: "North Example" },
    },
  ],
};

describe("ScenarioPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the scenario modeller and projected totals", async () => {
    getLatestElectionScenarioBaseline.mockResolvedValue(sampleBaseline);

    render(
      <HelmetProvider>
        <MemoryRouter>
          <ScenarioPage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(await screen.findByRole("heading", { name: /national scenario modeller/i })).toBeInTheDocument();
    expect(screen.getByText(/2024 general election/i)).toBeInTheDocument();
    expect(screen.getByText(/projected seat totals/i)).toBeInTheDocument();
    expect(screen.getByText("Conservative")).toBeInTheDocument();
  });

  it("recomputes when the user applies a new swing", async () => {
    getLatestElectionScenarioBaseline.mockResolvedValue(sampleBaseline);

    render(
      <HelmetProvider>
        <MemoryRouter>
          <ScenarioPage />
        </MemoryRouter>
      </HelmetProvider>
    );

    await screen.findByRole("heading", { name: /national scenario modeller/i });

    const conInput = screen.getByLabelText(/conservative swing/i);
    fireEvent.change(conInput, { target: { value: "-10" } });
    fireEvent.click(screen.getByRole("button", { name: /apply scenario/i }));

    expect(screen.getByText(/con -10.0/i)).toBeInTheDocument();
  });
});
