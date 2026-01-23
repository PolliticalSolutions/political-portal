import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider, useCart } from "../cart/cartStore.jsx";
import { SUBSCRIPTION_COMPLIANCE } from "../data/subscriptions.js";
import * as quoteApi from "../lib/quoteApi.js";
import Checkout from "./Checkout.jsx";
import CheckoutConfirmation from "./CheckoutConfirmation.jsx";

vi.mock("../lib/quoteApi.js", () => ({
  getXeroStatus: vi.fn(),
  postQuoteRequest: vi.fn(),
}));

const CartCount = () => {
  const { items } = useCart();
  return <div data-testid="cart-count">Cart count: {items.length}</div>;
};

const SeedCart = ({ children, withSubscription }) => {
  const { addItem } = useCart();

  useEffect(() => {
    if (!withSubscription) return;
    addItem({
      productId: "subscription-foundation",
      name: "Foundation subscription",
      unitPrice: 50,
      billingPeriod: "monthly",
      category: "subscription",
      quantity: 1,
      complianceLabel: SUBSCRIPTION_COMPLIANCE.complianceLabel,
      invoiceDescription: SUBSCRIPTION_COMPLIANCE.invoiceDescription,
      metadata: {
        areaId: "Alpha Association",
        areaName: "Alpha Association",
        tier: "foundation",
        billingPeriod: "monthly",
        clusterSize: "1-5",
      },
    });
  }, [withSubscription]);

  return children;
};

const renderCheckout = ({ withSubscription = true } = {}) =>
  render(
    <MemoryRouter initialEntries={["/checkout"]}>
      <CartProvider>
        <SeedCart withSubscription={withSubscription}>
          <CartCount />
          <Routes>
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/checkout/confirmation" element={<CheckoutConfirmation />} />
          </Routes>
        </SeedCart>
      </CartProvider>
    </MemoryRouter>
  );

describe("Checkout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    quoteApi.getXeroStatus.mockResolvedValue({ ok: true, connected: false });
    sessionStorage.clear();
  });

  it("submits a valid request and navigates to confirmation", async () => {
    quoteApi.postQuoteRequest.mockResolvedValue({
      ok: true,
      referenceId: "ref_123",
      createdAt: "2026-01-01T12:00:00Z",
      items: [],
      totals: { subtotal: 50, subscriptionSubtotal: 50, oneOffSubtotal: 0 },
      xero: { connected: false },
    });
    renderCheckout();

    await screen.findByLabelText("Full name *");
    fireEvent.change(screen.getByLabelText("Full name *"), { target: { value: "Alex Doe" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Organisation / Association *"), {
      target: { value: "Alpha Association" },
    });
    fireEvent.change(screen.getByLabelText("Role *"), { target: { value: "Chair" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() => {
      expect(quoteApi.postQuoteRequest).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("Request received")).toBeInTheDocument();
    expect(screen.getByTestId("cart-count")).toHaveTextContent("Cart count: 0");
  });

  it("does not submit without compliance acknowledgement when subscriptions are present", async () => {
    quoteApi.postQuoteRequest.mockResolvedValue({ ok: true });
    renderCheckout();

    await screen.findByLabelText("Full name *");
    fireEvent.change(screen.getByLabelText("Full name *"), { target: { value: "Alex Doe" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Organisation / Association *"), {
      target: { value: "Alpha Association" },
    });
    fireEvent.change(screen.getByLabelText("Role *"), { target: { value: "Chair" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));

    expect(screen.getByText("Please confirm the compliance acknowledgement.")).toBeInTheDocument();
    expect(quoteApi.postQuoteRequest).not.toHaveBeenCalled();
  });

  it("keeps cart items when submission fails", async () => {
    quoteApi.postQuoteRequest.mockRejectedValue(new Error("Network error"));
    renderCheckout();

    await screen.findByLabelText("Full name *");
    fireEvent.change(screen.getByLabelText("Full name *"), { target: { value: "Alex Doe" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Organisation / Association *"), {
      target: { value: "Alpha Association" },
    });
    fireEvent.change(screen.getByLabelText("Role *"), { target: { value: "Chair" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() => {
      expect(quoteApi.postQuoteRequest).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId("cart-count")).toHaveTextContent("Cart count: 1");
    expect(screen.getByText("Unable to submit right now. Please try again shortly.")).toBeInTheDocument();
  });

  it("shows the Xero invoice toggle only when connected", async () => {
    quoteApi.getXeroStatus.mockResolvedValueOnce({ ok: true, connected: true, tenantName: "Alpha Org" });
    renderCheckout();

    expect(await screen.findByText("Create invoice in Xero now (Alpha Org).")).toBeInTheDocument();
  });
});
