import Badge from "../components/Badge.jsx";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import { cognitoConfig } from "../cognitoConfig.js";

function formatExpiry(timestamp) {
  if (!timestamp) return "Unknown";
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "Unknown";
  }
}

export default function Session({ session, onClear }) {
  const authed = !!session?.isAuthed;
  const expired = session?.reason === "expired";
  const tokens = session?.tokens;
  const claims = session?.user || null;
  const hasClaims = Boolean(claims);

  return (
    <div className="page stack">
      <Card
        title="Session details"
        action={
          authed ? <Badge tone="accent">Authenticated</Badge> : <Badge>Not authenticated</Badge>
        }
      >
        <p className="muted" style={{ marginTop: 4 }}>
          View the active Cognito session, token claims, and configured endpoints.
        </p>
        <div className="card-grid" style={{ marginTop: 12 }}>
          <Card title="Auth state">
            <p>Authenticated: {authed ? "Yes" : "No"}</p>
            <p>Expired: {expired ? "Yes" : "No"}</p>
            <p>Tokens stored: {tokens ? "Yes" : "No"}</p>
            <p>Expires at: {formatExpiry(session?.expiresAt)}</p>
          </Card>
          <Card title="User claims">
            {hasClaims ? (
              <>
                <p>sub: {claims.sub || "Unknown"}</p>
                <p>email: {claims.email || "Unknown"}</p>
              </>
            ) : (
              <p>Signed in with access token only.</p>
            )}
          </Card>
          <Card title="Cognito config">
            <p>Domain: {cognitoConfig.domain || "Unknown"}</p>
            <p>Client ID: {cognitoConfig.clientId || "Unknown"}</p>
            <p>Redirect URI: {cognitoConfig.redirectUri || "Unknown"}</p>
            <p>
              Log-out URI: {cognitoConfig.logoutUri || cognitoConfig.redirectUri || "Unknown"}
            </p>
          </Card>
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          <Button variant="secondary" onClick={onClear}>
            Clear session
          </Button>
        </div>
      </Card>
    </div>
  );
}
