import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EnquirePage, { buildEnquiryMailto } from "./EnquirePage.jsx";

vi.mock("../data/associations.json", () => ({
  default: {
    byAssociation: {
      "Big Federation": ["Seat A", "Seat B", "Seat C"],
    },
  },
}));

describe("EnquirePage", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.stubEnv("VITE_ENQUIRY_API_URL", "");
    Object.defineProperty(window, "location", {
      value: { href: "https://example.test/enquire" },
      writable: true,
    });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = undefined;
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });

  it("validates required fields on submit", () => {
    render(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Message is required.")).toBeInTheDocument();
  });

  it("builds a mailto with subject and body content", () => {
    const mailto = buildEnquiryMailto({
      name: "Alex",
      email: "alex@example.com",
      organisation: "Civic Group",
      message: "Please share pricing details.",
      context: {
        association: "Big Federation",
        constituencyCount: 3,
        constituencies: ["Seat A", "Seat B", "Seat C"],
      },
      pageUrl: "https://example.test/enquire?association=Big%20Federation&count=3",
    });

    const query = mailto.split("?")[1];
    const params = new URLSearchParams(query);
    expect(params.get("subject")).toContain("Alex");
    expect(params.get("subject")).toContain("Civic Group");
    expect(params.get("body")).toContain("Message:");
    expect(params.get("body")).toContain("Please share pricing details.");
    expect(params.get("body")).toContain("Constituency count: 3");
    expect(params.get("body")).toContain("Page: https://example.test/enquire");
    expect(params.get("body")).not.toContain("Association:");
    expect(params.get("body")).not.toContain("Constituencies:");
  });

  it("posts to the enquiry API when configured and shows success", async () => {
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, requestId: "req-123" }),
    });

    render(
      <MemoryRouter initialEntries={["/enquire?association=Big%20Federation&count=3"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Organisation"), { target: { value: "Civic Group" } });
    fireEvent.change(screen.getByLabelText("Message *"), {
      target: { value: "Please share pricing details." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    await screen.findByText(/Enquiry sent/);
    expect(screen.getByText("Reference: req-123")).toBeInTheDocument();
    expect(window.location.href).toBe("https://example.test/enquire");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.test/enquiry",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })
    );

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({
      name: "Alex",
      email: "alex@example.com",
      organisation: "Civic Group",
      message: "Please share pricing details.",
    });
    expect(body.context).toMatchObject({
      association: "Big Federation",
      constituencyCount: 3,
    });
    expect(body.pageUrl).toContain("https://example.test/enquire");
    expect(body.userAgent).toBeTypeOf("string");
    expect(body.timestampIso).toBeTypeOf("string");
  });

  it("handles a trailing slash in the API base URL", async () => {
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test/");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, requestId: "req-456" }),
    });

    render(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Hello" } });

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    await screen.findByText(/Enquiry sent/);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.test/enquiry",
      expect.any(Object)
    );
  });

  it("falls back to mailto when API is not configured", async () => {
    render(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Hello" } });

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    await waitFor(() => {
      expect(window.location.href).toContain("mailto:paul@politicalsolutions.uk");
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("falls back to mailto when API fails and shows a note", async () => {
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");
    global.fetch.mockRejectedValue(new Error("Network error"));

    render(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Hello" } });

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    await waitFor(() => {
      expect(window.location.href).toContain("mailto:paul@politicalsolutions.uk");
    });
    expect(
      screen.getByText("Automatic send isn't available right now -- opening your email client instead.")
    ).toBeInTheDocument();
  });

  it("shows a friendly rate limit message on 429 and keeps mailto available", async () => {
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");
    global.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        ok: false,
        error: "too_many_requests",
        message: "Please wait a minute and try again.",
      }),
    });

    render(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Hello" } });

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    await screen.findByText("Too many requests -- please wait a minute and try again.");
    expect(
      screen.queryByText("Automatic send isn't available right now -- opening your email client instead.")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Or email us directly instead." })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:paul@politicalsolutions.uk")
    );
  });
});
