import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Callback from "./Callback.jsx";

vi.mock("../lib/cognito.js", () => ({
  exchangeCodeForTokens: vi.fn().mockResolvedValue({ access_token: "token" }),
  clearStoredSession: vi.fn(),
}));

vi.mock("../auth/session.js", () => ({
  getSession: vi.fn(() => ({ isAuthed: false, reason: null })),
}));

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
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("navigates to the stored redirect after auth and clears the key", async () => {
    sessionStorage.setItem("ps_post_auth_redirect_v1", "/portal/pricing-rules?association=Test");

    render(
      <MemoryRouter initialEntries={["/callback?code=123"]}>
        <Routes>
          <Route path="/callback" element={<Callback />} />
          <Route path="/portal/pricing-rules" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Signing you in...")).toBeInTheDocument();
    expect(screen.getByText("Returning you to Pricing Rules.")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("location-display").textContent).toContain(
        "/portal/pricing-rules?association=Test"
      );
    });
    expect(sessionStorage.getItem("ps_post_auth_redirect_v1")).toBeNull();
  });

  it("falls back to /portal for unsafe redirects and clears the key", async () => {
    sessionStorage.setItem("ps_post_auth_redirect_v1", "https://evil.com");

    render(
      <MemoryRouter initialEntries={["/callback?code=123"]}>
        <Routes>
          <Route path="/callback" element={<Callback />} />
          <Route path="/portal" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Signing you in...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("location-display").textContent).toContain("/portal");
    });
    expect(sessionStorage.getItem("ps_post_auth_redirect_v1")).toBeNull();
  });
});
