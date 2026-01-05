import React from "react";
import { startLogin } from "../auth";

export default function Login() {
  return (
    <div className="container" style={{ padding: 24 }}>
      <h1>Login</h1>
      <p className="lead">Use your Cognito account to sign in.</p>

      <button className="btn" onClick={startLogin}>
        Continue to secure login
      </button>
    </div>
  );
}
