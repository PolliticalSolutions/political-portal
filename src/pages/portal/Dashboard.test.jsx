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

    expect(screen.getByRole("heading", { name: "Portal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pricing Rules" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Enquiries & Support" })).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "Your selection" })).toBeInTheDocument();
    expect(screen.getByText("Big Federation")).toBeInTheDocument();
    expect(screen.getAllByText("Seat A").length).toBeGreaterThan(0);
    expect(screen.getByText("Seat B")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Review pricing with this selection, clear it, or continue with your onboarding steps."
      )
    ).toBeInTheDocument();

    const reviewLink = screen.getByRole("link", { name: "Review pricing with this selection" });
    expect(reviewLink.getAttribute("href")).toBe(
      "/portal/pricing-rules?association=Big+Federation&constituency=Seat+A"
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(sessionStorage.getItem("ps_signup_context_v1")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Your selection" })).not.toBeInTheDocument();
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

    expect(screen.getByRole("heading", { name: "Portal" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your selection" })).not.toBeInTheDocument();
  });
});
