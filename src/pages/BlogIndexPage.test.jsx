import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import BlogIndexPage from "./BlogIndexPage.jsx";

describe("BlogIndexPage", () => {
  it("renders the blog index with published posts", () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <BlogIndexPage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(
      screen.getByRole("heading", { name: "Campaign operations, from evidence to delivery" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Political Solutions publishes practical briefings on campaign planning/
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Campaign briefings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Building a campaign data operations baseline" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Reducing field-team friction with better handoffs" })
    ).toBeInTheDocument();
    expect(screen.getByText("25 Feb 2026")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Topics for Building a campaign data operations baseline/ }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Discuss your campaign" })).toHaveAttribute(
      "href",
      "/enquire?service=election-support"
    );
  });

  it("does not list draft posts", () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <BlogIndexPage />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.queryByText("Internal draft: volunteer rota quality checks")).not.toBeInTheDocument();
  });

  it("renders the approved empty state when no posts are published", () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <BlogIndexPage postsOverride={[]} />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(
      screen.getByRole("heading", { name: "No campaign briefings are published yet" })
    ).toBeInTheDocument();
    expect(screen.getByText("There are no published briefings to show.")).toBeInTheDocument();
  });
});
