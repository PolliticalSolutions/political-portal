import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { CART_STORAGE_KEY, CartProvider } from "../cart/cartStore.jsx";
import { SUBSCRIPTION_COMPLIANCE } from "../data/subscriptions.js";
import { createCatalogLineItem } from "../data/products.js";
import Cart from "./Cart.jsx";

describe("Cart", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders items and removes a line item", () => {
    const oneOffItem = createCatalogLineItem("marked-register-entry", {
      metadata: { association: "Alpha Association" },
    });
    sessionStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        {
          lineId: "line_1",
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
        },
        { ...oneOffItem, lineId: "line_2" },
      ])
    );

    render(
      <MemoryRouter>
        <CartProvider>
          <Cart />
        </CartProvider>
      </MemoryRouter>
    );

    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);
    expect(screen.getByText("Renews monthly")).toBeInTheDocument();
    expect(screen.getByText(SUBSCRIPTION_COMPLIANCE.complianceLabel)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
  });
});
