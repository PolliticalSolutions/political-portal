import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "../../../components/Card.jsx";
import { resolvePartyColour, toHexColor } from "../../../utils/partyColours.js";
import {
  getAuthorityAlerts,
  getAuthorityElections,
  getAuthorityWards,
  getElectionResults,
  getLinkedConstituencies,
  getLocalAuthority,
} from "./localGovApi.js";

// ── Shared helpers ────────────────────────────────────────────────────────────

function partyHex(name) {
  return resolvePartyColour(name);
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function formatShortDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatPct(val) {
  if (val == null) return "—";
  return `${parseFloat(val).toFixed(1)}%`;
}

const TABS = [
  { id: "composition", label: "Composition" },
  { id: "history", label: "Election History" },
  { id: "wards", label: "Wards" },
  { id: "parliament", label: "Parliamentary Link" },
  { id: "intelligence", label: "Intelligence" },
];

// ── Tab bar ────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }) {
  return (
    <div className="portal-tabs" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id} type="button" role="tab"
          aria-selected={active === tab.id}
          className={`portal-tab${active === tab.id ? " active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────

function ControlBadge({ controlType }) {
  if (!controlType) return null;
  const labels = { majority: "Majority", minority: "Minority administration", coalition: "Coalition", noc: "No overall control" };
  const cls = controlType === "majority" ? "success" : controlType === "minority" ? "warning" : "secondary";
  return <span className={`status-pill ${cls}`}>{labels[controlType] ?? controlType}</span>;
}

function RiskBadge({ level }) {
  if (!level) return null;
  return (
    <span className={`status-pill ${level === "high" ? "error" : "warning"}`}>
      {level === "high" ? "High alert" : "Alert"}
    </span>
  );
}

// ── Composition tab ────────────────────────────────────────────────────────

function CompositionTab({ authority }) {
  const { composition, total_seats, controlling_party, control_type } = authority;
  if (!composition || Object.keys(composition).length === 0) {
    return (
      <div className="portal-placeholder-panel">
        <p className="portal-placeholder-panel__title">No composition data</p>
        <p className="portal-placeholder-panel__body">Current council composition has not been loaded.</p>
      </div>
    );
  }

  const majority = total_seats ? Math.floor(total_seats / 2) + 1 : null;
  const entries = Object.entries(composition).sort((a, b) => b[1] - a[1]);
  const largest = entries[0];

  return (
    <div className="portal-data-section">
      <div className="portal-summary-grid" style={{ marginBottom: 16 }}>
        <div className="portal-stat">
          <span className="portal-stat__label">Total seats</span>
          <span className="portal-stat__value">{total_seats ?? "—"}</span>
          {majority != null && <span className="portal-stat__meta">Majority requires {majority}</span>}
        </div>
        <div className="portal-stat">
          <span className="portal-stat__label">Largest party</span>
          <span className="portal-stat__value" style={{ fontSize: 18 }}>{controlling_party ?? largest?.[0] ?? "—"}</span>
          {largest && <span className="portal-stat__meta">{largest[1]} seats</span>}
        </div>
        <div className="portal-stat">
          <span className="portal-stat__label">Administration</span>
          <span className="portal-stat__value" style={{ fontSize: 16 }}>
            <ControlBadge controlType={control_type} />
          </span>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Party</th>
              <th>Seats</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([party, seats]) => {
              const hex = toHexColor(partyHex(party));
              const pct = total_seats > 0 ? ((seats / total_seats) * 100).toFixed(1) : "—";
              return (
                <tr key={party}>
                  <td>
                    <span className="party-chip">
                      <span className="party-dot" style={{ width: 10, height: 10, background: hex ?? "#94a3b8" }} />
                      <span>{party}</span>
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{seats}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden", minWidth: 80 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: hex, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, color: "#64748b", width: 44, textAlign: "right" }}>{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Election History tab ────────────────────────────────────────────────────

function ElectionHistoryTab({ authorityId }) {
  const [elections, setElections] = useState([]);
  const [resultsByElection, setResultsByElection] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const els = await getAuthorityElections(authorityId);
        if (cancelled) return;
        setElections(els);
        const resultsMap = {};
        await Promise.all(els.map(async (el) => {
          const res = await getElectionResults(el.id);
          resultsMap[el.id] = res;
        }));
        if (!cancelled) setResultsByElection(resultsMap);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [authorityId]);

  if (loading) return <p className="muted" style={{ padding: 16 }}>Loading election history…</p>;

  if (elections.length === 0) {
    return (
      <div className="portal-placeholder-panel">
        <p className="portal-placeholder-panel__title">No election records</p>
        <p className="portal-placeholder-panel__body">Election history for this authority has not been loaded yet.</p>
      </div>
    );
  }

  return (
    <div className="portal-data-section">
      {elections.map((el) => {
        const results = resultsByElection[el.id] ?? [];
        return (
          <div key={el.id} className="portal-record" style={{ marginBottom: 16 }}>
            <div className="portal-data-section__header">
              <p className="portal-data-section__title">{el.election_type ?? "Council election"} — {formatShortDate(el.election_date)}</p>
              <div className="portal-data-section__meta">
                {el.seats_contested != null ? `${el.seats_contested} seats contested` : ""}
                {el.turnout != null ? ` • ${formatPct(el.turnout)} turnout` : ""}
              </div>
            </div>
            {results.length > 0 && (
              <div className="table-wrap">
                <table className="table table--compact">
                  <thead>
                    <tr><th>Party</th><th>Seats won</th><th>Change</th><th>Vote share</th></tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const hex = toHexColor(partyHex(r.party_name));
                      const changeColor = r.seats_change > 0 ? "#15803d" : r.seats_change < 0 ? "#b91c1c" : "#64748b";
                      const changeStr = r.seats_change != null
                        ? `${r.seats_change > 0 ? "+" : ""}${r.seats_change}`
                        : "—";
                      return (
                        <tr key={r.id}>
                          <td>
                            <span className="party-chip">
                              <span className="party-dot" style={{ width: 9, height: 9, background: hex }} />
                              <span>{r.party_name}</span>
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{r.seats_won ?? "—"}</td>
                          <td style={{ color: changeColor }}>{changeStr}</td>
                          <td>{r.vote_share != null ? formatPct(r.vote_share) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Wards tab ────────────────────────────────────────────────────────────

function WardsTab({ authorityId }) {
  const [wards, setWards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAuthorityWards(authorityId)
      .then((data) => { if (!cancelled) setWards(data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authorityId]);

  if (loading) return <p className="muted" style={{ padding: 16 }}>Loading wards…</p>;

  if (wards.length === 0) {
    return (
      <div className="portal-placeholder-panel">
        <p className="portal-placeholder-panel__title">No ward data available</p>
        <p className="portal-placeholder-panel__body">Ward-level breakdown has not been loaded for this authority.</p>
      </div>
    );
  }

  // Group wards by controlling party for summary
  const bySeat = wards.reduce((acc, w) => {
    const p = w.controlling_party ?? "Unknown";
    acc[p] = (acc[p] ?? 0) + (w.total_seats ?? 1);
    return acc;
  }, {});
  const sortedParties = Object.entries(bySeat).sort((a, b) => b[1] - a[1]);

  return (
    <div className="portal-data-section">
      <div className="portal-record" style={{ marginBottom: 16 }}>
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Party summary ({wards.length} divisions)
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {sortedParties.map(([party, count]) => (
            <span key={party} className="party-chip" style={{ background: "#f1f5f9", padding: "3px 8px", borderRadius: 4 }}>
              <span className="party-dot" style={{ width: 8, height: 8, background: toHexColor(partyHex(party)) }} />
              <span style={{ fontSize: 12 }}>{party}: {count}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table table--compact">
          <thead>
            <tr><th>Division / ward</th><th>Controlling party</th><th>Last election</th></tr>
          </thead>
          <tbody>
            {wards.map((ward) => {
              const hex = toHexColor(partyHex(ward.controlling_party));
              return (
                <tr key={ward.id}>
                  <td>{ward.ward_name}</td>
                  <td>
                    <span className="party-chip">
                      <span className="party-dot" style={{ width: 9, height: 9, background: hex }} />
                      <span style={{ fontSize: 12 }}>{ward.controlling_party ?? "—"}</span>
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatShortDate(ward.last_election_date)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Parliamentary Link tab ────────────────────────────────────────────────

function ParliamentaryLinkTab({ authorityId, authority }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getLinkedConstituencies(authorityId)
      .then((data) => { if (!cancelled) setLinks(data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authorityId]);

  if (loading) return <p className="muted" style={{ padding: 16 }}>Loading parliamentary links…</p>;

  if (links.length === 0) {
    return (
      <div className="portal-placeholder-panel">
        <p className="portal-placeholder-panel__title">No parliamentary links</p>
        <p className="portal-placeholder-panel__body">Constituency-to-council lookup data has not been loaded yet.</p>
      </div>
    );
  }

  return (
    <div className="portal-data-section">
      <div className="portal-record" style={{ marginBottom: 16 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
          The following Westminster parliamentary constituencies overlap with{" "}
          <strong>{authority.name}</strong>. Click any constituency to view its full intelligence profile.
        </p>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Constituency</th><th>Region</th><th>Overlap type</th><th>Primary</th></tr>
          </thead>
          <tbody>
            {links.map((link) => {
              const con = link.constituencies;
              return (
                <tr key={link.id}>
                  <td>
                    {con ? (
                      <Link className="table-link" to={`/portal/constituency/${con.ons_code}`}>
                        {con.name}
                      </Link>
                    ) : "—"}
                  </td>
                  <td style={{ fontSize: 12 }}>{con?.region ?? "—"}</td>
                  <td style={{ fontSize: 12 }}>{link.overlap_type ?? "—"}</td>
                  <td>{link.is_primary && <span className="status-pill success" style={{ fontSize: 11 }}>Primary</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Intelligence tab ────────────────────────────────────────────────────────

function IntelligenceTab({ authorityId }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAuthorityAlerts(authorityId)
      .then((data) => { if (!cancelled) setAlerts(data); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authorityId]);

  if (loading) return <p className="muted" style={{ padding: 16 }}>Loading intelligence…</p>;

  if (alerts.length === 0) {
    return (
      <div className="portal-placeholder-panel">
        <p className="portal-placeholder-panel__title">No active alerts</p>
        <p className="portal-placeholder-panel__body">No intelligence alerts are currently active for this authority.</p>
      </div>
    );
  }

  return (
    <div className="portal-data-section">
      {alerts.map((alert) => (
        <div key={alert.id} style={{
          background: alert.risk_level === "high" ? "#fef2f2" : "#fffbeb",
          border: `1px solid ${alert.risk_level === "high" ? "#fecaca" : "#fde68a"}`,
          borderLeft: `4px solid ${alert.risk_level === "high" ? "#dc2626" : "#d97706"}`,
          borderRadius: 6, padding: "14px 16px", marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <RiskBadge level={alert.risk_level} />
            <span style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {alert.alert_type?.replace(/_/g, " ")}
            </span>
          </div>
          <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 14, color: "#1e293b" }}>
            {alert.title}
          </p>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
            {alert.summary}
          </p>
          {alert.detail && (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.6, borderTop: "1px solid #e2e8f0", paddingTop: 8, marginTop: 8 }}>
              {alert.detail}
            </p>
          )}
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "#9ca3af" }}>
            Updated {formatShortDate(alert.updated_at)}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Demographics synergy panel ───────────────────────────────────────────────

function DemographicSynergyPanel({ authority }) {
  const { controlling_party, composition, control_type } = authority;
  if (!composition) return null;

  const total = Object.values(composition).reduce((a, b) => a + b, 0);
  const reformPct = total > 0 ? ((composition["Reform UK"] ?? 0) / total) * 100 : 0;
  const ldPct = total > 0 ? ((composition["Liberal Democrat"] ?? 0) / total) * 100 : 0;
  const labPct = total > 0 ? ((composition["Labour"] ?? 0) / total) * 100 : 0;
  const conPct = total > 0 ? ((composition["Conservative"] ?? 0) / total) * 100 : 0;

  const insights = [];
  if (reformPct >= 25) insights.push({ text: "High Reform UK strength typically correlates with areas of post-industrial decline, lower graduate populations, and high white British identity.", colour: "#12B6CF" });
  if (ldPct >= 25) insights.push({ text: "Strong Liberal Democrat performance typically correlates with high owner-occupancy, graduate populations, and affluent suburban or rural demographics.", colour: "#FAA61A" });
  if (labPct >= 25) insights.push({ text: "Labour strength typically correlates with urban density, higher levels of social renting, and ethnically diverse populations.", colour: "#E4003B" });
  if (conPct >= 25) insights.push({ text: "Conservative strength typically correlates with high owner-occupancy, older age profiles, and rural or market-town constituencies.", colour: "#0087DC" });
  if (control_type === "noc") insights.push({ text: "No overall control increases volatility — watch for budget failures, confidence votes, and potential by-elections in marginal wards.", colour: "#d97706" });

  if (insights.length === 0) return null;

  return (
    <div className="portal-record" style={{ marginTop: 16 }}>
      <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Demographic correlations
      </p>
      {insights.map((ins, i) => (
        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 4, borderRadius: 2, background: ins.colour, flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{ins.text}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main detail component ─────────────────────────────────────────────────────

export default function LocalGovDetail() {
  const { gssCode } = useParams();
  const [authority, setAuthority] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("composition");

  useEffect(() => {
    if (!gssCode) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const auth = await getLocalAuthority(gssCode);
        if (cancelled) return;
        setAuthority(auth);
        const authAlerts = await getAuthorityAlerts(auth.id);
        if (!cancelled) setAlerts(authAlerts);
      } catch (err) {
        if (!cancelled) setError(err.message || "Authority not found.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [gssCode]);

  const highAlerts = useMemo(() => alerts.filter((a) => a.risk_level === "high"), [alerts]);

  if (loading) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Local Government Intelligence</span>
              <h1 className="portal-page-header__title">Loading authority…</h1>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (error || !authority) {
    return (
      <div className="page stack">
        <Card>
          <div className="status error" role="alert">{error || "Authority not found."}</div>
          <div className="portal-page-header__actions" style={{ marginTop: 16 }}>
            <Link to="/portal/local-government" className="button ghost">Back to local government</Link>
          </div>
        </Card>
      </div>
    );
  }

  const majority = authority.total_seats ? Math.floor(authority.total_seats / 2) + 1 : null;
  const largestSeats = authority.controlling_party && authority.composition
    ? authority.composition[authority.controlling_party]
    : null;

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Local Government Intelligence</span>
            <h1 className="portal-page-header__title">{authority.name}</h1>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              {authority.authority_type && (
                <span className="status-pill secondary" style={{ fontSize: 12 }}>{authority.authority_type}</span>
              )}
              <ControlBadge controlType={authority.control_type} />
              {highAlerts.length > 0 && <RiskBadge level="high" />}
            </div>
          </div>
          <div className="portal-page-header__actions">
            <Link to="/portal/local-government" className="button ghost">Back to local government</Link>
          </div>
        </div>

        <div className="portal-summary-grid" style={{ marginTop: 24 }}>
          <div className="portal-stat">
            <span className="portal-stat__label">Total seats</span>
            <span className="portal-stat__value">{authority.total_seats ?? "—"}</span>
            <span className="portal-stat__meta">{majority != null ? `Majority: ${majority}` : ""}</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Largest party</span>
            <span className="portal-stat__value" style={{ fontSize: 18 }}>
              {authority.controlling_party ?? "No overall control"}
            </span>
            <span className="portal-stat__meta">{largestSeats != null ? `${largestSeats} seats` : ""}</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Last election</span>
            <span className="portal-stat__value" style={{ fontSize: 18 }}>
              {authority.last_election_date ? new Date(authority.last_election_date).getFullYear() : "—"}
            </span>
            <span className="portal-stat__meta">{formatDate(authority.last_election_date)}</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Next election</span>
            <span className="portal-stat__value" style={{ fontSize: 18 }}>
              {authority.next_election_date ? new Date(authority.next_election_date).getFullYear() : "—"}
            </span>
            <span className="portal-stat__meta">{formatDate(authority.next_election_date)}</span>
          </div>
        </div>

        {authority.region && (
          <div className="portal-data-note" style={{ marginTop: 12 }}>
            {authority.region} • {authority.country}
            {authority.website_url && (
              <> • <a href={authority.website_url} target="_blank" rel="noopener noreferrer">{authority.website_url}</a></>
            )}
          </div>
        )}
      </Card>

      <Card>
        <TabBar active={activeTab} onChange={setActiveTab} />
        {activeTab === "composition" && (
          <>
            <CompositionTab authority={authority} />
            <DemographicSynergyPanel authority={authority} />
          </>
        )}
        {activeTab === "history" && <ElectionHistoryTab authorityId={authority.id} />}
        {activeTab === "wards" && <WardsTab authorityId={authority.id} />}
        {activeTab === "parliament" && <ParliamentaryLinkTab authorityId={authority.id} authority={authority} />}
        {activeTab === "intelligence" && <IntelligenceTab authorityId={authority.id} />}
      </Card>
    </div>
  );
}
