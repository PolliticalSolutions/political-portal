import { render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Home from "./Home.jsx";

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>
  );
}

describe("Home", () => {
  it("renders the approved six-section heading hierarchy and copy", () => {
    const { container } = renderHome();
    const page = container.querySelector(".home-page");
    const view = within(page);

    expect(
      view.getByRole("heading", { level: 1, name: "Political data for campaign decisions" })
    ).toBeInTheDocument();

    [
      "Choose the product that matches the job",
      "Constituency evidence in one workspace",
      "Built for controlled campaign work",
      "Start with the job in front of you",
      "Not sure which product fits the job?",
    ].forEach((heading) => {
      expect(view.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
    });

    expect(view.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(view.getAllByRole("article")).toHaveLength(3);
    expect(page).not.toHaveTextContent(/Excel|audit-ready|Why teams trust/i);
  });

  it("preserves every approved homepage destination", () => {
    const { container } = renderHome();
    const page = container.querySelector(".home-page");
    const view = within(page);

    view.getAllByRole("link", { name: /^Request a briefing$/ }).forEach((link) => {
      expect(link).toHaveAttribute("href", "/enquire?service=platform-briefing");
    });
    view.getAllByRole("link", { name: /^View products/ }).forEach((link) => {
      expect(link).toHaveAttribute("href", "/services");
    });
    expect(view.getByRole("link", { name: /^View subscription pricing/ })).toHaveAttribute(
      "href",
      "/subscribe"
    );
    expect(
      view.getByRole("link", { name: /^Explore Constituency Intelligence/ })
    ).toHaveAttribute("href", "/constituency-intelligence");
    expect(view.getByRole("link", { name: /^Discuss campaign support/ })).toHaveAttribute(
      "href",
      "/enquire?service=election-support"
    );
  });

  it("uses only the selected A imagery with descriptive alternatives", () => {
    const { container } = renderHome();
    const page = container.querySelector(".home-page");
    const images = within(page).getAllByRole("img");
    const sources = Array.from(page.querySelectorAll("picture source"));

    expect(images).toHaveLength(3);
    expect(
      within(page).getByAltText(
        "Overhead view of fictional marked-register sheets, a navy folder, metal clip and blue pencil on an off-white work surface."
      )
    ).toBeInTheDocument();
    expect(
      within(page).getByAltText(
        "Close overhead view of a worn clipboard holding fictional register sheets with a navy pen, binder clips and blue tab on a deep-navy surface."
      )
    ).toBeInTheDocument();
    expect(sources).toHaveLength(2);
    sources.forEach((source) => {
      expect(source.getAttribute("srcset")).toContain("home-");
      expect(source).toHaveAttribute("media", "(max-width: 720px)");
    });
  });
});
