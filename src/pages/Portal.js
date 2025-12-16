import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Portal() {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem("ps_logged_in");
    navigate("/");
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: "48px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <h1 style={{ margin: 0 }}>Portal</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link to="/">Home</Link>
          <button
            onClick={logout}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: "white",
              cursor: "pointer"
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div style={{ marginTop: 24, padding: 24, border: "1px solid #e5e7eb", borderRadius: 16 }}>
        <h2 style={{ marginTop: 0 }}>Next features we’ll build</h2>
        <ul style={{ lineHeight: 1.9 }}>
          <li>Federation setup (constituencies + pricing rules)</li>
          <li>User management + roles</li>
          <li>Marked register uploads + processing workflow</li>
          <li>Xero invoicing automation</li>
        </ul>
      </div>
    </div>
  );
}
