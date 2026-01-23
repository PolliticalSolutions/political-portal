import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { startLogin, startSignUp } from "../lib/cognito.js";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import { isSafeInternalPath, setPostAuthRedirect } from "../utils/postAuthRedirect.js";
import Seo from "../seo/Seo.jsx";
import { buildOrganisationSchema, buildWebsiteSchema } from "../seo/structuredData.js";

export default function Login({ authed }) {
  const [error, setError] = useState(null);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const fromState = location.state?.from;
  const redirectedFrom = typeof fromState === "string" ? fromState : fromState?.pathname;
  const reason = location.state?.reason;
  const redirectMessage =
    reason === "expired" ? "Session expired, please sign in again." : location.state?.message;

  const returnToParam = searchParams.get("returnTo") ?? "";
  const storedReturnTo =
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem("ps_post_auth_redirect_v1") : "";
  const safeStoredReturnTo = isSafeInternalPath(storedReturnTo) ? storedReturnTo : "";
  const safeReturnTo = isSafeInternalPath(returnToParam) ? returnToParam : "";
  const effectiveReturnTo = safeReturnTo || safeStoredReturnTo;

  useEffect(() => {
    if (safeReturnTo) {
      setPostAuthRedirect(safeReturnTo);
    }
  }, [safeReturnTo]);

  const returnLabel = useMemo(() => {
    if (!effectiveReturnTo) return "";
    if (effectiveReturnTo.startsWith("/portal/pricing-rules")) return "Pricing Rules";
    if (effectiveReturnTo === "/portal") return "Dashboard";
    return effectiveReturnTo.split("?")[0];
  }, [effectiveReturnTo]);

  const signupLink = useMemo(() => {
    if (!safeReturnTo) return "/signup";
    const params = new URLSearchParams({ returnTo: safeReturnTo });
    return `/signup?${params.toString()}`;
  }, [safeReturnTo]);

  const handleLogin = async () => {
    setError(null);
    const redirectPath =
      typeof fromState === "string"
        ? fromState
        : fromState?.pathname
          ? `${fromState.pathname}${fromState.search || ""}`
          : "/portal";
    try {
      setPostAuthRedirect(redirectPath);
      await startLogin(redirectPath);
    } catch (err) {
      setError(err.message || "Sign-in failed to start.");
    }
  };

  const handleSignUp = async () => {
    setError(null);
    try {
      await startSignUp("/portal");
    } catch (err) {
      setError(err.message || "Sign-up failed to start.");
    }
  };

  return (
    <div className="page stack">
      <Seo
        title="Secure portal sign-in"
        description="Secure sign-in for the Political Solutions Portal. Access operational tools, reporting, and subscriptions."
        path="/login"
        robots="index,follow"
        jsonLd={[buildOrganisationSchema(), buildWebsiteSchema()]}
      />
      <div className="centered">
        <div className="login-card">
          <Card>
            <div className="stack">
              <Badge tone="accent">Secure sign-in</Badge>
              <div>
                <h1 style={{ margin: "4px 0 8px", fontSize: 24 }}>Secure sign-in</h1>
                <p className="muted">
                  Use your account to access operational tools and reporting. Authentication is handled by AWS Cognito.
                </p>
              </div>
              {returnLabel && (
                <div className="status">
                  After sign-in you'll return to {returnLabel}.
                </div>
              )}
              <Button variant="primary" onClick={handleLogin} disabled={authed}>
                {authed ? "Already signed in" : "Continue to sign in"}
              </Button>
              <Button variant="secondary" onClick={handleSignUp}>
                Create account
              </Button>
              <Button as={Link} to={signupLink} variant="ghost">
                Create account with pricing selection
              </Button>
              <p className="helper">Hosted by AWS Cognito with PKCE for security.</p>
              {redirectedFrom && !redirectMessage && <div className="status">Please sign in to continue.</div>}
              {redirectMessage && <div className="status">{redirectMessage}</div>}
              {error && <div className="status error">{error}</div>}
            </div>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
}
