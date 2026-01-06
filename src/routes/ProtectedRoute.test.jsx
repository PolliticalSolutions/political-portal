import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import ProtectedRoute from "../components/ProtectedRoute.jsx";

function LoginCapture() {
  const location = useLocation();
  return (
    <div>
      <div data-testid="login-screen">Login page</div>
      <div data-testid="from">{location.state?.from ?? "none"}</div>
      <div data-testid="reason">{location.state?.reason ?? "none"}</div>
    </div>
  );
}

function PortalScreen() {
  return <div>Portal area</div>;
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("redirects to /login and sets state.from when no valid token", () => {
    render(
      <MemoryRouter initialEntries={["/portal/reports"]}>
        <Routes>
          <Route element={<ProtectedRoute authed={false} session={{}} />}>
            <Route path="/portal/reports" element={<PortalScreen />} />
          </Route>
          <Route path="/login" element={<LoginCapture />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("login-screen")).toBeInTheDocument();
    expect(screen.getByTestId("from")).toHaveTextContent("/portal/reports");
    expect(screen.getByTestId("reason")).toHaveTextContent("none");
  });

  it("redirects to /login with reason expired when token is expired", () => {
    render(
      <MemoryRouter initialEntries={["/portal/data?view=detail"]}>
        <Routes>
          <Route element={<ProtectedRoute authed={false} session={{ reason: "expired" }} />}>
            <Route path="/portal/data" element={<PortalScreen />} />
          </Route>
          <Route path="/login" element={<LoginCapture />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("login-screen")).toBeInTheDocument();
    expect(screen.getByTestId("from")).toHaveTextContent("/portal/data");
    expect(screen.getByTestId("reason")).toHaveTextContent("expired");
  });
});
