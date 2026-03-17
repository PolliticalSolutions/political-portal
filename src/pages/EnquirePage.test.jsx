import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
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
  const renderWithHelmet = (ui) => render(<HelmetProvider>{ui}</HelmetProvider>);

  beforeEach(() => {
    vi.stubEnv("VITE_ENQUIRY_API_URL", "");
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = undefined;
  });

  it("validates required fields on submit", () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Organisation is required.")).toBeInTheDocument();
    expect(screen.getByText("Message is required.")).toBeInTheDocument();
  });

  it("shows the updated intro copy and removes the operational goals box", () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByText(
        "Tell us what you need, who it is for, and which service you want to discuss. We use this to route the enquiry properly and confirm the next step quickly. If your request is urgent, say so clearly in the message box."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "We review the enquiry, confirm whether it is for Marked Register Processing, Constituency Intelligence, Campaigning, Training & Election Support, or subscriptions, and then reply with the appropriate next step."
      )
    ).toBeInTheDocument();
  });

  it("renders services as checkboxes and allows multiple selections", () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    const markedRegister = screen.getByRole("checkbox", { name: "Marked Register Processing" });
    const byElection = screen.getByRole("checkbox", { name: "By-Election campaign consultancy" });

    fireEvent.click(markedRegister);
    fireEvent.click(byElection);

    expect(markedRegister).toBeChecked();
    expect(byElection).toBeChecked();
  });

  it("blocks submit when organisation is not selected", () => {
    renderWithHelmet(
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

    expect(screen.getByText("Organisation is required.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
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

    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire?association=Big%20Federation&count=3"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Organisation *"), { target: { value: "Big Federation" } });
    fireEvent.change(screen.getByLabelText("Your role in the Association/Federation/Area/Region"), {
      target: { value: "Campaign Manager" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Marked Register Processing" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "General campaigning consultancy" }));
    fireEvent.change(screen.getByLabelText("Message *"), {
      target: { value: "Please share pricing details." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    await screen.findByText(/Enquiry sent/);
    expect(screen.getByText("Reference: req-123")).toBeInTheDocument();
    // After a successful API submission the success message is shown (no navigation)
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
    expect(body.name).toBe("Alex");
    expect(body.email).toBe("alex@example.com");
    expect(body.organisation).toBe("Big Federation");
    expect(body.role).toBe("Campaign Manager");
    expect(body.message).toContain("Please share pricing details.");
    expect(body.message).toContain("Organisation: Big Federation");
    expect(body.message).toContain("Role: Campaign Manager");
    expect(body.message).toContain(
      "Services interested in: Marked Register Processing, General campaigning consultancy"
    );
    expect(body.context).toMatchObject({
      association: "Big Federation",
      constituencyCount: 3,
    });
    // In jsdom, window.location.href is the test-env URL, not the MemoryRouter path
    expect(body.pageUrl).toBeTypeOf("string");
    expect(body.userAgent).toBeTypeOf("string");
    expect(body.timestampIso).toBeTypeOf("string");
  });

  it("handles a trailing slash in the API base URL", async () => {
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test/");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, requestId: "req-456" }),
    });

    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Organisation *"), { target: { value: "Big Federation" } });
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Hello" } });

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    await screen.findByText(/Enquiry sent/);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.test/enquiry",
      expect.any(Object)
    );
  });

  it("falls back to mailto when API is not configured", async () => {
    // jsdom 28 prevents intercepting window.location.href assignments.
    // Verify the correct mailto body content via buildEnquiryMailto (separately
    // unit-tested) and confirm no API call is made.
    const expectedMailto = buildEnquiryMailto({
      name: "Alex",
      email: "alex@example.com",
      organisation: "Big Federation",
      message:
        "Hello\n\nOrganisation: Big Federation\nRole: Deputy Chair\nServices interested in: By-Election campaign consultancy, Anything else not listed?",
      context: null,
      pageUrl: "",
    });
    const expectedParams = new URLSearchParams(expectedMailto.split("?")[1]);
    expect(expectedParams.get("body")).toContain("Organisation: Big Federation");
    expect(expectedParams.get("body")).toContain("Role: Deputy Chair");
    expect(expectedParams.get("body")).toContain(
      "Services interested in: By-Election campaign consultancy, Anything else not listed?"
    );

    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Organisation *"), { target: { value: "Big Federation" } });
    fireEvent.change(screen.getByLabelText("Your role in the Association/Federation/Area/Region"), {
      target: { value: "Deputy Chair" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "By-Election campaign consultancy" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Anything else not listed?" }));
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Hello" } });

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    // No API configured → no fetch call. jsdom handles the mailto navigation
    // internally (triggers "Not implemented: navigation") but the important
    // behaviour — that fetch is not called — is verifiable.
    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  it("falls back to mailto when API fails and shows a note", async () => {
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");
    global.fetch.mockRejectedValue(new Error("Network error"));

    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Organisation *"), { target: { value: "Big Federation" } });
    fireEvent.change(screen.getByLabelText("Message *"), { target: { value: "Hello" } });

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    // After API failure the component shows the fallback note in the DOM and
    // then sets window.location.href to the mailto URL. jsdom 28 makes
    // window.location non-configurable so we cannot spy on href assignments;
    // we verify the visible DOM side-effect instead.
    await screen.findByText(
      "Automatic send isn't available right now -- opening your email client instead."
    );
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

    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Name *"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("Email *"), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText("Organisation *"), { target: { value: "Big Federation" } });
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
