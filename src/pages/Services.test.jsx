import { render, screen } from "@testing-library/react";
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
        "Political Solutions supports campaign teams with Marked Register Processing, election support, and practical advisory work that helps associations and candidates move faster with fewer errors."
      )
    ).toBeInTheDocument();
    expect(screen.getByAltText("Team using data to plan a political campaign")).toBeInTheDocument();
    expect(screen.queryByText("Service delivery overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Workflow + reporting snapshot placeholder")).not.toBeInTheDocument();

    const grid = screen.getByTestId("services-card-grid");
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveClass("feature-grid--equal");
    expect(screen.getByText("Marked Register Processing")).toBeInTheDocument();
    expect(screen.getByText("Training & Support")).toBeInTheDocument();
    expect(screen.getByText("Election & By-Election Support")).toBeInTheDocument();
    expect(screen.queryByText("Data & Insight")).not.toBeInTheDocument();
    expect(screen.queryByText("Subscriptions & Platform")).not.toBeInTheDocument();
    expect(screen.queryByText("Election & By-Election Support (separate charge)")).not.toBeInTheDocument();
    const complianceTitle = screen.getByRole("heading", { name: "Compliance note" });
    expect(screen.getByRole("link", { name: "View Marked Register plans" })).toHaveAttribute(
      "href",
      "/subscriptions"
    );
    expect(screen.getByRole("link", { name: "Discuss support needs" })).toHaveAttribute(
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
