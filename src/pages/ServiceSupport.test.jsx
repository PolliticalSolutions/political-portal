import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ServiceSupport from "./ServiceSupport.jsx";

vi.mock("../lib/quoteApi.js", () => ({
  postServiceEnquiry: vi.fn(async () => ({ referenceId: "svc-123" })),
}));

describe("ServiceSupport", () => {
  const renderWithHelmet = (ui) => render(<HelmetProvider>{ui}</HelmetProvider>);

  it("renders the service support heading", () => {
    renderWithHelmet(
      <MemoryRouter>
        <ServiceSupport />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: "Request election & by-election support" })
    ).toBeInTheDocument();
  });

  it("sets the SEO title and description", async () => {
    renderWithHelmet(
      <MemoryRouter>
        <ServiceSupport />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(document.title).toContain("Election and by-election support");
    });

    const description = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    expect(description).toContain("UK-wide");
  });

  it("submits the enquiry and shows a reference", async () => {
    renderWithHelmet(
      <MemoryRouter>
        <ServiceSupport />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex Doe" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }));

    expect(await screen.findByText("Request received")).toBeInTheDocument();
    expect(screen.getByText("Reference: svc-123")).toBeInTheDocument();
  });
});
