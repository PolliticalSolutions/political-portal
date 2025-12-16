import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  function tempLogin() {
    // TEMP: just for today so we can build the portal fast.
    // We'll replace with AWS Cognito.
    localStorage.setItem("ps_logged_in", "true");
    navigate("/portal");
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: "48px", maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Login</h1>
      <p style={{ color: "#6b7280", lineHeight: 1.6 }}>
        This is a temporary login so we can build the portal structure quickly.
        We’ll replace this with a real AWS login next.
      </p>

      <button
        onClick={tempLogin}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          background: "#111827",
          color: "white",
          border: "none",
          cursor: "pointer"
        }}
      >
        Continue (temporary login)
      </button>

      <div style={{ marginTop: 18 }}>
        <Link to="/">← Back to home</Link>
      </div>
    </div>
  );
}
