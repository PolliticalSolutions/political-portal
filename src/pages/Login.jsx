import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { startLogin } from "../lib/cognito.js";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import { isSafeInternalPath, setPostAuthRedirect } from "../utils/postAuthRedirect.js";

export default function Login({ authed }) {
  const [error, setError] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
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
  const showWelcome = searchParams.get("welcome") === "true";

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

  const handleSignUp = () => {
    setError(null);
    navigate("/signup");
  };

  return (
    <div className="page">
      <section className="section">
        <div className="container centered">
          <div className="login-card">
            <Card>
              <div className="stack">
                <div>
                  <h1 style={{ margin: "4px 0 8px", fontSize: 24 }}>Sign in</h1>
                  <p className="muted">Use your account to access operational tools and reporting.</p>
                </div>
                {returnLabel && (
                  <div className="status">
                    After sign-in you'll be directed to the {returnLabel.toLowerCase()}
                  </div>
                )}
                {showWelcome && (
                  <div className="status success">
                    Your account has been created. Check your email for the temporary password.
                  </div>
                )}
                <Button variant="primary" onClick={handleLogin} disabled={authed}>
                  {authed ? "Already signed in" : "Continue to sign in"}
                </Button>
                <Button variant="secondary" onClick={handleSignUp}>
                  Create account
                </Button>
                {redirectedFrom && !redirectMessage && <div className="status">Please sign in to continue.</div>}
                {redirectMessage && <div className="status">{redirectMessage}</div>}
                {error && <div className="status error">{error}</div>}
              </div>
            </Card>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
