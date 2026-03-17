import { render, screen, within } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Services from "./Services.jsx";

describe("Services", () => {
  it("renders updated services hero, cards, CTA, and compliance note layout", () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <Services />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(
      screen.getByRole("heading", {
        name: "Operational support for campaign teams that need clean delivery",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Political Solutions provides three distinct products: Marked Register Processing, Constituency Intelligence, and Campaigning, Training & Election Support for teams that need practical delivery help alongside platform access."
      )
    ).toBeInTheDocument();
    expect(screen.getByAltText("Team using data to plan a political campaign")).toBeInTheDocument();
    expect(screen.queryByText("Service delivery overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Workflow + reporting snapshot placeholder")).not.toBeInTheDocument();

    const grid = screen.getByTestId("services-card-grid");
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveClass("feature-grid--equal");
    expect(within(grid).getByRole("heading", { level: 3, name: "Marked Register Processing" })).toBeInTheDocument();
    expect(within(grid).getByRole("heading", { level: 3, name: "Constituency Intelligence" })).toBeInTheDocument();
    expect(
      within(grid).getByRole("heading", { level: 3, name: "Campaigning, Training & Election Support" })
    ).toBeInTheDocument();
    const complianceTitle = screen.getByRole("heading", { name: "Compliance note" });
    expect(screen.getByRole("link", { name: "View Marked Register plans" })).toHaveAttribute(
      "href",
      "/subscriptions"
    );
    expect(screen.getByRole("link", { name: "Request a Constituency Intelligence briefing" })).toHaveAttribute(
      "href",
      "/enquire"
    );
    expect(screen.getByRole("link", { name: "Request election support" })).toHaveAttribute(
      "href",
      "/services/election-support"
    );
    expect(Number(grid.compareDocumentPosition(complianceTitle)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
