import { render, screen } from "@testing-library/react";
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

});
