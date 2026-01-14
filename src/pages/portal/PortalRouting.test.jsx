import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import ProtectedRoute from "../../components/ProtectedRoute.jsx";
import { tokensKey } from "../../auth/session.js";
import Portal from "../Portal.jsx";
import PortalLayout from "./PortalLayout.jsx";
import PortalNotFound from "./PortalNotFound.jsx";
import PricingRules from "./PricingRules.jsx";

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
  beforeEach(() => {
    sessionStorage.clear();
    const futureExp = Math.floor(Date.now() / 1000) + 300;
    const tokens = { access_token: makeJwt({ exp: futureExp }) };
    sessionStorage.setItem(tokensKey, JSON.stringify(tokens));
  });

  it("renders pricing rules inside the portal layout", () => {
    render(
      <MemoryRouter initialEntries={["/portal/pricing-rules"]}>
        <Routes>
          <Route element={<ProtectedRoute authed={true} session={{}} />}>
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<Portal tokens={null} onLogout={null} />} />
              <Route path="pricing-rules" element={<PricingRules />} />
              <Route path="*" element={<PortalNotFound />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Portal")).toBeInTheDocument();
    expect(screen.getByText("Pricing Rules")).toBeInTheDocument();
  });

  it("renders portal not found for unknown routes", () => {
    render(
      <MemoryRouter initialEntries={["/portal/does-not-exist"]}>
        <Routes>
          <Route element={<ProtectedRoute authed={true} session={{}} />}>
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<Portal tokens={null} onLogout={null} />} />
              <Route path="pricing-rules" element={<PricingRules />} />
              <Route path="*" element={<PortalNotFound />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Portal")).toBeInTheDocument();
    expect(screen.getByText("Page not found")).toBeInTheDocument();
  });
});
