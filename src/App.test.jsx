import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider } from "./cart/cartStore.jsx";

vi.mock("./auth/session.js", () => ({
  getSession: vi.fn(() => ({
    isAuthed: false,
    user: null,
    expiresAt: null,
    tokens: null,
    reason: null,
  })),
}));

vi.mock("./lib/cognito.js", () => ({
  clearStoredSession: vi.fn(),
  startLogout: vi.fn(),
}));

import { getSession } from "./auth/session.js";
import App from "./App.jsx";

function renderApp() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={["/"]}>
        <CartProvider>
          <App />
        </CartProvider>
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe("App top navigation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("hides the Portal link when the user is logged out", () => {
    getSession.mockReturnValue({
      isAuthed: false,
      user: null,
      expiresAt: null,
      tokens: null,
      reason: null,
    });

    renderApp();

    expect(screen.queryByRole("link", { name: "Pricing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Portal" })).not.toBeInTheDocument();
  });

  it("shows the Portal link when the user is logged in", () => {
    getSession.mockReturnValue({
      isAuthed: true,
      user: { email: "demo@example.test" },
      expiresAt: Date.now() + 60_000,
      tokens: { access_token: "token" },
      reason: null,
    });

    renderApp();

    expect(screen.queryByRole("link", { name: "Pricing" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Portal" })).toHaveAttribute("href", "/portal");
  });
});
