import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CartEntry from "./CartEntry.jsx";

vi.mock("../lib/subscriptionApi.js", () => ({
  listAssociationsWithPricing: vi.fn(),
}));

import { listAssociationsWithPricing } from "../lib/subscriptionApi.js";

describe("CartEntry", () => {
  const renderWithHelmet = (ui) => render(<HelmetProvider>{ui}</HelmetProvider>);

  beforeEach(() => {
    vi.clearAllMocks();
    listAssociationsWithPricing.mockResolvedValue([
      {
        id: "assoc-1",
        name: "Test Association",
        region: "South East",
        constituency_count: 2,
        constituency_names: ["Seat A", "Seat B"],
        amount_ex_vat_pence: 75000,
        vat_pence: 15000,
        amount_inc_vat_pence: 90000,
      },
    ]);
  });

  it("renders the subscription cart with pricing", async () => {
    renderWithHelmet(
      <MemoryRouter>
        <CartEntry authed={false} />
      </MemoryRouter>
    );

    await waitFor(() => expect(listAssociationsWithPricing).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("combobox", { name: "Association" }), {
      target: { value: "assoc-1" },
    });

    expect(screen.getByRole("heading", { name: "Your subscription cart" })).toBeInTheDocument();
    expect(screen.getByText("£750.00")).toBeInTheDocument();
    expect(screen.getByText("£150.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to checkout" })).toBeEnabled();
  });
});
