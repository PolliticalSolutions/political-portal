import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import UpgradePrompt from "./UpgradePrompt.jsx";

describe("UpgradePrompt", () => {
  it("shows the missing access, price, and subscribe CTA", () => {
    render(
      <MemoryRouter>
        <UpgradePrompt missing="This constituency is not included in your subscription" />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: "This constituency is not included in your subscription" })
    ).toBeInTheDocument();
    expect(screen.getByText(/from £500.00 \+ VAT per year/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade your subscription" })).toHaveAttribute(
      "href",
      "/subscribe"
    );
  });
});
