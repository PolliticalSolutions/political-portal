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

import SignUp, { ACCOUNT_EXISTS_MESSAGE } from "./SignUp.jsx";

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
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
    expect(screen.getByLabelText("Job title")).toBeInTheDocument();
    await screen.findByRole("option", { name: "Aldershot" });
  });

  it("creates an onboarding account and redirects to the welcome login screen", async () => {
    renderSignup();

    await screen.findByRole("option", { name: "Aldershot" });
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jane Smith" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Association name"), { target: { value: "assoc-1" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "+447700900123" } });
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Agent" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(mocks.createOnboardingAccount).toHaveBeenCalledWith({
        fullName: "Jane Smith",
        email: "jane@example.com",
        associationId: "assoc-1",
        associationName: "Aldershot",
        phone: "+447700900123",
        jobTitle: "Agent",
      })
    );
    expect(await screen.findByText("Login page")).toBeInTheDocument();
  });

  it("blocks self-serve signup when the association already has an active account", async () => {
    mocks.activeAccount = true;
    renderSignup();

    await screen.findByRole("option", { name: "Aldershot" });
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Jane Smith" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Association name"), { target: { value: "assoc-1" } });
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Agent" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(ACCOUNT_EXISTS_MESSAGE)).toBeInTheDocument();
    expect(mocks.createOnboardingAccount).not.toHaveBeenCalled();
  });
});
