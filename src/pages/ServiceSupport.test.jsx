import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ServiceSupport from "./ServiceSupport.jsx";
import { insertEnquiry } from "../lib/enquiriesApi.js";

vi.mock("../lib/enquiriesApi.js", () => ({
  insertEnquiry: vi.fn(async () => {}),
}));

describe("ServiceSupport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the approved campaign-management hierarchy and secondary route", () => {
    render(
      <MemoryRouter>
        <ServiceSupport />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", {
        name: "Data-led campaign management across the electoral cycle",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Candidate coaching" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Officer mentoring and volunteer briefings" })
    ).toBeInTheDocument();
    screen.getAllByRole("link", { name: "Use the general enquiry form" }).forEach((link) => {
      expect(link).toHaveAttribute("href", "/enquire?service=election-support");
    });
  });

  it("submits an optional empty brief and shows the approved inline success message", async () => {
    render(
      <MemoryRouter>
        <ServiceSupport />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex Doe" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Send campaign-support enquiry" }));

    await screen.findByText("Thank you. Your campaign-support enquiry has been sent.");
    expect(insertEnquiry).toHaveBeenCalledWith({
      name: "Alex Doe",
      email: "alex@example.com",
      organisation: "",
      message: "",
    });
  });

  it("associates validation errors with the required fields", () => {
    render(
      <MemoryRouter>
        <ServiceSupport />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Send campaign-support enquiry" }));

    expect(screen.getByLabelText("Name *")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email *")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Name is required.")).toHaveAttribute(
      "id",
      "campaign-support-name-error"
    );
  });

  it("shows the approved inline error message when the enquiry insert fails", async () => {
    insertEnquiry.mockRejectedValueOnce(new Error("Network error"));

    render(
      <MemoryRouter>
        <ServiceSupport />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex Doe" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Send campaign-support enquiry" }));

    await screen.findByText(/Something went wrong/);
    const errorAlert = screen.getByRole("alert");
    expect(errorAlert).toBeInTheDocument();
    expect(within(errorAlert).getByRole("link", { name: "paul@politicalsolutions.uk" })).toHaveAttribute(
      "href",
      "mailto:paul@politicalsolutions.uk"
    );
  });
});
