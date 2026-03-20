import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PermissionsPage from "./PermissionsPage.jsx";

vi.mock("../../../lib/uploadApi.js", () => ({
  getAdminMe: vi.fn(),
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

import { getAdminMe } from "../../../lib/uploadApi.js";
import { listAssociations, listSubscriptions, setSubscriptionStatus } from "../../../lib/permissionsApi.js";

describe("PermissionsPage subscriptions tab", () => {
  beforeEach(() => {
    getAdminMe.mockResolvedValue({ isAdmin: true });
    listAssociations.mockResolvedValue([]);
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

  it("renders subscriptions and allows manual activation", async () => {
    render(
      <MemoryRouter>
        <PermissionsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Permissions" })).toBeInTheDocument();
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
