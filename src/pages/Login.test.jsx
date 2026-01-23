import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, beforeEach } from "vitest";
import Login from "./Login.jsx";

describe("Login", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores returnTo on mount and preserves it in the signup link", async () => {
    render(
      <MemoryRouter
        initialEntries={["/login?returnTo=%2Fportal%2Fpricing-rules%3Fassociation%3DTest"]}
      >
        <Routes>
          <Route path="/login" element={<Login authed={false} />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(sessionStorage.getItem("ps_post_auth_redirect_v1")).toBe(
        "/portal/pricing-rules?association=Test"
      );
    });

    expect(
      screen.getByText("After sign-in you'll return to Pricing Rules.")
    ).toBeInTheDocument();

    const signupLink = screen.getByRole("link", { name: "Create account with pricing selection" });
    expect(signupLink.getAttribute("href")).toBe(
      "/signup?returnTo=%2Fportal%2Fpricing-rules%3Fassociation%3DTest"
    );
  });
});
