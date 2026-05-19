import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import Card from "../../../components/Card.jsx";
import { getAdminMe, getSystemHealth } from "../../../lib/uploadApi.js";
import "./SystemHealthPage.css";

const STATUS_LABEL = {
  ok: "Healthy",
  warning: "Degraded",
  critical: "Critical",
};

const BANNER_LABEL = {
  ok: "All systems healthy",
  warning: "Degraded — some checks need attention",
  critical: "Critical — one or more components are failing",
};

function formatTimestamp(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB");
}

export default function SystemHealthPage() {
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  useEffect(() => {
    getAdminMe()
      .then((result) => setIsAdmin(Boolean(result?.isAdmin)))
      .catch(() => setIsAdmin(false))
      .finally(() => setAdminChecked(true));
  }, []);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getSystemHealth();
      setData(result);
      setLastRefreshedAt(new Date().toISOString());
    } catch (err) {
      setError(err?.message || "Failed to load system health.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchHealth();
    }
  }, [isAdmin, fetchHealth]);

  if (!adminChecked) {
    return (
      <div className="page stack">
        <p className="muted">Verifying access…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/portal" replace />;
  }

  const overall = data?.overall || "unknown";
  const checks = Array.isArray(data?.checks) ? data.checks : [];

  return (
    <div className="page stack system-health-page">
      <header className="system-health-header">
        <div>
          <h1>System Health</h1>
          <p className="muted">
            Live status of every critical component in the production upload stack.
          </p>
        </div>
        <Button variant="secondary" onClick={fetchHealth} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </header>

      {error && (
        <Card title="Could not load system health">
          <p className="system-health-error">{error}</p>
          <Button variant="primary" onClick={fetchHealth} disabled={loading}>
            Try again
          </Button>
        </Card>
      )}

      {!error && !data && loading && <p className="muted">Loading health…</p>}

      {!error && data && (
        <>
          <div className={`system-health-banner system-health-banner--${overall}`}>
            <span className="system-health-banner__dot" aria-hidden="true" />
            <div>
              <strong>{BANNER_LABEL[overall] || "Status unknown"}</strong>
              <p className="system-health-banner__meta">
                Last checked: {formatTimestamp(data.checkedAt)}
                {lastRefreshedAt && ` · Refreshed: ${formatTimestamp(lastRefreshedAt)}`}
              </p>
              {data.emailSkipped && data.cooldownExpiresAt && (
                <p className="system-health-banner__meta">
                  Alert email throttled until {formatTimestamp(data.cooldownExpiresAt)} (30-min cooldown active).
                </p>
              )}
              {data.emailSent && (
                <p className="system-health-banner__meta">
                  Alert email sent — cooldown until {formatTimestamp(data.cooldownExpiresAt)}.
                </p>
              )}
            </div>
          </div>

          <div className="system-health-grid">
            {checks.map((check) => (
              <Card key={check.name} className="system-health-check">
                <div className="system-health-check__head">
                  <span
                    className={`system-health-dot system-health-dot--${check.status}`}
                    aria-label={`Status: ${STATUS_LABEL[check.status] || check.status}`}
                  />
                  <h3 className="system-health-check__name">{check.name}</h3>
                  <span className={`system-health-badge system-health-badge--${check.status}`}>
                    {STATUS_LABEL[check.status] || check.status}
                  </span>
                </div>
                <p className="system-health-check__detail">{check.detail}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
