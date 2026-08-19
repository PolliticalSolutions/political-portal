import { render, screen, within } from "@testing-library/react";
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
  getStoredTokens: vi.fn(() => null),
  refreshTokens: vi.fn(async () => null),
  ensureCanonicalHost: vi.fn(() => false),
}));

import { getSession } from "./auth/session.js";
import App from "./App.jsx";

function renderApp(pathname = "/") {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[pathname]}>
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

  it("renders the approved public shell on an included route", () => {
    renderApp();

    const header = screen.getByRole("banner");
    expect(document.querySelector(".app")).toHaveClass("public-site");
    expect(header).toHaveClass("public-topbar");
    expect(within(header).getByRole("link", { name: "Products" })).toHaveAttribute(
      "href",
      "/services"
    );
    expect(within(header).getByRole("link", { name: "Client login" })).toHaveAttribute(
      "href",
      "/login"
    );
    expect(within(header).getByRole("link", { name: "Request a briefing" })).toHaveAttribute(
      "href",
      "/enquire?service=platform-briefing"
    );
    expect(
      screen.getByText("Startin Sales Solutions Ltd, trading as Political Solutions.")
    ).toBeInTheDocument();
  });

  it("keeps the legacy shell on an excluded authentication route", () => {
    renderApp("/login");

    const header = screen.getByRole("banner");
    expect(document.querySelector(".app")).not.toHaveClass("public-site");
    expect(header).toHaveClass("topbar");
    expect(header).not.toHaveClass("public-topbar");
    expect(within(header).queryByRole("link", { name: "Request a briefing" })).not.toBeInTheDocument();
  });

  it.each(["/cart", "/checkout", "/checkout/confirmation"])(
    "redirects the retired public card route %s to annual subscriptions",
    async (route) => {
      renderApp(route);

      expect(
        await screen.findByRole("heading", { name: "Start an annual Political Solutions subscription" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Start annual Stripe subscription" })
      ).toBeInTheDocument();
    }
  );

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
