import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Card from "../../../components/Card.jsx";
import { supabase } from "../../../lib/supabaseClient.js";

const getFirstValue = (row, keys, fallback = "") => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return fallback;
};

const normalizeAlert = (row) => {
  const dateValue = getFirstValue(row, ["date", "alert_date", "published_at", "created_at", "updated_at"]);
  return {
    id: row.id || row.alert_id || `${getFirstValue(row, ["title", "headline", "name"], "alert")}-${dateValue}`,
    title: getFirstValue(row, ["title", "headline", "name", "alert_title"], "Political alert"),
    description: getFirstValue(row, ["description", "summary", "details", "body", "message"], "No description supplied."),
    status: getFirstValue(row, ["severity", "status", "alert_status", "risk_level"], "Update"),
    date: dateValue,
  };
};

const formatAlertDate = (value) => {
  if (!value) return "Date pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadAlerts = async () => {
      setLoading(true);
      setError("");
      const { data, error: queryError } = await supabase.from("political_alerts").select("*");
      if (!active) return;
      if (queryError) {
        setError(queryError.message || "Failed to load political alerts.");
        setAlerts([]);
      } else {
        setAlerts((data || []).map(normalizeAlert));
      }
      setLoading(false);
    };
    loadAlerts();
    return () => {
      active = false;
    };
  }, []);

  const sortedAlerts = useMemo(() => {
    return [...alerts].sort((a, b) => {
      const aTime = new Date(a.date).getTime();
      const bTime = new Date(b.date).getTime();
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return a.title.localeCompare(b.title);
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;
      return bTime - aTime;
    });
  }, [alerts]);

  return (
    <div className="page stack">
      <Helmet><title>Alerts | Political Solutions</title></Helmet>
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Local Government Reorganisation</span>
            <h1 className="portal-page-header__title">Political Alerts</h1>
            <p className="portal-page-header__subtitle">
              Live alerts from the political intelligence database covering LGR developments and related status
              changes.
            </p>
          </div>
          <div className="portal-page-header__actions">
            <Link to="/portal/local-government/lgr" className="button ghost">LGR tracker</Link>
          </div>
        </div>
      </Card>

      <Card title="LGR alerts">
        {loading && <p className="muted">Loading alerts...</p>}
        {error && <div className="status error">{error}</div>}
        {!loading && !error && sortedAlerts.length === 0 && (
          <div className="portal-placeholder-panel">
            <p className="portal-placeholder-panel__title">No alerts found</p>
            <p className="portal-placeholder-panel__body">
              The political_alerts table did not return any rows.
            </p>
          </div>
        )}
        <div className="stack" style={{ gap: 12 }}>
          {sortedAlerts.map((alert) => (
            <article key={alert.id} className="portal-record">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>{alert.title}</h2>
                  <p className="muted" style={{ margin: 0 }}>{alert.description}</p>
                </div>
                <span className="badge accent" style={{ flexShrink: 0 }}>{alert.status}</span>
              </div>
              <p className="muted" style={{ margin: "10px 0 0", fontSize: 12 }}>
                {formatAlertDate(alert.date)}
              </p>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
