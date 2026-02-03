import React from "react";

const formatMissingKeys = (missingKeys) => {
  if (!missingKeys || missingKeys.length === 0) return "Required configuration is missing.";
  return `Missing environment variables: ${missingKeys.join(", ")}`;
};

export default function ConfigErrorScreen({ missingKeys }) {
  return (
    <div className="page">
      <section className="section">
        <div className="container">
          <h1>Configuration error</h1>
          <p className="muted">{formatMissingKeys(missingKeys)}</p>
          <p className="muted">Please contact support to resolve this configuration issue.</p>
        </div>
      </section>
    </div>
  );
}
