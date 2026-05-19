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
      screen.getByRole("heading", { name: "UK Campaign Operations Blog" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Operational guidance for UK campaign professionals who need practical answers on data handling/
      )
    ).toBeInTheDocument();
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
