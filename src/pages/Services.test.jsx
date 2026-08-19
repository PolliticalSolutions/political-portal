import { render, screen, within } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Services from "./Services.jsx";

describe("Services", () => {
  it("renders the approved consultancy-led hierarchy and verified destinations", () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <Services />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(
      screen.getByRole("heading", {
        name: "Campaign support built on evidence, not assumption",
      })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Discuss your campaign" })[0]).toHaveAttribute(
      "href",
      "/enquire?service=election-support"
    );

    const list = screen.getByTestId("services-list");
    expect(
      within(list).getByRole("heading", {
        level: 3,
        name: "Campaigning, Training & Election Support",
      })
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("heading", { level: 3, name: "Constituency Intelligence" })
    ).toBeInTheDocument();
    expect(
      within(list).getByRole("heading", { level: 3, name: "Marked Register Processing" })
    ).toBeInTheDocument();

    expect(within(list).getByRole("link", { name: "Explore campaign support" })).toHaveAttribute(
      "href",
      "/services/election-support"
    );
    expect(
      within(list).getByRole("link", { name: "Explore Constituency Intelligence" })
    ).toHaveAttribute("href", "/constituency-intelligence");
    expect(within(list).getByRole("link", { name: "Enquire about processing" })).toHaveAttribute(
      "href",
      "/enquire?service=marked-register"
    );

    expect(
      screen.getByText("Can Political Solutions support a campaign beyond the immediate election period?")
    ).toBeInTheDocument();
    expect(screen.queryByText(/audit-ready processing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/UK-wide services and support/i)).not.toBeInTheDocument();
  });
});
