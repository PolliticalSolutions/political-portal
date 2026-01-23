import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/cognito.js", () => ({
  startSignUp: vi.fn().mockResolvedValue(),
}));

vi.mock("../data/associations.json", () => ({
  default: {
    byAssociation: {
      "Big Federation": ["Seat A", "Seat B", "Seat C"],
    },
    byConstituency: {
      "Seat A": "Big Federation",
      "Seat B": "Big Federation",
      "Seat C": "Big Federation",
    },
  },
}));

import SignUp from "./SignUp.jsx";
import { startSignUp } from "../lib/cognito.js";

describe("SignUp", () => {
  it("renders pricing context and totals from query params", () => {
    render(
      <MemoryRouter initialEntries={["/signup?association=Big%20Federation&count=3"]}>
        <Routes>
          <Route path="/signup" element={<SignUp />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Pricing context captured")).toBeInTheDocument();
    expect(screen.getByText("3 constituencies")).toBeInTheDocument();
    expect(screen.getByText(/Total \(inc VAT\):/)).toBeInTheDocument();
  });

  it("starts hosted UI signup from the primary CTA", () => {
    render(
      <MemoryRouter initialEntries={["/signup?association=Big%20Federation&count=3"]}>
        <Routes>
          <Route path="/signup" element={<SignUp />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(startSignUp).toHaveBeenCalledWith("/portal");
  });

  it("stores returnTo on mount and preserves it in the login link", async () => {
    render(
      <MemoryRouter
        initialEntries={["/signup?association=Big%20Federation&count=3&returnTo=%2Fportal%2Fpricing-rules"]}
      >
        <Routes>
          <Route path="/signup" element={<SignUp />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(sessionStorage.getItem("ps_post_auth_redirect_v1")).toBe("/portal/pricing-rules");
    });

    expect(screen.getByText("After sign-in you'll return to Pricing Rules.")).toBeInTheDocument();

    const loginLink = screen.getByRole("link", { name: "Already have an account? Log in" });
    expect(loginLink.getAttribute("href")).toBe("/login?returnTo=%2Fportal%2Fpricing-rules");
  });
});
