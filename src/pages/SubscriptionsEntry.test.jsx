import { render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SubscriptionsEntry from "./SubscriptionsEntry.jsx";

vi.mock("../lib/subscriptionApi.js", () => ({
  listAssociationsWithPricing: vi.fn(),
  createSubscriptionPaymentIntent: vi.fn(),
  requestSubscriptionInvoice: vi.fn(),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }) => <div>{children}</div>,
  CardElement: () => <div data-testid="card-element" />,
  useStripe: () => ({ confirmCardPayment: vi.fn() }),
  useElements: () => ({ getElement: () => ({}) }),
}));

import { listAssociationsWithPricing } from "../lib/subscriptionApi.js";

describe("SubscriptionsEntry", () => {
  const renderWithHelmet = (ui) => render(<HelmetProvider>{ui}</HelmetProvider>);

  beforeEach(() => {
    vi.clearAllMocks();
    listAssociationsWithPricing.mockResolvedValue([
      {
        id: "assoc-1",
        name: "Test Association",
        region: "South East",
        constituency_count: 1,
        constituency_names: ["Seat A"],
        amount_ex_vat_pence: 50000,
        vat_pence: 10000,
        amount_inc_vat_pence: 60000,
      },
    ]);
  });

  it("renders subscription selection and checkout entry point", async () => {
    renderWithHelmet(
      <MemoryRouter>
        <SubscriptionsEntry authed={false} />
      </MemoryRouter>
    );

    await waitFor(() => expect(listAssociationsWithPricing).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Association subscriptions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to checkout" })).toBeInTheDocument();
  });
});
