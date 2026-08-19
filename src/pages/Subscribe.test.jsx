import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Subscribe from "./Subscribe.jsx";

vi.mock("../lib/subscriptionApi.js", () => ({
  listAssociationsWithPricing: vi.fn(),
  createSubscriptionCheckoutSession: vi.fn(),
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
    expect(screen.getAllByText("£900.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/Seat A, Seat B/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start annual Stripe subscription" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue to checkout" })).not.toBeInTheDocument();
  });

  it("requires a name and email before starting the annual Stripe subscription", async () => {
    render(
      <MemoryRouter>
        <Subscribe />
      </MemoryRouter>
    );

    await waitFor(() => expect(listAssociationsWithPricing).toHaveBeenCalled());
    expect(screen.getAllByText("£1,500.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("£3,300.00").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole("combobox", { name: "Association" }), {
      target: { value: "assoc-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start annual Stripe subscription" }));

    expect(
      screen.getByText("Enter your name and email address before continuing to Stripe Checkout.")
    ).toBeInTheDocument();
    expect(createSubscriptionCheckoutSession).not.toHaveBeenCalled();
  });

  it("preserves the annual Stripe Checkout request payload", async () => {
    createSubscriptionCheckoutSession.mockResolvedValueOnce({});
    render(
      <MemoryRouter>
        <Subscribe />
      </MemoryRouter>
    );

    await waitFor(() => expect(listAssociationsWithPricing).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("combobox", { name: "Association" }), {
      target: { value: "assoc-1" },
    });
    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Jane Smith" } });
    fireEvent.change(screen.getByLabelText("Email address *"), {
      target: { value: "jane@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start annual Stripe subscription" }));

    await waitFor(() =>
      expect(createSubscriptionCheckoutSession).toHaveBeenCalledWith({
        association_id: "assoc-1",
        constituency_count: 2,
        user_email: "jane@example.com",
        customer_name: "Jane Smith",
        cognito_sub: "",
      })
    );
    expect(
      screen.getByText("We couldn't open Stripe Checkout. Check your details and try again.")
    ).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Jane Smith" } });
    fireEvent.change(screen.getByLabelText("Email address *"), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText("Organisation or role"), { target: { value: "Agent" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "020 7946 0000" } });
    fireEvent.click(screen.getByRole("button", { name: "Request invoice" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Request invoice" })[1]);

    await waitFor(() =>
      expect(requestSubscriptionInvoice).toHaveBeenCalledWith({
        association_id: "assoc-1",
        user_email: "jane@example.com",
        customer_name: "Jane Smith",
        organisation_role: "Agent",
        phone: "020 7946 0000",
      })
    );
    expect(screen.getByRole("link", { name: "View invoice" })).toHaveAttribute(
      "href",
      "https://invoice.example.com"
    );
  });

  it("shows the cancelled Checkout return state without claiming payment failed", async () => {
    render(
      <MemoryRouter initialEntries={["/subscribe?cancelled=true"]}>
        <Subscribe />
      </MemoryRouter>
    );

    expect(
      screen.getByText(
        "You returned before completing Stripe Checkout. Review the subscription details and continue when you're ready."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/payment failed/i)).not.toBeInTheDocument();
    await waitFor(() => expect(listAssociationsWithPricing).toHaveBeenCalled());
  });

  it("shows and clears an empty association search state", async () => {
    render(
      <MemoryRouter>
        <Subscribe />
      </MemoryRouter>
    );

    await waitFor(() => expect(listAssociationsWithPricing).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Search associations"), {
      target: { value: "No matching association" },
    });

    expect(screen.getByText("No associations match that search.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByLabelText("Search associations")).toHaveValue("");
  });

  it("retries when association pricing cannot be loaded", async () => {
    listAssociationsWithPricing
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <Subscribe />
      </MemoryRouter>
    );

    expect(
      await screen.findByText("We couldn't load association pricing. Refresh the page and try again.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try loading again" }));
    await waitFor(() => expect(listAssociationsWithPricing).toHaveBeenCalledTimes(2));
  });
});
