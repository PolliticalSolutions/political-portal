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
    renderRoute("/blog/2026-02-25-example-post-1");

    expect(screen.getByRole("heading", { name: "Building a campaign data operations baseline" })).toBeInTheDocument();
    expect(screen.getByText("What to standardise first")).toBeInTheDocument();
  });

  it("shows not found for missing slug", () => {
    renderRoute("/blog/not-a-real-post");

    expect(screen.getByRole("heading", { name: "Post not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to blog" })).toHaveAttribute("href", "/blog");
  });
});