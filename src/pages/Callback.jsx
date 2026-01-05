import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { clearStoredSession, exchangeCodeForTokens } from "../lib/cognito.js";

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
    <div className="stack">
      <h1>Callback</h1>
      <div className="card">
        <p>
          Current path + query: <strong>{fullPath}</strong>
        </p>
        <p>Status: {status}</p>
        {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
        {status === "success" && <p>Tokens stored in sessionStorage.</p>}
      </div>
    </div>
  );
}
