import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/cognito.js", async () => {
  const actual = await vi.importActual("../lib/cognito.js");
  return {
    ...actual,
    startLogin: vi.fn().mockResolvedValue(),
    exchangeCodeForTokens: vi.fn(),
  };
});

import Callback from "./Callback.jsx";
import { exchangeCodeForTokens, savePkce, startLogin } from "../lib/cognito.js";

function LocationDisplay() {
  const location = useLocation();
  return (
    <div data-testid="location-display">
      {location.pathname}
      {location.search}
    </div>
  );
}

describe("Callback", () => {
  const renderWithHelmet = (ui) => render(<HelmetProvider>{ui}</HelmetProvider>);

  beforeEach(() => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.example.test");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.test/callback");
    sessionStorage.clear();
    localStorage.clear();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("completes auth when PKCE exists only in localStorage", async () => {
    exchangeCodeForTokens.mockResolvedValue({ access_token: "token" });

    renderWithHelmet(
      <MemoryRouter initialEntries={["/callback?code=code-abc&state=state-123"]}>
        <Routes>
          <Route path="/callback" element={<Callback />} />
          <Route path="/portal" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("location-display").textContent).toContain("/portal");
    });
    expect(exchangeCodeForTokens).toHaveBeenCalledWith("code-abc", "state-123");
    expect(screen.queryByText("Restart sign-in")).not.toBeInTheDocument();
  });

  it("shows handoff-missing message and restarts sign-in", async () => {
    const pkceErr = Object.assign(new Error("Missing PKCE handoff data."), { code: "PKCE_HANDOFF_MISSING" });
    exchangeCodeForTokens.mockRejectedValue(pkceErr);

    renderWithHelmet(
      <MemoryRouter initialEntries={["/callback?code=code-abc&state=missing-state"]}>
        <Routes>
          <Route path="/callback" element={<Callback />} />
          <Route path="/portal" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      await screen.findByText(
        "We couldn't complete sign-in because the secure handoff data was missing. Please restart sign-in."
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restart sign-in" }));
    await waitFor(() => {
      expect(startLogin).toHaveBeenCalled();
    });
  });
});
