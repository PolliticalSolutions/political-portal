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

    expect(screen.getByRole("heading", { name: "Blog" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Building a campaign data operations baseline" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Reducing field-team friction with better handoffs" })
    ).toBeInTheDocument();
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
});