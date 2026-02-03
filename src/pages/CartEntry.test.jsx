import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import CartEntry from "./CartEntry.jsx";

describe("CartEntry", () => {
  const renderWithHelmet = (ui) => render(<HelmetProvider>{ui}</HelmetProvider>);

  it("renders login CTA when logged out", () => {
    renderWithHelmet(
      <MemoryRouter>
        <CartEntry authed={false} />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Please log in to continue" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View our services" })).toBeInTheDocument();
  });
});
