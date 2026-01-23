import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import CartEntry from "./CartEntry.jsx";

describe("CartEntry", () => {
  it("renders login CTA when logged out", () => {
    render(
      <MemoryRouter>
        <CartEntry authed={false} />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Please log in to continue" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View our services" })).toBeInTheDocument();
  });
});
