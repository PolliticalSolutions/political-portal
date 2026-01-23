import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import SubscriptionsEntry from "./SubscriptionsEntry.jsx";

describe("SubscriptionsEntry", () => {
  it("renders portal access messaging when logged out", () => {
    render(
      <MemoryRouter>
        <SubscriptionsEntry authed={false} />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: "Subscriptions are available in the Portal" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request access / create account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View our services" })).toBeInTheDocument();
  });
});
