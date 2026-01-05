import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { clearStoredSession, exchangeCodeForTokens } from "../lib/cognito.js";
import Badge from "../components/Badge.jsx";
import Card from "../components/Card.jsx";

export default function Callback({ onAuth }) {
  const location = useLocation();
  const fullPath = `${location.pathname}${location.search}`;
  const [status, setStatus] = useState("idle");
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

    if (!code) {
      setStatus("no-code");
      setError("No authorization code found in callback.");
      return;
    }

    let cancelled = false;
    setStatus("exchanging");
    exchangeCodeForTokens(code)
      .then((tokens) => {
        if (cancelled) return;
        onAuth?.(tokens);
        setStatus("success");
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
  }, [location.search, onAuth]);

  return (
    <div className="page stack">
      <Card>
        <div className="stack">
          <div className="card-header">
            <div>
              <Badge tone="accent">Secure handoff</Badge>
              <h1 style={{ margin: "6px 0 4px", fontSize: 22 }}>Completing sign-in</h1>
              <p className="muted">Signing you in and checking your session.</p>
            </div>
            {status === "exchanging" && <div className="spinner" aria-label="Loading" />}
          </div>

          <div className={`status ${status === "error" ? "error" : ""}`}>
            <span>Status: {status}</span>
            <span style={{ opacity: 0.7 }}>Path: {fullPath}</span>
          </div>

          {error && <div className="status error">{error}</div>}
          {status === "success" && <p className="helper">Tokens stored in sessionStorage.</p>}
        </div>
      </Card>
    </div>
  );
}
