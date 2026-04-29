import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, beforeEach, vi } from "vitest";
import Dashboard from "./Dashboard.jsx";

vi.mock("../../lib/subscriptionApi.js", () => ({
  getUserSubscriptionStatus: vi.fn(() => Promise.resolve("active")),
}));

import { getUserSubscriptionStatus } from "../../lib/subscriptionApi.js";

function LocationDisplay() {
  const location = useLocation();
  return (
    <div data-testid="location-display">
      {location.pathname}
      {location.search}
    </div>
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    sessionStorage.clear();
    getUserSubscriptionStatus.mockResolvedValue("active");
  });

  it("renders the basic dashboard sections", async () => {
    const { container } = render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/portal"]}>
          <Routes>
            <Route path="/portal" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    await act(async () => {});

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(document.querySelector(".portal-dashboard-grid")).toBeInTheDocument();
    const cards = [...container.querySelectorAll(".portal-dashboard-card")];
    expect(cards).toHaveLength(4);
    cards.forEach((card) => {
      expect(card).toHaveClass("portal-dashboard-card");
    });
    expect(screen.getByRole("heading", { name: "Marked Register Processing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Constituency Intelligence" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Campaigning, Training & Election Support" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Account and subscriptions" })).toBeInTheDocument();
  });

  it("shows stored signup context and supports review/clear actions", async () => {
    sessionStorage.setItem(
      "ps_signup_context_v1",
      JSON.stringify({
        association: "Big Federation",
        constituency: "Seat A",
        constituencies: ["Seat A", "Seat B"],
      })
    );

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/portal"]}>
          <Routes>
            <Route path="/portal" element={<Dashboard />} />
            <Route path="/portal/subscriptions" element={<LocationDisplay />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    await act(async () => {});

    expect(await screen.findByText(/Current selection:/)).toBeInTheDocument();
    expect(screen.getByText("Seat A")).toBeInTheDocument();
    const reviewLink = screen.getByRole("link", { name: "Review account pricing" });
    expect(reviewLink.getAttribute("href")).toBe(
      "/portal/subscriptions?association=Big+Federation&constituency=Seat+A"
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear saved selection" }));
    expect(sessionStorage.getItem("ps_signup_context_v1")).toBeNull();
    expect(screen.queryByText(/Current selection:/)).not.toBeInTheDocument();
  });

  it("hides the selection section when context is missing or invalid", async () => {
    sessionStorage.setItem("ps_signup_context_v1", "not-json");

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/portal"]}>
          <Routes>
            <Route path="/portal" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    await act(async () => {});

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByText(/Current selection:/)).not.toBeInTheDocument();
  });

  it("shows an access-limited banner when there is no active subscription", async () => {
    getUserSubscriptionStatus.mockResolvedValue("none");

    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/portal"]}>
          <Routes>
            <Route path="/portal" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    );

    expect(
      await screen.findByText("You don't have an active subscription. Access is limited.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade your subscription" })).toHaveAttribute(
      "href",
      "/subscribe"
    );
  });
});
