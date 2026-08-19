import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ConstituencyIntelligence from "./ConstituencyIntelligence.jsx";

describe("ConstituencyIntelligence", () => {
  it("renders the approved evidence hierarchy, access boundary, and CTAs", () => {
    render(
      <MemoryRouter>
        <ConstituencyIntelligence />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: "Know the ground before you plan the campaign" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Election history" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Demographic context" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Swing analysis" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Vulnerability and party-specific threat" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Access follows your organisation's permissions" })
    ).toBeInTheDocument();

    screen.getAllByRole("link", { name: "Discuss your constituencies" }).forEach((link) => {
      expect(link).toHaveAttribute("href", "/enquire?service=constituency-intelligence");
    });
    screen.getAllByRole("link", { name: "Explore campaign support" }).forEach((link) => {
      expect(link).toHaveAttribute("href", "/services/election-support");
    });

    expect(screen.queryByText(/current data on every/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/real time/i)).not.toBeInTheDocument();
  });
});
