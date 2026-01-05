import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearStoredSession, exchangeCodeForTokens, consumePostLoginRedirect, getStoredTokens } from "../lib/cognito.js";
import Badge from "../components/Badge.jsx";
import Card from "../components/Card.jsx";

export default function Callback({ onAuth }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState("exchanging");
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const errorParam = params.get("error");

    if (errorParam) {
      setStatus("error");
      setError(`${errorParam}: ${params.get("error_description") || "Login error"}`);
      return;
    }

    // If we already have tokens or no code, bounce straight to portal.
    if (getStoredTokens() || !code) {
      navigate(consumePostLoginRedirect("/portal"), { replace: true });
      return;
    }

    let cancelled = false;
    exchangeCodeForTokens(code)
      .then((tokens) => {
        if (cancelled) return;
        onAuth?.(tokens);
        navigate(consumePostLoginRedirect("/portal"), { replace: true });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Token exchange failed.");
        setStatus("error");
        clearStoredSession();
      });

    return () => {
      cancelled = true;
    };
  }, [location.search, navigate, onAuth]);

  // Silent redirect unless there's an error.
  if (!error) {
    return (
      <div className="page centered">
        <Card>
          <div className="stack">
            <Badge tone="accent">Secure handoff</Badge>
            <p className="muted">Signing you in…</p>
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
          <div className="status error">{error}</div>
          <p className="helper">Please restart login.</p>
        </div>
      </Card>
    </div>
  );
}
