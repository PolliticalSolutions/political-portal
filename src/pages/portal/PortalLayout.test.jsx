import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import PortalLayout from "./PortalLayout.jsx";

describe("PortalLayout", () => {
  it("renders portal navigation", () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <PortalLayout />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(screen.getByRole("navigation", { name: "Portal" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
  });
});
