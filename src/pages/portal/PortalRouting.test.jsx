import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider } from "../../cart/cartStore.jsx";
import ProtectedRoute from "../../components/ProtectedRoute.jsx";
import { tokensKey } from "../../auth/session.js";
import Portal from "../Portal.jsx";
import Cart from "../Cart.jsx";
import PortalLayout from "./PortalLayout.jsx";
import PortalNotFound from "./PortalNotFound.jsx";
import PricingRules from "./PricingRules.jsx";
import Uploads from "./Uploads.jsx";
import * as uploadApi from "../../lib/uploadApi.js";

vi.mock("../../lib/uploadApi.js", async () => {
  const actual = await vi.importActual("../../lib/uploadApi.js");
  return {
    ...actual,
    getMe: vi.fn(),
    getAdminMe: vi.fn(),
    applyForApproval: vi.fn(),
    listOrganisations: vi.fn(),
  };
});

function makeJwt(payloadObj) {
  const header = { alg: "none", typ: "JWT" };
  const encode = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode(header)}.${encode(payloadObj)}.sig`;
}

describe("Portal routing", () => {
  const renderWithHelmet = (ui) => render(<HelmetProvider>{ui}</HelmetProvider>);

  beforeEach(() => {
    sessionStorage.clear();
    const futureExp = Math.floor(Date.now() / 1000) + 300;
    const tokens = { access_token: makeJwt({ exp: futureExp }) };
    sessionStorage.setItem(tokensKey, JSON.stringify(tokens));
    sessionStorage.setItem("cognito_tokens", JSON.stringify(tokens));
    uploadApi.getMe.mockResolvedValue({ user: { status: "APPROVED" } });
    uploadApi.getAdminMe.mockResolvedValue({ isAdmin: false });
    uploadApi.listOrganisations.mockResolvedValue({ items: [] });
  });

  it("renders pricing rules inside the portal layout", async () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/portal/pricing-rules"]}>
        <Routes>
          <Route element={<ProtectedRoute authed={true} session={{}} />}>
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<Portal tokens={null} onLogout={null} />} />
              <Route path="pricing-rules" element={<PricingRules />} />
              <Route path="uploads" element={<Uploads />} />
              <Route path="*" element={<PortalNotFound />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Pricing rules" })).toBeInTheDocument();
  });

  it("redirects the removed pricing route to subscriptions", async () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/portal/pricing"]}>
        <Routes>
          <Route element={<ProtectedRoute authed={true} session={{}} />}>
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<Portal tokens={null} onLogout={null} />} />
              <Route path="pricing" element={<Navigate to="/portal/subscriptions" replace />} />
              <Route path="subscriptions" element={<div>Subscriptions destination</div>} />
              <Route path="*" element={<PortalNotFound />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Subscriptions destination")).toBeInTheDocument();
  });

  it("renders portal not found for unknown routes", async () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/portal/does-not-exist"]}>
        <Routes>
          <Route element={<ProtectedRoute authed={true} session={{}} />}>
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<Portal tokens={null} onLogout={null} />} />
              <Route path="pricing-rules" element={<PricingRules />} />
              <Route path="uploads" element={<Uploads />} />
              <Route path="*" element={<PortalNotFound />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });

  it("renders cart inside the portal layout", async () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/portal/cart"]}>
        <CartProvider>
          <Routes>
            <Route element={<ProtectedRoute authed={true} session={{}} />}>
              <Route path="/portal" element={<PortalLayout />}>
                <Route index element={<Portal tokens={null} onLogout={null} />} />
                <Route path="cart" element={<Cart basePath="/portal" />} />
                <Route path="pricing-rules" element={<PricingRules />} />
                <Route path="uploads" element={<Uploads />} />
                <Route path="*" element={<PortalNotFound />} />
              </Route>
            </Route>
          </Routes>
        </CartProvider>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Cart" })).toBeInTheDocument();
  });

  it("blocks upload route when /me returns PENDING", async () => {
    uploadApi.getMe.mockResolvedValue({ user: { status: "PENDING" } });

    renderWithHelmet(
      <MemoryRouter initialEntries={["/portal/uploads"]}>
        <Routes>
          <Route element={<ProtectedRoute authed={true} session={{}} />}>
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<Portal tokens={null} onLogout={null} />} />
              <Route path="uploads" element={<Uploads />} />
              <Route path="*" element={<PortalNotFound />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Pending approval" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Upload files" })).not.toBeInTheDocument();
  });

  it("blocks upload route when /me fails", async () => {
    uploadApi.getMe.mockRejectedValue(new Error("Service down"));

    renderWithHelmet(
      <MemoryRouter initialEntries={["/portal/uploads"]}>
        <Routes>
          <Route element={<ProtectedRoute authed={true} session={{}} />}>
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<Portal tokens={null} onLogout={null} />} />
              <Route path="uploads" element={<Uploads />} />
              <Route path="*" element={<PortalNotFound />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Service unavailable" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Upload files" })).not.toBeInTheDocument();
  });
});
