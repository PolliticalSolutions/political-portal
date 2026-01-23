import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import QuoteDetail from "./QuoteDetail.jsx";

vi.mock("../../lib/quoteApi.js", () => ({
  getQuoteRequestAdmin: vi.fn(async () => ({
    record: {
      referenceId: "svc-1",
      createdAt: "2026-01-01T10:00:00.000Z",
      requestType: "SERVICE_ENQUIRY",
      serviceCategory: "ELECTION_SUPPORT",
      customer: { name: "Alex Doe", email: "alex@example.com", organisation: "Alpha Org" },
      notes: "Support request",
      items: [],
      totals: { subscriptionSubtotal: 0, oneOffSubtotal: 0, subtotal: 0 },
      xero: { requested: false },
      status: "received",
    },
  })),
  createServiceInvoice: vi.fn(async () => ({ ok: true })),
  getXeroStatus: vi.fn(async () => ({ emailInvoiceEnabled: true })),
}));

describe("QuoteDetail", () => {
  it("validates the service invoice modal fields", async () => {
    render(
      <MemoryRouter initialEntries={["/portal/ops/quotes/svc-1"]}>
        <Routes>
          <Route path="/portal/ops/quotes/:ref" element={<QuoteDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("svc-1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create draft invoice" }));
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));

    expect(await screen.findByText("Amount must be at least 1.")).toBeInTheDocument();
    expect(screen.getByText("Description is required.")).toBeInTheDocument();
  });
});
