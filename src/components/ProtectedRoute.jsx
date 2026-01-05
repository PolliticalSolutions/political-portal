import { Navigate, Outlet, useLocation } from "react-router-dom";

const returnKey = "cognito_post_login_redirect";

export default function ProtectedRoute({ authed }) {
  const location = useLocation();
  const requestedPath = `${location.pathname}${location.search}`;

  if (!authed) {
    sessionStorage.setItem(returnKey, requestedPath);
    return <Navigate to="/login" replace state={{ from: requestedPath }} />;
  }

  return <Outlet />;
}

// Quick verification:
// - direct hit /portal in incognito redirects to /login
// - after login returns to /portal
// - direct hit /portal/subpage returns to that subpage after login
// - refresh /portal stays logged in
