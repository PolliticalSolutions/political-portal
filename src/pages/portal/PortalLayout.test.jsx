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

describe("PortalLayout", () => {
  beforeEach(() => {
    sessionStorage.clear();
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
