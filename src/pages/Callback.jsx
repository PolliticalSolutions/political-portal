import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getSession } from "../auth/session.js";
import { clearStoredSession, exchangeCodeForTokens, startLogin } from "../lib/cognito.js";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import { consumePostAuthRedirect, isSafeInternalPath, setPostAuthRedirect } from "../utils/postAuthRedirect.js";

export default function Callback({ onAuth }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState("exchanging");
  const [error, setError] = useState(null);
  const [restartError, setRestartError] = useState(null);
  const returnLabel = useMemo(() => {
    const stored =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("ps_post_auth_redirect_v1")
        : "";
    if (!isSafeInternalPath(stored)) return "";
    if (stored.startsWith("/portal/pricing-rules")) return "Pricing Rules";
    if (stored === "/portal") return "Dashboard";
    return stored.split("?")[0];
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const state = params.get("state");
    const errorParam = params.get("error");

    if (errorParam) {
      setStatus("error");
      setError(`${errorParam}: ${params.get("error_description") || "Sign-in error"}`);
      return;
    }

    const existingSession = getSession();
    // If we already have a valid session or no code, bounce straight to portal.
    if (existingSession.isAuthed || !code) {
      navigate(consumePostAuthRedirect("/portal"), { replace: true });
      return;
    }

    if (existingSession.reason === "expired") {
      clearStoredSession({ preserveRedirect: true });
    }

    let cancelled = false;
    exchangeCodeForTokens(code, state)
      .then((tokens) => {
        if (cancelled) return;
        onAuth?.(tokens);
        navigate(consumePostAuthRedirect("/portal"), { replace: true });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Token exchange failed.");
        setStatus(err?.code === "PKCE_HANDOFF_MISSING" ? "handoff-missing" : "error");
        clearStoredSession();
      });

    return () => {
      cancelled = true;
    };
  }, [location.search, navigate, onAuth]);

  const handleRestartSignIn = async () => {
    setRestartError(null);
    const stored =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("ps_post_auth_redirect_v1")
        : "";
    const restartPath = isSafeInternalPath(stored) ? stored : "/portal";
    setPostAuthRedirect(restartPath);
    try {
      await startLogin(restartPath);
    } catch (err) {
      setRestartError(err?.message || "Sign-in failed to start.");
    }
  };

  // Silent redirect unless there's an error.
  if (!error) {
    return (
      <div className="page centered">
        <Card>
          <div className="stack">
            <Badge tone="accent">Secure handoff</Badge>
            <p className="muted">Signing you in...</p>
            {returnLabel && <p className="helper">Returning you to {returnLabel}.</p>}
            <div className="spinner" aria-label="Loading" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page centered">
      <Card>
        <div className="stack">
          <Badge tone="accent">Secure handoff</Badge>
          {status === "handoff-missing" ? (
            <>
              <div className="status error">
                We couldn&apos;t complete sign-in because the secure handoff data was missing. Please restart
                sign-in.
              </div>
              <Button variant="primary" onClick={handleRestartSignIn}>
                Restart sign-in
              </Button>
              <p className="helper">
                If you just created an account, your registration may have succeeded. Sign in again to continue.
              </p>
              {restartError && <div className="status error">{restartError}</div>}
            </>
          ) : (
            <>
              <div className="status error">{error}</div>
              <p className="helper">Please restart sign-in.</p>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
