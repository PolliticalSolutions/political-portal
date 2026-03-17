import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, beforeEach } from "vitest";
import Dashboard from "./Dashboard.jsx";

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
  });

  it("renders the basic dashboard sections", () => {
    render(
      <MemoryRouter initialEntries={["/portal"]}>
        <Routes>
          <Route path="/portal" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(document.querySelector(".portal-dashboard-grid")).toBeInTheDocument();
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
      <MemoryRouter initialEntries={["/portal"]}>
        <Routes>
          <Route path="/portal" element={<Dashboard />} />
          <Route path="/portal/pricing-rules" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Current selection:/)).toBeInTheDocument();
    expect(screen.getByText("Seat A")).toBeInTheDocument();
    const reviewLink = screen.getByRole("link", { name: "Review account pricing" });
    expect(reviewLink.getAttribute("href")).toBe(
      "/portal/pricing-rules?association=Big+Federation&constituency=Seat+A"
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear saved selection" }));
    expect(sessionStorage.getItem("ps_signup_context_v1")).toBeNull();
    expect(screen.queryByText(/Current selection:/)).not.toBeInTheDocument();
  });

  it("hides the selection section when context is missing or invalid", () => {
    sessionStorage.setItem("ps_signup_context_v1", "not-json");

    render(
      <MemoryRouter initialEntries={["/portal"]}>
        <Routes>
          <Route path="/portal" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByText(/Current selection:/)).not.toBeInTheDocument();
  });
});
