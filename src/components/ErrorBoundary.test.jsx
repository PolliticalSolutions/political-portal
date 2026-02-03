import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ErrorBoundary from "./ErrorBoundary.jsx";

const Thrower = () => {
  throw new Error("Boom");
};

describe("ErrorBoundary", () => {
  it("renders fallback UI when a child throws", () => {
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Thrower />
        </ErrorBoundary>
      </MemoryRouter>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  });
});
