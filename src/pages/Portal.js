import React from "react";
import { logout } from "../auth";

export default function Portal() {
  return (
    <div className="container">
      <h1>Portal</h1>
      <p className="lead">You’re logged in ✅</p>

      <button className="btn btnPrimary" onClick={logout}>
        Logout
      </button>
    </div>
  );
}
