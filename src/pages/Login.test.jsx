import { render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, beforeEach } from "vitest";
import Login from "./Login.jsx";

describe("Login", () => {
  const renderWithHelmet = (ui) => render(<HelmetProvider>{ui}</HelmetProvider>);

  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stores returnTo on mount and preserves it in the signup link", async () => {
    renderWithHelmet(
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

    expect(screen.queryByText("Secure sign-in")).not.toBeInTheDocument();
    expect(screen.queryByText("After sign-in you'll return to Dashboard.")).not.toBeInTheDocument();
    expect(screen.getByText("After sign-in you'll be directed to the pricing rules")).toBeInTheDocument();
    expect(screen.queryByText("Create account with pricing selection")).not.toBeInTheDocument();
    expect(screen.queryByText("Authentication is handled by AWS Cognito.")).not.toBeInTheDocument();
    expect(screen.queryByText("Hosted by AWS Cognito with PKCE for security.")).not.toBeInTheDocument();
  });
});
