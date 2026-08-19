import React from "react";

const nodeEnv =
  typeof process !== "undefined" && typeof process.env?.NODE_ENV === "string"
    ? process.env.NODE_ENV
    : "";
const isDevBuild =
  nodeEnv
    ? nodeEnv !== "production"
    : Boolean(import.meta.env.DEV);

const formatMissingKeys = (missingKeys, devMode) => {
  if (!devMode) {
    return "The application is temporarily unavailable due to a configuration issue.";
  }
  if (!missingKeys || missingKeys.length === 0) return "Required configuration is missing.";
  return `Missing environment variables: ${missingKeys.join(", ")}`;
};

export default function ConfigErrorScreen({ missingKeys }) {
  return (
    <div className="page">
      <section className="section">
        <div className="container">
          <h1>Configuration error</h1>
          <p className="muted">{formatMissingKeys(missingKeys, isDevBuild)}</p>
          <p className="muted">Please contact support to resolve this configuration issue.</p>
        </div>
      </section>
    </div>
  );
}
