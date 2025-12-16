import React from "react";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div style={{ fontFamily: "system-ui", padding: "48px", maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Political Solutions Ltd</strong>
        <Link to="/login">Login</Link>
      </div>

      <h1 style={{ marginTop: 48 }}>
        Practical, apolitical tools for local political organisations.
      </h1>

      <p style={{ fontSize: 18, lineHeight: 1.6 }}>
        We help local associations and federations automate admin,
        manage data securely, and focus on campaigning — not paperwork.
      </p>

      <Link
        to="/login"
        style={{
          display: "inline-block",
          marginTop: 24,
          padding: "10px 14px",
          background: "#111827",
          color: "white",
          borderRadius: 8,
          textDecoration: "none"
        }}
      >
        Access the portal
      </Link>
    </div>
  );
}
