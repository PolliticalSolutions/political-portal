import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";
import { getAlertSubscriptions, addAlertSubscription, removeAlertSubscription } from "../constituency/constituencyApi.js";

const ALERT_TYPE_OPTIONS = [
  { key: "by_election_risk",    label: "By-election risk changes" },
  { key: "council_instability", label: "Council instability updates" },
  { key: "mp_defection",        label: "MP defections / party changes" },
  { key: "swing_threshold",     label: "Swing threshold breaches" },
];

function SubscriptionRow({ sub, constituencyMap, onRemove }) {
  const [removing, setRemoving] = useState(false);
  const target = sub.constituency_id
    ? (constituencyMap[sub.constituency_id]?.name || "Unknown constituency")
    : sub.local_authority_id
      ? "Local authority"
      : "All alerts";

  const types = Object.entries(sub.alert_types || {})
    .filter(([, v]) => v)
    .map(([k]) => ALERT_TYPE_OPTIONS.find((o) => o.key === k)?.label || k);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await onRemove(sub.id);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="portal-record" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 14 }}>{target}</p>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
            {types.length > 0 ? types.join(", ") : "All alert types"}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9ca3af" }}>
            Since {new Date(sub.created_at).toLocaleDateString("en-GB")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={handleRemove}
          loading={removing}
          disabled={removing}
          style={{ fontSize: 12, padding: "4px 10px" }}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

function AddSubscriptionForm({ onAdd }) {
  const [email, setEmail] = useState("");
  const [alertTypes, setAlertTypes] = useState(
    Object.fromEntries(ALERT_TYPE_OPTIONS.map((o) => [o.key, true]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleToggle = (key) => {
    setAlertTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email address is required.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await addAlertSubscription({ email: email.trim(), alertTypes });
      setSuccess("Subscription added. You will receive alerts at this address when configured.");
      setEmail("");
      onAdd();
    } catch (err) {
      setError(err.message || "Failed to add subscription.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <label className="field">
        <span style={{ fontWeight: 600 }}>Email address</span>
        <input
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </label>
      <div>
        <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 13 }}>Alert types</p>
        {ALERT_TYPE_OPTIONS.map((opt) => (
          <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={alertTypes[opt.key]}
              onChange={() => handleToggle(opt.key)}
            />
            <span style={{ fontSize: 13 }}>{opt.label}</span>
          </label>
        ))}
      </div>
      <Button type="submit" loading={saving} disabled={saving}>
        {saving ? "Saving…" : "Subscribe to alerts"}
      </Button>
      {error && <p style={{ color: "#b91c1c", margin: 0, fontSize: 13 }} role="alert">{error}</p>}
      {success && <p style={{ color: "#15803d", margin: 0, fontSize: 13 }} role="status">{success}</p>}
    </form>
  );
}

export default function AlertsPage() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [lookupEmail, setLookupEmail] = useState("");
  const [error, setError] = useState("");

  const loadSubscriptions = async (addr) => {
    if (!addr) return;
    setLoading(true);
    try {
      const subs = await getAlertSubscriptions(addr);
      setSubscriptions(subs);
    } catch (err) {
      setError(err.message || "Failed to load subscriptions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(false);
  }, []);

  const handleRemove = async (id) => {
    try {
      await removeAlertSubscription(id);
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err.message || "Failed to remove subscription.");
    }
  };

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Analytics Engine</span>
            <h1 className="portal-page-header__title">My Alert Subscriptions</h1>
            <p className="portal-page-header__subtitle">
              Subscribe to political intelligence alerts for constituencies and local authorities.
              Receive notifications when by-election risk changes, councils become unstable, or
              MPs switch parties.
            </p>
          </div>
          <div className="portal-page-header__actions">
            <Link to="/portal/constituency" className="button ghost">Constituencies</Link>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <Card title="Subscribe to alerts">
          <AddSubscriptionForm onAdd={() => lookupEmail && loadSubscriptions(lookupEmail)} />
        </Card>

        <Card title="View my subscriptions">
          <div className="stack">
            <label className="field">
              <span style={{ fontWeight: 600, fontSize: 13 }}>Look up by email</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="email"
                  className="input"
                  value={lookupEmail}
                  onChange={(e) => setLookupEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <Button
                  type="button"
                  onClick={() => { setEmail(lookupEmail); loadSubscriptions(lookupEmail); }}
                  disabled={!lookupEmail.trim() || loading}
                >
                  Load
                </Button>
              </div>
            </label>

            {error && <p style={{ color: "#b91c1c", margin: 0, fontSize: 13 }} role="alert">{error}</p>}

            {subscriptions.length === 0 && !loading && email && (
              <p className="portal-placeholder-panel__body">No active subscriptions found for this email.</p>
            )}

            {subscriptions.map((sub) => (
              <SubscriptionRow
                key={sub.id}
                sub={sub}
                constituencyMap={{}}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </Card>
      </div>

      <Card title="About alert delivery">
        <div className="portal-data-note">
          <strong>Email delivery requires backend configuration.</strong> The subscription data is stored in Supabase.
          To send actual emails, connect a serverless function or third-party service (Resend, SendGrid, AWS SES)
          that queries <code>alert_subscriptions</code> and dispatches on trigger events.
          The <code>alert_subscriptions</code> DDL is:{" "}
          <code>
            CREATE TABLE alert_subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_email varchar(255), constituency_id uuid REFERENCES constituencies(id),
            local_authority_id uuid, alert_types jsonb, is_active boolean DEFAULT true,
            created_at timestamptz DEFAULT now());
          </code>
        </div>
      </Card>
    </div>
  );
}
