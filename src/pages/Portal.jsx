export default function Portal({ tokens }) {
  const hasTokens = Boolean(tokens);

  return (
    <div className="stack">
      <h1>Portal</h1>
      <div className="card">
        <p>Protected area. Replace this with the real portal once auth is fully wired.</p>
        <p>Access token present: {hasTokens ? "yes" : "no"}</p>
        {tokens?.id_token && (
          <details>
            <summary>View token payload (truncated)</summary>
            <code style={{ wordBreak: "break-all", display: "block", marginTop: 8 }}>
              {tokens.id_token.slice(0, 80)}...
            </code>
          </details>
        )}
      </div>
    </div>
  );
}
