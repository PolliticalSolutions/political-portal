import { useState } from "react";
import { startLogin } from "../lib/cognito.js";

export default function Login({ authed }) {
  const [error, setError] = useState(null);

  const handleLogin = async () => {
    setError(null);
    try {
      await startLogin();
    } catch (err) {
      setError(err.message || "Login failed to start.");
    }
  };

  return (
    <div className="stack">
      <h1>Login</h1>
      <div className="card">
        <p>Kick off the Cognito Hosted UI flow with PKCE.</p>
        <button type="button" className="navLink" onClick={handleLogin} disabled={authed}>
          {authed ? "Already signed in" : "Sign in with Cognito"}
        </button>
        {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      </div>
    </div>
  );
}
