import React from "react";
import { logout } from "../auth";

export default function Portal() {
  return (
    <div className="container">
      <h1>Portal</h1>
      <p className="lead">You are logged in.</p>

      <button className="btn btnPrimary" onClick={logout}>
        Log out
      </button>
    </div>
  );
}
