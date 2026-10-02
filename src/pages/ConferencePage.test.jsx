import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ConferencePage, { ConferenceForm, ConferenceFormBoundary } from "./ConferencePage.jsx";
import { getSeoForPath } from "../seo/seoRoutes.js";
import { getPrerenderRoutes } from "../../scripts/prerender-routes.mjs";
import { buildSitemapXml } from "../../scripts/generate-sitemap.mjs";

const mount = (node) => render(<MemoryRouter>{node}</MemoryRouter>);
function fill() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test Delegate" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "test@example.com" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /I consent/ }));
}

describe("conference page", () => {
  it("keeps the page readable and evergreen without a kicker", () => {
    mount(<ConferencePage kicker="" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Paul Startin");
    expect(screen.queryByText(/Conservative Party Conference, Birmingham/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "07525 167 856" })).toHaveAttribute("href", "tel:+447525167856");
    expect(screen.getByLabelText("Name")).toHaveAttribute("autocomplete", "name");
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).not.toBeChecked(); expect(checkboxes[1]).not.toBeRequired();
  });
  it("announces a failed save and preserves everything typed, including consent", async () => {
    const session = { submit: vi.fn().mockRejectedValue(new Error("Database unavailable. Please try again.")) };
    mount(<ConferenceForm session={session} />); fill();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Database unavailable. Please try again.");
    expect(screen.getByLabelText("Name")).toHaveValue("Test Delegate");
    expect(screen.getByLabelText("Email")).toHaveValue("test@example.com");
    expect(screen.getByRole("checkbox", { name: /I consent/ })).toBeChecked();
    expect(screen.getByRole("link", { name: "07525 167 856" })).toBeInTheDocument();
    expect(screen.queryByText("Thanks. I will come back to you.")).not.toBeInTheDocument();
  });
  it("blocks double submission and replaces the form in place with focused success", async () => {
    let resolve;
    const session = { submit: vi.fn(() => new Promise((done) => { resolve = done; })) };
    mount(<ConferenceForm session={session} />); fill();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form"));
    expect(session.submit).toHaveBeenCalledTimes(1);
    resolve({ ok: true });
    await screen.findByText("Thanks. I will come back to you.");
    await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });
  it("keeps contact details available if the form crashes", () => {
    function Broken() { throw new Error("Test crash"); }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mount(<><h1>Paul Startin</h1><ConferenceFormBoundary><Broken /></ConferenceFormBoundary></>);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("contact Paul directly");
    expect(screen.getByRole("link", { name: "07525 167 856" })).toBeInTheDocument();
    spy.mockRestore();
  });
  it("prerenders unindexed metadata without putting the page in the sitemap", () => {
    const seo = getSeoForPath("/conference/");
    expect(seo).toMatchObject({ title: "Paul Startin, Political Solutions", exactTitle: true, noindex: true, image: "/og-image.png" });
    expect(getPrerenderRoutes()).toContain("/conference");
    expect(buildSitemapXml()).not.toContain("/conference");
  });
});
