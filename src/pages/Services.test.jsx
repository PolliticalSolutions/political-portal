import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Services from "./Services.jsx";

describe("Services", () => {
  it("renders key service headings", () => {
    render(
      <MemoryRouter>
        <Services />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Political operations services" })).toBeInTheDocument();
    expect(screen.getByText("Marked Register Processing")).toBeInTheDocument();
    expect(screen.getByText("Election & By-Election Support (separate charge)")).toBeInTheDocument();
  });

  it("sets the SEO title and description", async () => {
    render(
      <MemoryRouter>
        <Services />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(document.title).toContain("Political operations services");
    });

    const description = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    expect(description).toContain("UK-wide");
  });
});
