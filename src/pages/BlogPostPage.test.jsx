import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import BlogPostPage from "./BlogPostPage.jsx";

const renderRoute = (path) =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/blog/:slug" element={<BlogPostPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );

describe("BlogPostPage", () => {
  it("renders a post by slug", () => {
    renderRoute("/blog/2026-02-25-campaign-data-operations-baseline");

    expect(screen.getByRole("heading", { name: "Building a campaign data operations baseline" })).toBeInTheDocument();
    expect(screen.getByText("Campaign briefing")).toBeInTheDocument();
    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.getByText("25 Feb 2026")).toBeInTheDocument();
    expect(screen.getByText("By")).toBeInTheDocument();
    expect(screen.getByText("Political Solutions")).toBeInTheDocument();
    expect(
      screen.getByText(
        "How local campaign teams can reduce operational risk with a disciplined data baseline before peak election periods."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Build a resilient campaign data baseline", level: 2 }))
      .toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What to standardise first", level: 3 }))
      .toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Topics for Building a campaign data operations baseline/ }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All campaign briefings" })).toHaveAttribute(
      "href",
      "/blog"
    );
    expect(screen.getByRole("link", { name: "Discuss your campaign" })).toHaveAttribute(
      "href",
      "/enquire?service=election-support"
    );
  });

  it("shows not found for missing slug", () => {
    renderRoute("/blog/not-a-real-post");

    expect(screen.getByRole("heading", { name: "Briefing unavailable" })).toBeInTheDocument();
    expect(screen.getByText("This briefing does not exist or has not been published.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all campaign briefings" })).toHaveAttribute(
      "href",
      "/blog"
    );
  });
});
