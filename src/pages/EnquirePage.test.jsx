import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByText("Enter your name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Select an organisation.")).toBeInTheDocument();
    expect(screen.getByText("Enter a message.")).toBeInTheDocument();
  });

  it("shows the approved enquiry introduction and brief guidance", () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/enquire"]}>
        <Routes>
          <Route path="/enquire" element={<EnquirePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.getByText(
        "Tell us about the organisation, campaign job or data requirement you want to discuss. Choose any relevant services and include the context Political Solutions should review."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your enquiry is recorded with the contact details, organisation, service interests and message you provide. Political Solutions can then use that information to follow up on the appropriate next step."
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

    expect(screen.getByLabelText("What would you like to discuss? *")).toHaveValue(
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
    fireEvent.change(screen.getByLabelText("What would you like to discuss? *"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    expect(screen.getByText("Select an organisation.")).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Your role"), {
      target: { value: "Campaign Manager" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Marked Register Processing" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Constituency Intelligence" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Clerical services for your association or federation" })
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Something else" }));
    fireEvent.change(screen.getByLabelText("What would you like to discuss? *"), {
      target: { value: "Please share pricing details." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    await screen.findByText("Thank you. Your enquiry has been submitted.");

    expect(insertEnquiry).toHaveBeenCalledWith({
      name: "Alex",
      email: "alex@example.com",
      organisation: "Big Federation",
      services_interested: [
        "Marked Register Processing",
        "Constituency Intelligence",
        "Clerical services for your association/federation",
        "Anything else not listed?",
      ],
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
    fireEvent.change(screen.getByLabelText("What would you like to discuss? *"), { target: { value: "Hello" } });

    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    await screen.findByText(/We couldn't send your enquiry/);
    const emailLinks = screen.getAllByRole("link", { name: "paul@politicalsolutions.uk" });
    expect(emailLinks[0]).toHaveAttribute("href", "mailto:paul@politicalsolutions.uk");
  });

  it("disables the submit action and shows the in-progress label while sending", async () => {
    let resolveInsert;
    insertEnquiry.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveInsert = resolve;
      })
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
    fireEvent.change(screen.getByLabelText("What would you like to discuss? *"), {
      target: { value: "Please review this requirement." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    expect(screen.getByRole("button", { name: "Sending enquiry…" })).toBeDisabled();
    await act(async () => {
      resolveInsert();
    });
    await screen.findByText("Thank you. Your enquiry has been submitted.");
  });
});
