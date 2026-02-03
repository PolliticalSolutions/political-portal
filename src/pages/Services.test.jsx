import { render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Services from "./Services.jsx";

describe("Services", () => {
  it("renders key service headings", () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <Services />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByRole("heading", { name: "Political operations services" })).toBeInTheDocument();
    expect(screen.getByText("Marked Register Processing")).toBeInTheDocument();
    expect(screen.getByText("Election & By-Election Support (separate charge)")).toBeInTheDocument();
  });

  it("sets the SEO title and description", async () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <Services />
        </MemoryRouter>
      </HelmetProvider>
    );

    await waitFor(() => {
      expect(document.title).toContain("Political operations services");
    });

    const description = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    expect(description).toContain("UK-wide");
  });
});
