import { Navigate, Outlet, useLocation } from "react-router-dom";
import { clearSession, getStoredTokens, isSessionValid, isTokenExpired } from "../auth/session.js";
import { setPostAuthRedirect } from "../utils/postAuthRedirect.js";

export default function ProtectedRoute({ authed, session }) {
  const location = useLocation();
  const requestedPath = `${location.pathname}${location.search}`;
  const nowMs = Date.now();
  const sessionValid = isSessionValid(window.sessionStorage, nowMs);
  const tokens = getStoredTokens();
  const hasToken = tokens?.access_token || tokens?.id_token;
  const sessionExpired =
    (session?.reason === "expired") ||
    (Boolean(hasToken) &&
      !sessionValid &&
      ((tokens?.access_token && isTokenExpired(tokens.access_token, nowMs)) ||
        (tokens?.id_token && isTokenExpired(tokens.id_token, nowMs))));

  if (!authed || !sessionValid) {
    clearSession();
    setPostAuthRedirect(requestedPath);
    const state = { from: location };
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
