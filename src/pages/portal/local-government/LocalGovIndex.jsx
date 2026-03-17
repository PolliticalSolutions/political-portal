import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import Card from "../../../components/Card.jsx";
import { getAllActiveAlerts, getLocalAuthorities } from "./localGovApi.js";

function toHexColor(hex) {
  if (!hex) return null;
  return hex.startsWith("#") ? hex : `#${hex}`;
}

const LOCAL_GOV_PARTY_COLOURS = {
  "Reform UK":        "#12B6CF",
  "Liberal Democrat": "#FAA61A",
  "Conservative":     "#0087DC",
  "Green":            "#02A95B",
  "Labour":           "#E4003B",
  "Restore Britain":  "#8B5CF6",
  "SNP":              "#FDF38E",
  "Plaid Cymru":      "#3F8428",
  "Independent":      "#6B7280",
};

function partyHex(name) {
  if (!name) return "#94a3b8";
  return LOCAL_GOV_PARTY_COLOURS[name] ?? "#94a3b8";
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ControlBadge({ controlType }) {
  if (!controlType) return null;
  const labels = {
    majority: "Majority",
    minority: "Minority",
    coalition: "Coalition",
    noc: "No overall control",
  };
  const cls = controlType === "majority" ? "success" : controlType === "minority" ? "warning" : "secondary";
  return <span className={`status-pill ${cls}`} style={{ fontSize: 11 }}>{labels[controlType] ?? controlType}</span>;
}

function AlertBadge() {
  return <span className="status-pill error" style={{ fontSize: 11 }}>Alert</span>;
}

function ActiveAlertsPanel({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div style={{
      background: "#fef2f2",
      border: "1px solid #fecaca",
      borderLeft: "4px solid #dc2626",
      borderRadius: 8,
      overflow: "hidden",
      marginBottom: 0,
    }}>
      <div style={{ background: "#dc2626", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "0.03em" }}>
          ACTIVE INTELLIGENCE ALERTS
        </span>
        <span style={{
          background: "rgba(255,255,255,0.25)", color: "#fff",
          fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 10,
        }}>
          {alerts.length} active
        </span>
      </div>
      {alerts.map((alert, i) => (
        <div key={alert.id} style={{
          padding: "12px 16px",
          borderBottom: i < alerts.length - 1 ? "1px solid #fecaca" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{
              background: alert.risk_level === "high" ? "#dc2626" : "#d97706",
              color: "#fff", fontSize: 10, fontWeight: 700,
              padding: "1px 6px", borderRadius: 4, textTransform: "uppercase",
            }}>
              {alert.risk_level} risk
            </span>
            {alert.local_authorities && (
              <Link
                to={`/portal/local-government/${alert.local_authorities.gss_code}`}
                style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8", textDecoration: "none" }}
              >
                {alert.local_authorities.name}
              </Link>
            )}
            <span style={{ fontSize: 11, color: "#9ca3af" }}>Updated {formatDate(alert.updated_at)}</span>
          </div>
          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{alert.title}</p>
          <p style={{ margin: 0, fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{alert.summary}</p>
        </div>
      ))}
    </div>
  );
}

export default function LocalGovIndex() {
  const [authorities, setAuthorities] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedControl, setSelectedControl] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [auths, activeAlerts] = await Promise.all([
          getLocalAuthorities(),
          getAllActiveAlerts(),
        ]);
        if (cancelled) return;
        setAuthorities(auths);
        setAlerts(activeAlerts);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load local government data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const countries = useMemo(() => [...new Set(authorities.map((a) => a.country).filter(Boolean))].sort(), [authorities]);
  const regions = useMemo(() => {
    const src = selectedCountry ? authorities.filter((a) => a.country === selectedCountry) : authorities;
    return [...new Set(src.map((a) => a.region).filter(Boolean))].sort();
  }, [authorities, selectedCountry]);
  const types = useMemo(() => [...new Set(authorities.map((a) => a.authority_type).filter(Boolean))].sort(), [authorities]);

  const alertAuthIds = useMemo(() => new Set(alerts.map((a) => a.local_authorities?.id).filter(Boolean)), [alerts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return authorities.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q)) return false;
      if (selectedCountry && a.country !== selectedCountry) return false;
      if (selectedRegion && a.region !== selectedRegion) return false;
      if (selectedType && a.authority_type !== selectedType) return false;
      if (selectedControl && a.control_type !== selectedControl) return false;
      return true;
    });
  }, [authorities, query, selectedCountry, selectedRegion, selectedType, selectedControl]);

  const hasFilters = Boolean(query || selectedCountry || selectedRegion || selectedType || selectedControl);

  const stats = useMemo(() => ({
    total: authorities.length,
    noc: authorities.filter((a) => a.control_type === "noc").length,
    withAlerts: alertAuthIds.size,
    reformLed: authorities.filter((a) => a.controlling_party === "Reform UK").length,
  }), [authorities, alertAuthIds]);

  const clearFilters = () => {
    setQuery(""); setSelectedCountry(""); setSelectedRegion("");
    setSelectedType(""); setSelectedControl("");
  };

  if (loading) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Local Government Intelligence</span>
              <h1 className="portal-page-header__title">Loading local authorities</h1>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Political Solutions</span>
            <h1 className="portal-page-header__title">Local Government Intelligence</h1>
            <p className="portal-page-header__subtitle">
              Track council composition, political alerts, and the links between local and national political trends.
            </p>
          </div>
        </div>
        <div className="portal-summary-grid" style={{ marginTop: 24 }}>
          <div className="portal-stat">
            <span className="portal-stat__label">Authorities tracked</span>
            <span className="portal-stat__value">{stats.total}</span>
            <span className="portal-stat__meta">England, Wales, Scotland, N. Ireland</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">No overall control</span>
            <span className="portal-stat__value" style={{ color: "#d97706" }}>{stats.noc}</span>
            <span className="portal-stat__meta">Hung councils — highest instability risk</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Reform UK led</span>
            <span className="portal-stat__value" style={{ color: "#12B6CF" }}>{stats.reformLed}</span>
            <span className="portal-stat__meta">Councils under Reform administration</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Active alerts</span>
            <span className="portal-stat__value" style={{ color: "#dc2626" }}>{stats.withAlerts}</span>
            <span className="portal-stat__meta">Authorities with live intelligence flags</span>
          </div>
        </div>
      </Card>

      {error && <div className="status error" role="alert">{error}</div>}

      {alerts.length > 0 && <ActiveAlertsPanel alerts={alerts} />}

      <Card title="Search and filter">
        <div className="portal-filter-bar">
          <div className="portal-filter-grid">
            <label className="field field--span-2" htmlFor="lg-search">
              <span>Search authorities</span>
              <input
                id="lg-search" className="input" type="search"
                placeholder="Search by authority name"
                value={query} onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label className="field" htmlFor="lg-country">
              <span>Country</span>
              <select id="lg-country" className="input" value={selectedCountry} onChange={(e) => { setSelectedCountry(e.target.value); setSelectedRegion(""); }}>
                <option value="">All countries</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field" htmlFor="lg-region">
              <span>Region</span>
              <select id="lg-region" className="input" value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}>
                <option value="">All regions</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="field" htmlFor="lg-type">
              <span>Authority type</span>
              <select id="lg-type" className="input" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                <option value="">All types</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="field" htmlFor="lg-control">
              <span>Control type</span>
              <select id="lg-control" className="input" value={selectedControl} onChange={(e) => setSelectedControl(e.target.value)}>
                <option value="">All</option>
                <option value="majority">Majority</option>
                <option value="minority">Minority</option>
                <option value="coalition">Coalition</option>
                <option value="noc">No overall control</option>
              </select>
            </label>
          </div>
          <div className="portal-page-header__actions">
            <Button type="button" variant="ghost" onClick={clearFilters} disabled={!hasFilters}>
              Clear filters
            </Button>
          </div>
          <p className="portal-kpi-note">
            Showing {filtered.length} of {authorities.length} authorities.
          </p>
        </div>
      </Card>

      <Card title={hasFilters ? `Filtered results (${filtered.length})` : `All authorities (${authorities.length})`}>
        {filtered.length === 0 ? (
          <div className="portal-placeholder-panel">
            <p className="portal-placeholder-panel__title">No authorities match these filters</p>
            <p className="portal-placeholder-panel__body">Change the search term or clear the filters.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Authority</th>
                  <th>Type</th>
                  <th>Largest party</th>
                  <th>Control</th>
                  <th>Last election</th>
                  <th>Next election</th>
                  <th>Alert</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((auth) => {
                  const hasAlert = alertAuthIds.has(auth.id);
                  const hex = toHexColor(partyHex(auth.controlling_party));
                  return (
                    <tr key={auth.gss_code}>
                      <td>
                        <Link className="table-link" to={`/portal/local-government/${auth.gss_code}`}>
                          {auth.name}
                        </Link>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{auth.region}</div>
                      </td>
                      <td style={{ fontSize: 12 }}>{auth.authority_type}</td>
                      <td>
                        {auth.controlling_party ? (
                          <span className="party-chip">
                            <span className="party-dot" style={{ width: 9, height: 9, background: hex ?? "#94a3b8" }} />
                            <span style={{ fontSize: 12 }}>{auth.controlling_party}</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "#64748b" }}>—</span>
                        )}
                      </td>
                      <td><ControlBadge controlType={auth.control_type} /></td>
                      <td style={{ fontSize: 12 }}>{formatDate(auth.last_election_date)}</td>
                      <td style={{ fontSize: 12 }}>{formatDate(auth.next_election_date)}</td>
                      <td>{hasAlert && <AlertBadge />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
