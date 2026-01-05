import { useState } from "react";
import { useLocation } from "react-router-dom";
import { startLogin } from "../lib/cognito.js";
import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";

export default function Login({ authed }) {
  const [error, setError] = useState(null);
  const location = useLocation();
  const redirectedFrom = location.state?.from;

  const handleLogin = async () => {
    setError(null);
    const redirectPath = location.state?.from || "/portal";
    try {
      await startLogin(redirectPath);
    } catch (err) {
      setError(err.message || "Login failed to start.");
    }
  };

  return (
    <div className="page centered">
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
            <Button variant="primary" onClick={handleLogin} disabled={authed}>
              {authed ? "Already signed in" : "Continue to sign in"}
            </Button>
            <p className="helper">Hosted by AWS Cognito with PKCE for security.</p>
            {redirectedFrom && <div className="status">Please sign in to continue.</div>}
            {error && <div className="status error">{error}</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
