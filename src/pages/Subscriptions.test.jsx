import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider } from "../cart/cartStore.jsx";
import Subscriptions from "./Subscriptions.jsx";
import { SELECTED_AREA_STORAGE_KEY } from "../utils/associationStorage.js";

vi.mock("../data/associations.json", () => ({
  default: {
    byAssociation: {
      "Alpha Association": ["Seat One"],
      "Beta Federation": ["Seat A", "Seat B"],
    },
    byConstituency: {
      "Seat One": "Alpha Association",
      "Seat A": "Beta Federation",
      "Seat B": "Beta Federation",
    },
  },
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <CartProvider>
        <Subscriptions />
      </CartProvider>
    </MemoryRouter>
  );

describe("Subscriptions", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("renders the subscriptions page", () => {
    renderPage();
    expect(
      screen.getByRole("heading", {
        name: "Association subscriptions for campaign operations",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Find your fit")).toBeInTheDocument();
  });

  it("recommends the correct tier based on circumstances selection", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /Growing team/i }));

    const growthCard = screen.getByTestId("tier-card-growth");
    expect(growthCard.getAttribute("data-recommended")).toBe("true");
  });

  it("requires an area selection before adding to cart", () => {
    renderPage();

    fireEvent.click(screen.getAllByRole("button", { name: "Select tier" })[0]);

    const addButton = screen.getByRole("button", { name: "Add to cart" });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Association/Federation"), {
      target: { value: "Alpha Association" },
    });

    expect(addButton).toBeEnabled();
  });

  it("adds a subscription and another product as separate line items", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Association/Federation"), {
      target: { value: "Alpha Association" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Select tier" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Marked Register Processing" }));

    const cartList = screen.getByTestId("cart-items");
    expect(within(cartList).getAllByRole("listitem")).toHaveLength(2);
  });

  it("prefills from valid stored area selection", () => {
    sessionStorage.setItem(
      SELECTED_AREA_STORAGE_KEY,
      JSON.stringify({ areaId: "Alpha Association", association: "Alpha Association", constituencyCount: 1 })
    );

    renderPage();

    expect(screen.getByLabelText("Association/Federation")).toHaveValue("Alpha Association");
  });

  it("clears invalid stored area selection", () => {
    sessionStorage.setItem(
      SELECTED_AREA_STORAGE_KEY,
      JSON.stringify({ areaId: "Invalid Area", association: "Invalid Area", constituencyCount: 1 })
    );

    renderPage();

    expect(screen.getByLabelText("Association/Federation")).toHaveValue("");
    expect(sessionStorage.getItem(SELECTED_AREA_STORAGE_KEY)).toBeNull();
  });

  it("updates subscription billing when toggling annual", () => {
    renderPage();

    fireEvent.change(screen.getByLabelText("Association/Federation"), {
      target: { value: "Alpha Association" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Select tier" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));

    expect(screen.getByText("Renews monthly")).toBeInTheDocument();
    const cartList = screen.getByTestId("cart-items");
    expect(within(cartList).getByText("£50.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));

    expect(screen.getByText("Renews annually")).toBeInTheDocument();
    expect(within(cartList).getByText("£540.00")).toBeInTheDocument();
  });
});
