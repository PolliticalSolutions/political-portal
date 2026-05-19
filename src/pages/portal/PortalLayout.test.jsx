import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalLayout from "./PortalLayout.jsx";
import * as uploadApi from "../../lib/uploadApi.js";

vi.mock("../../lib/uploadApi.js", async () => {
  const actual = await vi.importActual("../../lib/uploadApi.js");
  return {
    ...actual,
    getMe: vi.fn(),
    getAdminMe: vi.fn(),
    applyForApproval: vi.fn(),
    listOrganisations: vi.fn(),
  };
});

// Stub the session helpers so the layout treats our fake token as valid and
// doesn't trip the auto-clear path inside getSession (which would otherwise
// nuke sessionStorage and bypass the /me fetch entirely).
vi.mock("../../auth/session.js", () => ({
  getSession: () => ({
    isAuthed: true,
    user: { sub: "test-sub" },
    expiresAt: Date.now() + 60_000,
    tokens: { access_token: "token" },
    reason: null,
  }),
  getStoredTokens: () => ({ access_token: "token" }),
  isSessionValid: () => true,
  isTokenValid: () => true,
  decodeJwtPayload: () => ({ sub: "test-sub" }),
  storeTokens: vi.fn(),
  clearSession: vi.fn(),
  tokensKey: "cognito_tokens",
}));

describe("PortalLayout", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    uploadApi.getMe.mockReset();
    uploadApi.getAdminMe.mockReset();
    uploadApi.applyForApproval.mockReset();
    uploadApi.listOrganisations.mockReset();
    uploadApi.getMe.mockResolvedValue({ user: { status: "APPROVED" } });
    uploadApi.getAdminMe.mockResolvedValue({ isAdmin: false });
    uploadApi.listOrganisations.mockResolvedValue({ items: [] });
  });

  it("renders portal navigation", async () => {
    sessionStorage.setItem("cognito_tokens", JSON.stringify({ access_token: "token" }));

    render(
      <HelmetProvider>
        <MemoryRouter>
          <PortalLayout />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(await screen.findByRole("navigation", { name: "Portal" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Local Government" })).toHaveAttribute(
      "href",
      "/portal/local-government"
    );
    expect(screen.getByRole("link", { name: "Reform Threat" })).toHaveAttribute(
      "href",
      "/portal/constituency/reform-threat"
    );
    expect(screen.getByRole("link", { name: "Target Seats 2029" })).toHaveAttribute(
      "href",
      "/portal/constituency/target-seats"
    );
    expect(screen.queryByRole("link", { name: "By-Election Watch" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Correlations" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Model Performance" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More analytics" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Subscriptions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pricing rules" })).not.toBeInTheDocument();
  });

  it("expands analytics links and remembers the toggle state", async () => {
    sessionStorage.setItem("cognito_tokens", JSON.stringify({ access_token: "token" }));

    render(
      <HelmetProvider>
        <MemoryRouter>
          <PortalLayout />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(await screen.findByRole("navigation", { name: "Portal" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More analytics" }));

    expect(screen.getByRole("link", { name: "By-Election Watch" })).toHaveAttribute(
      "href",
      "/portal/analytics/by-election-watch"
    );
    expect(screen.getByRole("link", { name: "Correlations" })).toHaveAttribute(
      "href",
      "/portal/analytics/correlations"
    );
    expect(screen.getByRole("link", { name: "Model Performance" })).toHaveAttribute(
      "href",
      "/portal/analytics/model-performance"
    );
    expect(localStorage.getItem("ps_portal_analytics_expanded_v1")).toBe("true");
  });

  it("shows loading skeleton cards while account status is loading", async () => {
    let resolveMe;
    uploadApi.getMe.mockReturnValue(
      new Promise((resolve) => {
        resolveMe = resolve;
      })
    );
    sessionStorage.setItem("cognito_tokens", JSON.stringify({ access_token: "token" }));

    const { container } = render(
      <HelmetProvider>
        <MemoryRouter>
          <PortalLayout />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(container.querySelectorAll(".portal-skeleton-cta")).toHaveLength(4);

    resolveMe({ user: { status: "APPROVED" } });

    expect(await screen.findByRole("navigation", { name: "Portal" })).toBeInTheDocument();
  });

  it("renders pending approval screen when /me returns PENDING", async () => {
    sessionStorage.setItem("cognito_tokens", JSON.stringify({ access_token: "token" }));
    uploadApi.getMe.mockResolvedValue({
      user: { status: "PENDING", requestedOrgId: "", requestedPconCode: "" },
    });

    render(
      <HelmetProvider>
        <MemoryRouter>
          <PortalLayout />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(await screen.findByRole("heading", { name: "Pending approval" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Portal" })).not.toBeInTheDocument();
  });

  it("uses organisation dropdown in pending application form", async () => {
    sessionStorage.setItem("cognito_tokens", JSON.stringify({ access_token: "token" }));
    uploadApi.getMe.mockResolvedValue({
      user: { status: "PENDING", requestedOrgId: "", requestedPconCode: "" },
    });
    uploadApi.listOrganisations.mockResolvedValue({
      items: [
        {
          orgId: "org-request-1",
          name: "Requested Organisation",
          orgType: "ASSOCIATION",
          pconCodes: ["E14000999"],
        },
      ],
    });
    uploadApi.applyForApproval.mockResolvedValue({
      user: {
        status: "PENDING",
        requestedOrgId: "org-request-1",
        requestedPconCode: "E14000999",
      },
    });

    render(
      <HelmetProvider>
        <MemoryRouter>
          <PortalLayout />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(await screen.findByRole("heading", { name: "Pending approval" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Requested Organisation" })).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText(/^Organisation$/), {
      target: { value: "org-request-1" },
    });
    fireEvent.change(screen.getByLabelText(/Requested constituency code/i), {
      target: { value: "E14000999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit application" }));

    await waitFor(() => {
      expect(uploadApi.applyForApproval).toHaveBeenCalledWith({
        requestedOrgId: "org-request-1",
        requestedPconCode: "E14000999",
      });
    });
  });

  it("renders service unavailable view when /me fails", async () => {
    sessionStorage.setItem("cognito_tokens", JSON.stringify({ access_token: "token" }));
    uploadApi.getMe.mockRejectedValue(new Error("Service down"));

    render(
      <HelmetProvider>
        <MemoryRouter>
          <PortalLayout />
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(await screen.findByRole("heading", { name: "Service unavailable" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Portal" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
