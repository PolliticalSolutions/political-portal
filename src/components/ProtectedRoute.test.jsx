import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import Login from "../pages/Login.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";
import { tokensKey } from "../auth/session.js";

function makeJwt(payloadObj) {
  const header = { alg: "none", typ: "JWT" };
  const encode = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode(header)}.${encode(payloadObj)}.sig`;
}

function PortalScreen() {
  return <div>Portal area</div>;
}

describe("ProtectedRoute", () => {
  const renderWithHelmet = (ui) => render(<HelmetProvider>{ui}</HelmetProvider>);

  beforeEach(() => {
    sessionStorage.clear();
  });

  it("redirects to /login when no token is present", () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/portal"]}>
        <Routes>
          <Route element={<ProtectedRoute authed={false} session={{}} />}>
            <Route path="/portal" element={<PortalScreen />} />
          </Route>
          <Route path="/login" element={<Login authed={false} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Please sign in to continue.")).toBeInTheDocument();
  });

  it("redirects to /login with expired reason when token is expired", () => {
    const expiredExp = Math.floor(Date.now() / 1000) - 10;
    const tokens = { access_token: makeJwt({ exp: expiredExp }) };
    sessionStorage.setItem(tokensKey, JSON.stringify(tokens));

    renderWithHelmet(
      <MemoryRouter initialEntries={["/portal"]}>
        <Routes>
          <Route element={<ProtectedRoute authed={false} session={{}} />}>
            <Route path="/portal" element={<PortalScreen />} />
          </Route>
          <Route path="/login" element={<Login authed={false} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Session expired, please sign in again.")).toBeInTheDocument();
    expect(sessionStorage.getItem("ps_post_auth_redirect_v1")).toBe("/portal");
  });

  it("stores the intended path before redirecting to /login", () => {
    renderWithHelmet(
      <MemoryRouter initialEntries={["/portal/thing?x=1"]}>
        <Routes>
          <Route element={<ProtectedRoute authed={false} session={{}} />}>
            <Route path="/portal/thing" element={<PortalScreen />} />
          </Route>
          <Route path="/login" element={<Login authed={false} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(sessionStorage.getItem("ps_post_auth_redirect_v1")).toBe("/portal/thing?x=1");
  });

  it("renders outlet content when token is valid", () => {
    const futureExp = Math.floor(Date.now() / 1000) + 300;
    const tokens = { access_token: makeJwt({ exp: futureExp }) };
    sessionStorage.setItem(tokensKey, JSON.stringify(tokens));

    renderWithHelmet(
      <MemoryRouter initialEntries={["/portal"]}>
        <Routes>
          <Route element={<ProtectedRoute authed={true} session={{}} />}>
            <Route path="/portal" element={<PortalScreen />} />
          </Route>
          <Route path="/login" element={<Login authed={false} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Portal area")).toBeInTheDocument();
  });
});
