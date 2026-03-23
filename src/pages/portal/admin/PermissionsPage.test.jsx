import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PermissionsPage from "./PermissionsPage.jsx";

vi.mock("../../../lib/uploadApi.js", () => ({
  approveAdminUser: vi.fn(),
  getAdminMe: vi.fn(),
  listAdminUsers: vi.fn(),
  listOrganisations: vi.fn(),
  rejectAdminUser: vi.fn(),
}));

vi.mock("../../../lib/permissionsApi.js", () => ({
  getPermissionsByEmail: vi.fn(),
  grantPermission: vi.fn(),
  listAssociations: vi.fn(),
  listSubscriptions: vi.fn(),
  revokePermission: vi.fn(),
  setSubscriptionStatus: vi.fn(),
}));

vi.mock("../../../auth/session.js", () => ({
  getSession: () => ({ user: { email: "admin@example.com" } }),
}));

import {
  approveAdminUser,
  getAdminMe,
  listAdminUsers,
  listOrganisations,
} from "../../../lib/uploadApi.js";
import { listAssociations, listSubscriptions, setSubscriptionStatus } from "../../../lib/permissionsApi.js";

describe("PermissionsPage", () => {
  beforeEach(() => {
    getAdminMe.mockResolvedValue({ isAdmin: true });
    listAssociations.mockResolvedValue([]);
    listOrganisations.mockImplementation(async ({ orgType }) => ({
      items: orgType === "ASSOCIATION"
        ? [{ orgId: "org-a", name: "North Association", pconCodes: ["E14000637"] }]
        : [],
    }));
    listAdminUsers.mockImplementation(async ({ status }) => ({
      items: status === "PENDING"
        ? [
            {
              userId: "user-sub-1",
              email: "user@example.com",
              status: "PENDING",
              requestedOrgId: "org-a",
              requestedOrgType: "ASSOCIATION",
              requestedPconCodes: ["E14000637"],
              createdAt: "2026-03-23T12:00:00.000Z",
            },
          ]
        : [],
    }));
    approveAdminUser.mockResolvedValue({ user: { userId: "user-sub-1", status: "APPROVED" } });
    listSubscriptions.mockResolvedValue([
      {
        id: "sub-1",
        status: "pending",
        user_email: "chair@example.com",
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        amount_inc_vat: 900,
        billing_period_end: "2027-03-20",
        associations: { name: "Test Association" },
      },
    ]);
    setSubscriptionStatus.mockResolvedValue();
  });

  it("loads DynamoDB users and approves a pending user", async () => {
    render(
      <MemoryRouter>
        <PermissionsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Users" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PENDING" }));

    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve user" }));

    await waitFor(() =>
      expect(approveAdminUser).toHaveBeenCalledWith(
        "user-sub-1",
        expect.objectContaining({
          orgId: "org-a",
          orgType: "ASSOCIATION",
          allowedPconCodes: ["E14000637"],
        })
      )
    );
  });

  it("renders subscriptions and allows manual activation", async () => {
    render(
      <MemoryRouter>
        <PermissionsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Users" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Subscriptions" }));

    expect(await screen.findByText("Test Association")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() =>
      expect(setSubscriptionStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionId: "sub-1",
          status: "active",
          activatePermissions: true,
        })
      )
    );
  });
});
