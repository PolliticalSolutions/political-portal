import { fireEvent, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServiceSupport from "./ServiceSupport.jsx";
import { insertEnquiry } from "../lib/enquiriesApi.js";

vi.mock("../lib/enquiriesApi.js", () => ({
  insertEnquiry: vi.fn(async () => {}),
}));

describe("ServiceSupport", () => {
  const renderWithHelmet = (ui) => render(<HelmetProvider>{ui}</HelmetProvider>);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the service support heading and hero CTA", () => {
    renderWithHelmet(
      <MemoryRouter>
        <ServiceSupport />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: "Request Campaigning, Training & Election Support" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request election support" })).toHaveAttribute(
      "href",
      "/enquire?service=election-support"
    );
  });

  it("submits the enquiry and shows inline success message", async () => {
    renderWithHelmet(
      <MemoryRouter>
        <ServiceSupport />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex Doe" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }));

    await screen.findByText("Thank you — we'll be in touch within one working day.");
    expect(screen.getByRole("heading", { name: "Request Campaigning, Training & Election Support" })).toBeInTheDocument();
  });

  it("shows inline error message when Supabase insert fails", async () => {
    insertEnquiry.mockRejectedValueOnce(new Error("Network error"));

    renderWithHelmet(
      <MemoryRouter>
        <ServiceSupport />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex Doe" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Submit enquiry" }));

    await screen.findByText(/Something went wrong/);
    const emailLinks = screen.getAllByRole("link", { name: "paul@politicalsolutions.uk" });
    expect(emailLinks[0]).toHaveAttribute("href", "mailto:paul@politicalsolutions.uk");
  });
});
