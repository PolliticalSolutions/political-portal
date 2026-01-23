import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { CartProvider } from "./cart/cartStore.jsx";
import App from "./App.jsx";

describe("App public routing", () => {
  it("navigates to legal pages from the footer links", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <CartProvider>
          <App />
        </CartProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("link", { name: "Privacy Policy" }));
    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Terms of Use" }));
    expect(screen.getByRole("heading", { name: "Terms of Use" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Cookie Notice" }));
    expect(screen.getByRole("heading", { name: "Cookie Notice" })).toBeInTheDocument();
  });
});
