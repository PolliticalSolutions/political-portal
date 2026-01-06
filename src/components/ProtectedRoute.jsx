import { Navigate, Outlet, useLocation } from "react-router-dom";
import { clearSession } from "../auth/session.js";

const returnKey = "cognito_post_login_redirect";

export default function ProtectedRoute({ authed, session }) {
  const location = useLocation();
  const requestedPath = `${location.pathname}${location.search}`;
  const sessionExpired = session?.reason === "expired";

  if (!authed) {
    if (sessionExpired) {
      clearSession();
    }
    sessionStorage.setItem(returnKey, requestedPath);
    const state = { from: location.pathname };
    if (sessionExpired) {
      state.reason = "expired";
    }
    return <Navigate to="/login" replace state={state} />;
  }

  return <Outlet />;
}

// Quick verification:
// - direct hit /portal in incognito redirects to /login
// - after login returns to /portal
// - direct hit /portal/subpage returns to that subpage after login
// - refresh /portal stays logged in
