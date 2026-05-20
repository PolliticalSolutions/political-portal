import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import Card from "../../../components/Card.jsx";
import DataProvenancePanel from "../../../components/DataProvenancePanel.jsx";
import { getIntelligenceMetadata } from "../../../lib/intelligenceMetadataApi.js";
import { resolvePartyColour, toHexColor } from "../../../utils/partyColours.js";
import {
  getAuthorityAlerts,
  getAuthorityElections,
  getAuthorityWards,
  getByElectionAttendanceAlerts,
  getCouncillorAttendance,
  getElectionResults,
  getLinkedConstituencies,
  getLocalAuthority,
  getLgrStatus,
} from "./localGovApi.js";
import { getCompositionQuality, isWarwickshireVerified } from "./localGovQuality.js";

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
  { id: "attendance", label: "Attendance" },
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
  if (level === "critical") {
    return (
      <span className="status-pill error" style={{ background: "#7f1d1d", color: "#fff" }}>
        Critical
      </span>
    );
  }
  return (
    <span className={`status-pill ${level === "high" ? "error" : "warning"}`}>
      {level === "high" ? "High alert" : "Alert"}
    </span>
  );
}

// ── Composition tab ────────────────────────────────────────────────────────

function CompositionDataWarning({ authority }) {
  const quality = getCompositionQuality(authority);
  if (quality.status === "verified") return null;

  return (
    <div className="portal-insight-callout portal-insight-callout--warning" style={{ marginBottom: 16 }}>
      <p className="portal-insight-callout__title">
        {quality.status === "missing" ? "Composition data not yet available" : "Composition data pending verification"}
      </p>
      <p className="portal-insight-callout__body">{quality.note}</p>
    </div>
  );
}

function CompositionTab({ authority }) {
  const { composition, total_seats, controlling_party, control_type } = authority;
  const quality = getCompositionQuality(authority);

  if (!composition || Object.keys(composition).length === 0) {
    return (
      <div>
        <CompositionDataWarning authority={authority} />
        <div className="portal-placeholder-panel">
          <p className="portal-placeholder-panel__title">Composition data not yet available</p>
          <p className="portal-placeholder-panel__body">
            Current council composition has not been loaded. Structural authority data remains available below.
          </p>
        </div>
      </div>
    );
  }

  const majority = total_seats ? Math.floor(total_seats / 2) + 1 : null;
  const entries = Object.entries(composition).sort((a, b) => b[1] - a[1]);
  const largest = entries[0];

  return (
    <div className="portal-data-section">
      <CompositionDataWarning authority={authority} />
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
          <span className="portal-stat__meta">
            {quality.status === "verified" ? "Manually verified" : "Pending manual review"}
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
          background: alert.risk_level === "critical" ? "#fff1f2" : alert.risk_level === "high" ? "#fef2f2" : "#fffbeb",
          border: `1px solid ${alert.risk_level === "critical" ? "#fda4af" : alert.risk_level === "high" ? "#fecaca" : "#fde68a"}`,
          borderLeft: `4px solid ${alert.risk_level === "critical" ? "#9f1239" : alert.risk_level === "high" ? "#dc2626" : "#d97706"}`,
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

// ── Attendance tab ────────────────────────────────────────────────────────────

function AttendanceTab({ authorityId }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["councillorAttendance", authorityId],
    queryFn: () => getCouncillorAttendance(authorityId),
    enabled: Boolean(authorityId),
    staleTime: Infinity,
  });

  if (isLoading) return <p className="muted" style={{ padding: 16 }}>Loading attendance data…</p>;

  if (rows.length === 0) {
    return (
      <div className="portal-placeholder-panel">
        <p className="portal-placeholder-panel__title">Attendance data not yet available for this authority</p>
        <p className="portal-placeholder-panel__body">
          Councillor attendance records have not been loaded for this authority.
        </p>
      </div>
    );
  }

  const first = rows[0];
  const periodStr = first.period_start && first.period_end
    ? `${formatShortDate(first.period_start)} – ${formatShortDate(first.period_end)}`
    : null;
  const hasParty = rows.some((r) => r.party);

  return (
    <div className="portal-data-section">
      {periodStr && (
        <div className="portal-data-note" style={{ marginBottom: 12 }}>
          Period: {periodStr}
          {first.source_url && (
            <> · <a href={first.source_url} target="_blank" rel="noopener noreferrer">View source</a></>
          )}
        </div>
      )}
      <div className="table-wrap">
        <table className="table table--compact">
          <thead>
            <tr>
              <th>Councillor</th>
              {hasParty && <th>Party</th>}
              <th>Eligible</th>
              <th>Attended</th>
              <th>Attendance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const pct = parseFloat(row.attendance_pct ?? 100);
              const rowBg = pct < 25 ? "#fef2f2" : pct < 50 ? "#fffbeb" : undefined;
              const pctColor = pct < 25 ? "#b91c1c" : pct < 50 ? "#d97706" : "#15803d";
              return (
                <tr key={row.id} style={rowBg ? { background: rowBg } : undefined}>
                  <td>{row.councillor_name}</td>
                  {hasParty && <td style={{ fontSize: 12 }}>{row.party ?? "—"}</td>}
                  <td>{row.meetings_eligible ?? "—"}</td>
                  <td>{row.meetings_attended ?? "—"}</td>
                  <td>
                    <span style={{ fontWeight: 700, color: pctColor }}>{formatPct(row.attendance_pct)}</span>
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

// ── LGR Banner ───────────────────────────────────────────────────────────────

const LGR_STATUS_COLOURS = {
  "Order made": { bg: "#fef2f2", border: "#fecaca", left: "#dc2626", badge: "#dc2626" },
  "Consultation closed": { bg: "#fff7ed", border: "#fed7aa", left: "#ea580c", badge: "#ea580c" },
  "Consultation open": { bg: "#fffbeb", border: "#fde68a", left: "#d97706", badge: "#d97706" },
  "Shadow authority": { bg: "#f0fdf4", border: "#bbf7d0", left: "#16a34a", badge: "#16a34a" },
  "Completed": { bg: "#f0fdf4", border: "#bbf7d0", left: "#16a34a", badge: "#16a34a" },
};

function LgrBanner({ lgr }) {
  if (!lgr) return null;
  const colours = LGR_STATUS_COLOURS[lgr.lgr_status] ?? LGR_STATUS_COLOURS["Consultation open"];
  const abolitionYear = lgr.abolition_date ? new Date(lgr.abolition_date).getFullYear() : null;

  return (
    <div style={{
      background: colours.bg,
      border: `1px solid ${colours.border}`,
      borderLeft: `4px solid ${colours.left}`,
      borderRadius: 6,
      padding: "14px 16px",
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{
          background: colours.badge, color: "#fff",
          borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.03em",
        }}>
          LGR — {lgr.lgr_status}
        </span>
        {lgr.lgr_wave && (
          <span style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {lgr.lgr_wave}
          </span>
        )}
        {lgr.mayoral_combined_authority && (
          <span className="status-pill secondary" style={{ fontSize: 11 }}>Mayoral CA planned</span>
        )}
      </div>
      <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 14, color: "#1e293b" }}>
        This authority is subject to Local Government Reorganisation
        {abolitionYear ? ` — expected abolition ${abolitionYear}` : ""}.
      </p>
      {lgr.proposed_unitary_name && lgr.proposed_unitary_name !== "TBC" && (
        <p style={{ margin: "0 0 6px", fontSize: 13, color: "#374151" }}>
          Proposed successor: <strong>{lgr.proposed_unitary_name}</strong>
        </p>
      )}
      {lgr.political_context && (
        <p style={{ margin: "0 0 6px", fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
          {lgr.political_context}
        </p>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
{lgr.source_url && (
          <a href={lgr.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#6b7280" }}>
            MHCLG source →
          </a>
        )}
      </div>
    </div>
  );
}

// ── By-Election Early Warning ─────────────────────────────────────────────────

function ByElectionEarlyWarningSection({ authorityId }) {
  const { data: earlyWarningAlerts = [], isLoading } = useQuery({
    queryKey: ["byElectionAttendance", authorityId],
    queryFn: () => getByElectionAttendanceAlerts(authorityId),
    enabled: Boolean(authorityId),
    staleTime: Infinity,
  });

  const parsed = earlyWarningAlerts.map(row => {
    let detail = {};
    try { detail = JSON.parse(row.detail) || {}; } catch { /* empty */ }
    return {
      id: row.id,
      councillorName: detail.councillorName ?? "",
      ward: detail.ward ?? "",
      party: detail.party ?? "",
      lastAttendanceDate: detail.lastAttendanceDate ?? null,
      monthsElapsed: detail.monthsElapsed ?? null,
      riskStatus: detail.riskStatus ?? "",
    };
  });

  function StatusBadge({ status }) {
    if (status === "vacant") {
      return <span className="status-pill error" style={{ background: "#7f1d1d", color: "#fff" }}>Vacant</span>;
    }
    if (status === "critical") {
      return <span className="status-pill error">Critical</span>;
    }
    return <span className="status-pill warning">Elevated</span>;
  }

  return (
    <Card>
      <h2 className="portal-section-title" style={{ marginBottom: 8 }}>By-Election Early Warning</h2>
      <p className="portal-data-note" style={{ marginBottom: 16 }}>
        Under Section 85, Local Government Act 1972, a councillor who fails to attend any qualifying
        meeting for six consecutive months is automatically disqualified unless the council grants a
        dispensation.
      </p>
      {isLoading ? (
        <p className="muted">Loading early warning data…</p>
      ) : parsed.length === 0 ? (
        <div className="portal-placeholder-panel">No current early warning flags for this authority.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table table--compact">
            <thead>
              <tr>
                <th>Councillor</th>
                <th>Ward</th>
                <th>Party</th>
                <th>Last attendance</th>
                <th>Months elapsed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {parsed.map(row => (
                <tr key={row.id}>
                  <td>{row.councillorName}</td>
                  <td>{row.ward || "—"}</td>
                  <td>{row.party || "—"}</td>
                  <td>{row.lastAttendanceDate ? formatShortDate(row.lastAttendanceDate) : "—"}</td>
                  <td style={{ textAlign: "center" }}>{row.monthsElapsed ?? "—"}</td>
                  <td><StatusBadge status={row.riskStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Main detail component ─────────────────────────────────────────────────────

export default function LocalGovDetail() {
  const { gssCode } = useParams();
  const [activeTab, setActiveTab] = useState("composition");

  // Query 1: authority header — fires immediately
  const { data: authority, isLoading: loading, isError, error: authError } = useQuery({
    queryKey: ["localAuthority", gssCode],
    queryFn: () => getLocalAuthority(gssCode),
    enabled: Boolean(gssCode),
  });

  // Queries 2, 3, 4: all fire in parallel once authority resolves
  const { data: alerts = [] } = useQuery({
    queryKey: ["authorityAlerts", authority?.id],
    queryFn: () => getAuthorityAlerts(authority.id),
    enabled: Boolean(authority?.id),
  });

  const { data: lgrStatus = null } = useQuery({
    queryKey: ["lgrStatus", authority?.name],
    queryFn: () => getLgrStatus(authority.name),
    enabled: Boolean(authority?.name),
    staleTime: Infinity,
  });

  const { data: metadata = null } = useQuery({
    queryKey: ["localAuthorityMetadata", authority?.id],
    queryFn: () => getIntelligenceMetadata({
      tableName: "local_authorities",
      entityType: "local_authority",
      entityId: authority.id,
      datasetKey: "local_government_intelligence",
    }),
    enabled: Boolean(authority?.id),
    staleTime: Infinity,
  });

  const error = isError ? (authError?.message || "Authority not found.") : "";

  const highAlerts = useMemo(() => (alerts || []).filter((a) => a.risk_level === "high"), [alerts]);

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
      <Helmet><title>{authority.name} | Local Government | Political Solutions</title></Helmet>
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
              {isWarwickshireVerified(authority) ? (
                <span className="status-pill success" style={{ fontSize: 12 }}>Warwickshire verified</span>
              ) : (
                <span className="status-pill warning" style={{ fontSize: 12 }}>Composition pending review</span>
              )}
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
        <LgrBanner lgr={lgrStatus} />
        <TabBar active={activeTab} onChange={setActiveTab} />
        {activeTab === "composition" && (
          <>
            <CompositionTab authority={authority} />
            <DemographicSynergyPanel authority={authority} />
          </>
        )}
        {activeTab === "attendance" && <AttendanceTab authorityId={authority.id} />}
        {activeTab === "history" && <ElectionHistoryTab authorityId={authority.id} />}
        {activeTab === "wards" && <WardsTab authorityId={authority.id} />}
        {activeTab === "parliament" && <ParliamentaryLinkTab authorityId={authority.id} authority={authority} />}
        {activeTab === "intelligence" && <IntelligenceTab authorityId={authority.id} />}
      </Card>

      <ByElectionEarlyWarningSection authorityId={authority.id} />

      <DataProvenancePanel
        metadata={metadata}
        fallbackCopy="Authority-level source links and confidence notes will appear here once local government provenance records are populated."
      />
    </div>
  );
}
