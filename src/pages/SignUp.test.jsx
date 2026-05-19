import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activeAccount: false,
  createOnboardingAccount: vi.fn(),
  associations: [
    { id: "assoc-1", name: "Aldershot" },
    { id: "assoc-2", name: "Basingstoke" },
  ],
}));

vi.mock("../lib/uploadApi.js", () => ({
  createOnboardingAccount: mocks.createOnboardingAccount,
}));

vi.mock("../lib/supabase.js", () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === "associations") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: mocks.associations, error: null })),
          })),
        };
      }

      if (table === "user_permissions") {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          limit: vi.fn(() =>
            Promise.resolve({
              data: mocks.activeAccount ? [{ id: "permission-1" }] : [],
              error: null,
            })
          ),
        };
        return builder;
      }

      return {
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
      };
    }),
  },
}));

import SignUp from "./SignUp.jsx";

describe("SignUp", () => {
  beforeEach(() => {
    mocks.activeAccount = false;
    mocks.createOnboardingAccount.mockReset();
    mocks.createOnboardingAccount.mockResolvedValue({ success: true });
  });

  const renderSignup = () =>
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/signup"]}>
          <Routes>
            <Route path="/signup" element={<SignUp />} />
            <Route path="/login" element={<div>Login page</div>} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    );

  it("renders the onboarding form and association dropdown", async () => {
    renderSignup();

    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone Number")).toBeInTheDocument();
    expect(screen.getByLabelText("Association/Federation")).toBeInTheDocument();
    await screen.findByRole("option", { name: "Aldershot" });
  });

  it("creates an onboarding account and redirects to the welcome login screen", async () => {
    renderSignup();

    await screen.findByRole("option", { name: "Aldershot" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Smith" } });
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Association/Federation"), { target: { value: "assoc-1" } });
    fireEvent.change(screen.getByLabelText("Phone Number"), { target: { value: "07700900123" } });
    fireEvent.change(document.querySelector('input[name="password"]'), {
      target: { value: "Sup3rSecret!" },
    });
    fireEvent.change(document.querySelector('input[name="confirmPassword"]'), {
      target: { value: "Sup3rSecret!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(mocks.createOnboardingAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Jane Smith",
          fullName: "Jane Smith",
          email: "jane@example.com",
          associationId: "assoc-1",
          associationName: "Aldershot",
          phone: "07700900123",
          password: "Sup3rSecret!",
        }),
      )
    );
    expect(await screen.findByText("Login page")).toBeInTheDocument();
  });

  // The "association already has an active account" pre-check was removed
  // from SignUp.jsx — the source no longer queries user_permissions or
  // exports ACCOUNT_EXISTS_MESSAGE. The block-on-duplicate behaviour now
  // lives downstream in the onboarding API.
});
