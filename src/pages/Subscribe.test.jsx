import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Subscribe from "./Subscribe.jsx";

vi.mock("../lib/subscriptionApi.js", () => ({
  listAssociationsWithPricing: vi.fn(),
  createSubscriptionCheckoutSession: vi.fn(),
  createSubscriptionPaymentIntent: vi.fn(),
  requestSubscriptionInvoice: vi.fn(),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }) => <div>{children}</div>,
  CardElement: () => <div data-testid="card-element" />,
  useStripe: () => ({
    confirmCardPayment: vi.fn().mockResolvedValue({
      paymentIntent: { id: "pi_test" },
    }),
  }),
  useElements: () => ({
    getElement: () => ({}),
  }),
}));

import {
  createSubscriptionCheckoutSession,
  createSubscriptionPaymentIntent,
  listAssociationsWithPricing,
  requestSubscriptionInvoice,
} from "../lib/subscriptionApi.js";

describe("Subscribe", () => {
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
    createSubscriptionCheckoutSession.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
    createSubscriptionPaymentIntent.mockResolvedValue({ client_secret: "pi_secret" });
    requestSubscriptionInvoice.mockResolvedValue({ invoice_url: "https://invoice.example.com" });
  });

  it("renders association pricing and constituency coverage", async () => {
    render(
      <MemoryRouter>
        <Subscribe />
      </MemoryRouter>
    );

    await waitFor(() => expect(listAssociationsWithPricing).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("combobox", { name: "Association" }), {
      target: { value: "assoc-1" },
    });

    expect(screen.getAllByText("£750.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/Seat A, Seat B/)).toBeInTheDocument();
  });

  it("requests an invoice for the selected association", async () => {
    render(
      <MemoryRouter>
        <Subscribe />
      </MemoryRouter>
    );

    await waitFor(() => expect(listAssociationsWithPricing).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("combobox", { name: "Association" }), {
      target: { value: "assoc-1" },
    });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jane Smith" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "jane@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Request invoice" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Request invoice" })[1]);

    await waitFor(() =>
      expect(requestSubscriptionInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          association_id: "assoc-1",
          user_email: "jane@example.com",
        })
      )
    );
  });
});
