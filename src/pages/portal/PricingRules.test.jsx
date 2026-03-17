import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../data/associations.json", () => ({
  default: {
    byAssociation: {
      "Single Assoc": ["One Seat"],
      "Big Federation": ["Seat A", "Seat B", "Seat C"],
    },
    byConstituency: {
      "One Seat": "Single Assoc",
      "Seat A": "Big Federation",
      "Seat B": "Big Federation",
      "Seat C": "Big Federation",
    },
  },
}));

import PricingRules from "./PricingRules.jsx";

describe("PricingRules", () => {
  it("renders the pricing rules summary", () => {
    render(
      <MemoryRouter>
        <PricingRules />
      </MemoryRouter>
    );

    expect(screen.getByText("Pricing rules")).toBeInTheDocument();
    expect(screen.getByText("Association/Federation")).toBeInTheDocument();
    expect(screen.getByText("Constituency")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter associations...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter constituencies...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear association filter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear constituency filter" })).toBeInTheDocument();
  });

  it("renders the print button", () => {
    render(
      <MemoryRouter>
        <PricingRules />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "Print / Save as PDF" })).toBeInTheDocument();
  });

  it("calls window.print when clicking the button", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});

    render(
      <MemoryRouter>
        <PricingRules />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Print / Save as PDF" }));

    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it("selecting an association shows details and totals", () => {
    render(
      <MemoryRouter>
        <PricingRules />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Association/Federation"), {
      target: { value: "Big Federation" },
    });

    expect(screen.getByLabelText("Association/Federation")).toHaveValue("Big Federation");
    expect(screen.getByText("Federation • 3 constituencies")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Total (ex VAT)")).toBeInTheDocument();
    expect(screen.getByText("£1,000.00")).toBeInTheDocument();
  });

  it("selecting a constituency sets the association selection", () => {
    render(
      <MemoryRouter>
        <PricingRules />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Constituency"), {
      target: { value: "Seat B" },
    });

    expect(screen.getByLabelText("Association/Federation")).toHaveValue("Big Federation");
  });

  it("filters associations by substring", () => {
    render(
      <MemoryRouter>
        <PricingRules />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText("Filter associations..."), {
      target: { value: "big" },
    });

    const associationSelect = screen.getByLabelText("Association/Federation");
    const options = within(associationSelect).getAllByRole("option").map((option) => option.textContent);

    expect(options).toEqual(["Select an association/federation", "Big Federation"]);
  });

  it("keeps the selected association visible when filtered out", () => {
    render(
      <MemoryRouter>
        <PricingRules />
      </MemoryRouter>
    );

    const associationSelect = screen.getByLabelText("Association/Federation");
    fireEvent.change(associationSelect, {
      target: { value: "Big Federation" },
    });

    fireEvent.change(screen.getByPlaceholderText("Filter associations..."), {
      target: { value: "zzz" },
    });

    expect(associationSelect).toHaveValue("Big Federation");
    expect(within(associationSelect).getByRole("option", { name: "Big Federation" }).selected).toBe(true);
  });

  it("preselects by association query param", () => {
    render(
      <MemoryRouter initialEntries={["/portal/pricing-rules?association=Big%20Federation"]}>
        <PricingRules />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("Association/Federation")).toHaveValue("Big Federation");
    expect(
      screen.getAllByText(
        (_, element) =>
          element?.textContent?.includes("Federation") &&
          element?.textContent?.includes("3 constituenc")
      ).length
    ).toBeGreaterThan(0);
  });

  it("preselects by constituency query param over association", () => {
    render(
      <MemoryRouter initialEntries={["/portal/pricing-rules?association=Single%20Assoc&constituency=Seat%20B"]}>
        <PricingRules />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("Association/Federation")).toHaveValue("Big Federation");
    expect(screen.getByLabelText("Constituency")).toHaveValue("Seat B");
    expect(
      screen.getAllByText(
        (_, element) =>
          element?.textContent?.includes("Federation") &&
          element?.textContent?.includes("3 constituenc")
      ).length
    ).toBeGreaterThan(0);
  });

  it("clears the association filter without changing selection", () => {
    render(
      <MemoryRouter>
        <PricingRules />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText("Filter associations..."), {
      target: { value: "big" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear association filter" }));

    expect(screen.getByPlaceholderText("Filter associations...")).toHaveValue("");
    const associationSelect = screen.getByLabelText("Association/Federation");
    const options = within(associationSelect).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Select an association/federation", "Big Federation", "Single Assoc"]);
  });
});
