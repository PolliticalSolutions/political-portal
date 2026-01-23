import { render, screen } from "@testing-library/react";
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

    expect(screen.getByRole("heading", { name: "Services" })).toBeInTheDocument();
    expect(screen.getByText("Marked Register Processing")).toBeInTheDocument();
    expect(screen.getByText("Election & By-Election Support (separate charge)")).toBeInTheDocument();
  });
});
