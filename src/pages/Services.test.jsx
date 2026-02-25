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

    expect(screen.getByRole("heading", { name: "What services do we offer?" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Political Solutions offers a wide range of solutions to help your campaigning efforts. These vary from Marked Register processing, to specialised by-election support, to ongoing campaigning consultancy work. See below for more information on how each service operates."
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
    expect(screen.queryByRole("link", { name: "Request election support" })).not.toBeInTheDocument();

    const cta = screen.getByRole("link", { name: "Enquire about our services here" });
    expect(cta).toHaveAttribute("href", "/enquire");

    const complianceTitle = screen.getByRole("heading", { name: "Compliance note" });
    const ctaContainer = screen.getByTestId("services-primary-cta");
    const gridPosition = Number(grid.compareDocumentPosition(ctaContainer));
    const ctaPosition = Number(ctaContainer.compareDocumentPosition(complianceTitle));
    expect(gridPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ctaPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
