import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EnquirePage from "./EnquirePage.jsx";
import { insertEnquiry } from "../lib/enquiriesApi.js";

vi.mock("../data/associations.json", () => ({
  default: {
    byAssociation: {
      "Big Federation": ["Seat A", "Seat B", "Seat C"],
    },
  },
}));

vi.mock("../lib/enquiriesApi.js", () => ({
  insertEnquiry: vi.fn(async () => {}),
}));

describe("EnquirePage", () => {
  const renderWithHelmet = (ui) => render(<HelmetProvider>{ui}</HelmetProvider>);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
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

  it("shows the updated intro copy and what happens next card", () => {
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

  it("renders services as checkboxes including Constituency Intelligence", () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    const markedRegister = screen.getByRole("checkbox", { name: "Marked Register Processing" });
    const constituencyIntelligence = screen.getByRole("checkbox", { name: "Constituency Intelligence" });
    const electionSupport = screen.getByRole("checkbox", { name: "Campaigning, Training & Election Support" });

    fireEvent.click(markedRegister);
    fireEvent.click(constituencyIntelligence);

    expect(markedRegister).toBeChecked();
    expect(constituencyIntelligence).toBeChecked();
    expect(electionSupport).not.toBeChecked();
  });

  it("pre-checks Constituency Intelligence when ?service=constituency-intelligence", () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire?service=constituency-intelligence"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("checkbox", { name: "Constituency Intelligence" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Marked Register Processing" })).not.toBeChecked();
  });

  it("pre-checks Marked Register Processing when ?service=marked-register", () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire?service=marked-register"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("checkbox", { name: "Marked Register Processing" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Constituency Intelligence" })).not.toBeChecked();
  });

  it("pre-checks Campaigning, Training & Election Support when ?service=election-support", () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire?service=election-support"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("checkbox", { name: "Campaigning, Training & Election Support" })
    ).toBeChecked();
  });

  it("pre-fills message when ?service=platform-briefing", () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire?service=platform-briefing"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByLabelText("Message *")).toHaveValue(
      "I'd like to request a platform briefing."
    );
    expect(screen.getByRole("checkbox", { name: "Constituency Intelligence" })).not.toBeChecked();
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
    expect(insertEnquiry).not.toHaveBeenCalled();
  });

  it("submits to Supabase and shows success message", async () => {
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
      target: { value: "Campaign Manager" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Marked Register Processing" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Constituency Intelligence" }));
    fireEvent.change(screen.getByLabelText("Message *"), {
      target: { value: "Please share pricing details." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    await screen.findByText("Thank you — we'll be in touch within one working day.");

    expect(insertEnquiry).toHaveBeenCalledWith({
      name: "Alex",
      email: "alex@example.com",
      organisation: "Big Federation",
      services_interested: ["Marked Register Processing", "Constituency Intelligence"],
      role: "Campaign Manager",
      message: "Please share pricing details.",
    });
  });

  it("shows inline error message when Supabase insert fails", async () => {
    insertEnquiry.mockRejectedValueOnce(new Error("Network error"));

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

    await screen.findByText(/Something went wrong/);
    const emailLinks = screen.getAllByRole("link", { name: "paul@politicalsolutions.uk" });
    expect(emailLinks[0]).toHaveAttribute("href", "mailto:paul@politicalsolutions.uk");
  });
});
