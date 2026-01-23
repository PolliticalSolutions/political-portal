import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as quoteApi from "../../lib/quoteApi.js";
import Integrations from "./Integrations.jsx";

vi.mock("../../lib/quoteApi.js", () => ({
  getXeroStatus: vi.fn(),
  startXeroConnect: vi.fn(),
}));

describe("Integrations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows disconnected state", async () => {
    quoteApi.getXeroStatus.mockResolvedValue({ ok: true, connected: false });

    render(
      <MemoryRouter>
        <Integrations />
      </MemoryRouter>
    );

    expect(await screen.findByText("Not connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Xero" })).toBeInTheDocument();
  });

  it("shows connected state", async () => {
    quoteApi.getXeroStatus.mockResolvedValue({
      ok: true,
      connected: true,
      tenantName: "Alpha Org",
    });

    render(
      <MemoryRouter>
        <Integrations />
      </MemoryRouter>
    );

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Tenant: Alpha Org")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect Xero" })).toBeInTheDocument();
  });
});
