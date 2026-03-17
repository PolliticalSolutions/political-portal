import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "../../../components/Card.jsx";
import {
  getCouncilData,
  getConstituency,
  getConstituencyDemographics,
  getConstituencyResults,
  getConstituencySwings,
} from "./constituencyApi.js";
import { getCurrentStatus } from "./constituencyPresentation.js";

const NATIONAL_AVERAGES = {
  pct_owner_occupied: 64.8,
  pct_social_rented: 17.1,
  pct_private_rented: 18.5,
  pct_degree_qualified: 33.8,
  pct_no_qualifications: 18.3,
  pct_white_british: 74.4,
  pct_born_uk: 86.4,
  pct_christian: 46.2,
  pct_employed: 60.9,
  pct_self_employed: 9.3,
  median_age: 40.6,
  median_household_income: 31400,
};

const TABS = [
  { id: "history", label: "Election History" },
  { id: "demographics", label: "Demographics" },
  { id: "candidates", label: "Candidates" },
  { id: "councils", label: "Local Councils" },
];

const DEMOGRAPHIC_FIELDS = [
  { key: "pct_owner_occupied", label: "Owner occupied" },
  { key: "pct_social_rented", label: "Social rented" },
  { key: "pct_private_rented", label: "Private rented" },
  { key: "pct_degree_qualified", label: "Degree qualified" },
  { key: "pct_no_qualifications", label: "No qualifications" },
  { key: "pct_white_british", label: "White British" },
  { key: "pct_born_uk", label: "Born in UK" },
  { key: "pct_christian", label: "Christian" },
  { key: "pct_employed", label: "Employed" },
  { key: "pct_self_employed", label: "Self-employed" },
];

function toHexColor(hex) {
  if (!hex) return null;
  return hex.startsWith("#") ? hex : `#${hex}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatNumber(value) {
  if (value == null) return "—";
  return Number(value).toLocaleString("en-GB");
}

function formatPct(value) {
  if (value == null) return "—";
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? "—" : `${parsed.toFixed(1)}%`;
}

function formatChange(value) {
  if (value == null) return null;
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) return null;
  const sign = parsed >= 0 ? "+" : "";
  return `${sign}${parsed.toFixed(1)}`;
}

// Party IDs used for swing key-pairing logic
const LAB_ID   = "7cf90c7d-1540-4737-b581-48613d4715c2";
const CON_ID   = "a4f20caf-ba89-4fb0-9ae3-313a7f937719";
const LD_ID    = "fcd69d3d-d445-428e-87e4-09adf95a4a1e";
const RUK_ID   = "a2b82e7c-5f8d-425d-a1b2-36db57c7268e";
const SNP_ID   = "a72cbc23-e79e-4868-9e70-61b3460acbc9";

// Ordered list of swing pairings to display (from_party_id, to_party_id, label)
const SWING_PAIRINGS = [
  { from: CON_ID, to: LAB_ID,  label: "Con \u2192 Labour" },
  { from: CON_ID, to: LD_ID,   label: "Con \u2192 Lib Dem" },
  { from: CON_ID, to: RUK_ID,  label: "Con \u2192 Reform" },
  { from: LAB_ID, to: LD_ID,   label: "Lab \u2192 Lib Dem" },
  { from: LAB_ID, to: SNP_ID,  label: "Lab \u2192 SNP" },
  { from: CON_ID, to: SNP_ID,  label: "Con \u2192 SNP" },
];

function formatSwing(value) {
  if (value == null) return null;
  const v = parseFloat(value);
  if (Number.isNaN(v)) return null;
  const sign = v >= 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
}

// Given the winning party_id, return the most relevant swing pairing to show in the header
function primaryPairing(winnerPartyId) {
  if (winnerPartyId === LAB_ID)  return { from: CON_ID, to: LAB_ID };
  if (winnerPartyId === LD_ID)   return { from: CON_ID, to: LD_ID };
  if (winnerPartyId === RUK_ID)  return { from: CON_ID, to: RUK_ID };
  if (winnerPartyId === SNP_ID)  return { from: LAB_ID, to: SNP_ID };
  return { from: CON_ID, to: LAB_ID }; // default
}

function SwingBar({ value, hex }) {
  const v = parseFloat(value) || 0;
  // Clamp display: treat ±50pp as 100% bar width
  const pct = Math.min(Math.abs(v) * 200, 100);
  const positive = v >= 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: positive ? (hex ?? "#3b82f6") : "#94a3b8",
            borderRadius: 4,
          }}
        />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, width: 60, textAlign: "right", color: positive ? "#15803d" : "#b91c1c" }}>
        {formatSwing(value) ?? "—"}
      </span>
    </div>
  );
}

function SwingPanel({ swings, nationals, partyMap, latestElectionId }) {
  // Only show swings for the notional 2019 → 2024 comparison
  // (all swings in the table are for this pair, so no filter needed)
  if (!swings || swings.length === 0) return null;

  // Index by from+to key
  const swingIndex = {};
  swings.forEach((s) => { swingIndex[`${s.from_party_id}:${s.to_party_id}`] = s.swing_value; });

  const nationalIndex = {};
  nationals.forEach((s) => { nationalIndex[`${s.from_party_id}:${s.to_party_id}`] = s.swing_value; });

  const rows = SWING_PAIRINGS.filter(({ from, to }) => `${from}:${to}` in swingIndex);
  if (rows.length === 0) return null;

  return (
    <div className="portal-record" style={{ marginTop: 16 }}>
      <div className="portal-data-section__header">
        <p className="portal-data-section__title">Swing (notional 2019 \u2192 2024)</p>
        <div className="portal-data-section__meta">
          Standard UK two-party swing formula
        </div>
      </div>
      <div style={{ padding: "8px 0" }}>
        {rows.map(({ from, to, label }) => {
          const key = `${from}:${to}`;
          const val = swingIndex[key];
          const natVal = nationalIndex[key];
          const toParty = partyMap[to];
          const diff = (val != null && natVal != null) ? val - natVal : null;
          return (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 13, color: "#374151" }}>
                  <span className="party-chip">
                    {toParty?.colour_hex && <PartyDot hex={toParty.colour_hex} />}
                    <span>{label}</span>
                  </span>
                </span>
                {diff != null && (
                  <span style={{ fontSize: 11, color: diff >= 0 ? "#15803d" : "#b91c1c" }}>
                    {diff >= 0 ? "+" : ""}{(diff * 100).toFixed(1)}% vs national
                  </span>
                )}
              </div>
              <SwingBar value={val} hex={toHexColor(toParty?.colour_hex)} />
              {natVal != null && (
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                  National average: {formatSwing(natVal)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PartyDot({ hex, size = 10 }) {
  return (
    <span
      className="party-dot"
      style={{
        width: size,
        height: size,
        background: toHexColor(hex) ?? "#94a3b8",
      }}
    />
  );
}

function TabBar({ active, onChange }) {
  return (
    <div className="portal-tabs" role="tablist" aria-label="Constituency detail sections">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
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

function VoteBar({ voteShare, hex, isWinner }) {
  const pct = Math.min(Math.max(parseFloat(voteShare) || 0, 0), 100);
  return (
    <div className="portal-stack-compact">
      <div className="portal-kpi-row">
        <div className="portal-kpi-bar">
          <div
            className="portal-kpi-bar__fill"
            style={{
              width: `${pct}%`,
              background: toHexColor(hex) ?? "#94a3b8",
            }}
          />
        </div>
        <span className="portal-kpi-value" style={{ width: 56 }}>
          {formatPct(voteShare)}
        </span>
        {isWinner && <span className="status-pill success">Won</span>}
      </div>
    </div>
  );
}

function groupByElection(results) {
  const grouped = new Map();
  results.forEach((row) => {
    const electionId = row.elections?.id ?? "unknown";
    if (!grouped.has(electionId)) {
      grouped.set(electionId, { election: row.elections, rows: [] });
    }
    grouped.get(electionId).rows.push(row);
  });
  return [...grouped.values()];
}

function ElectionHistoryTab({ results, swings, nationals, partyMap }) {
  const groups = useMemo(() => groupByElection(results), [results]);

  if (groups.length === 0) {
    return (
      <div className="portal-placeholder-panel">
        <p className="portal-placeholder-panel__title">No election history available</p>
        <p className="portal-placeholder-panel__body">
          Election results for this constituency have not been loaded yet.
        </p>
      </div>
    );
  }

  // Show swing panel after the most recent (first) election group
  const mostRecentId = groups[0]?.election?.id;

  return (
    <div className="portal-data-section">
      {groups.map(({ election, rows }, groupIndex) => {
        const winner = rows.find((row) => row.is_winner);
        return (
          <div key={election?.id ?? "unknown"}>
            <div className="portal-record">
              <div className="portal-data-section__header">
                <p className="portal-data-section__title">{election?.name ?? "Unknown election"}</p>
                <div className="portal-data-section__meta">
                  {formatDate(election?.election_date)}
                  {winner?.turnout != null ? ` • Turnout ${formatPct(winner.turnout)}` : ""}
                  {winner?.electorate ? ` • Electorate ${formatNumber(winner.electorate)}` : ""}
                </div>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Party</th>
                      <th>Votes</th>
                      <th>Change</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const change = formatChange(row.votes_change);
                      const changeColor =
                        row.votes_change > 0 ? "#15803d" : row.votes_change < 0 ? "#b91c1c" : "#64748b";
                      return (
                        <tr key={row.id}>
                          <td style={{ fontWeight: row.is_winner ? 700 : 500 }}>
                            {row.candidates
                              ? `${row.candidates.first_name} ${row.candidates.last_name}`
                              : "—"}
                          </td>
                          <td>
                            <span className="party-chip">
                              <PartyDot hex={row.parties?.colour_hex} />
                              <span>{row.parties?.short_name || row.parties?.name || "—"}</span>
                            </span>
                          </td>
                          <td>{formatNumber(row.votes)}</td>
                          <td style={{ color: changeColor }}>{change ?? "—"}</td>
                          <td>
                            <VoteBar
                              voteShare={row.vote_share}
                              hex={row.parties?.colour_hex}
                              isWinner={row.is_winner}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {winner?.majority != null && (
                <div className="portal-data-note">
                  Majority: <strong>{formatNumber(winner.majority)}</strong>
                </div>
              )}
            </div>
            {groupIndex === 0 && (
              <SwingPanel
                swings={swings}
                nationals={nationals}
                partyMap={partyMap}
                latestElectionId={mostRecentId}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ComparisonCard({ label, value, national }) {
  if (value == null) return null;

  const constituencyValue = parseFloat(value);
  const nationalValue = national ?? 0;
  const maxValue = Math.max(constituencyValue, nationalValue, 1);

  return (
    <div className="portal-comparison-card">
      <div className="portal-comparison-card__header">
        <strong>{label}</strong>
        <span className="portal-comparison-card__meta">
          {formatPct(constituencyValue)} vs {formatPct(nationalValue)} national
        </span>
      </div>
      <div className="portal-comparison-bars">
        <div className="portal-comparison-bar">
          <span className="portal-comparison-bar__label">Constituency</span>
          <div className="portal-comparison-bar__track primary">
            <div
              className="portal-comparison-bar__fill primary"
              style={{ width: `${Math.min((constituencyValue / maxValue) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div className="portal-comparison-bar">
          <span className="portal-comparison-bar__label muted">National</span>
          <div className="portal-comparison-bar__track secondary">
            <div
              className="portal-comparison-bar__fill secondary"
              style={{ width: `${Math.min((nationalValue / maxValue) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DemographicsTab({ demographics }) {
  if (demographics.length === 0) {
    return (
      <div className="portal-placeholder-panel">
        <p className="portal-placeholder-panel__title">No demographic data available</p>
        <p className="portal-placeholder-panel__body">
          Demographic comparison data has not been loaded for this constituency.
        </p>
      </div>
    );
  }

  const latest = demographics[0];

  return (
    <div className="portal-data-section">
      <div className="portal-summary-grid">
        <div className="portal-stat">
          <span className="portal-stat__label">Census year</span>
          <span className="portal-stat__value">{latest.census_year ?? "—"}</span>
          <span className="portal-stat__meta">
            {latest.is_estimated ? "Estimated dataset" : "Published dataset"}
          </span>
        </div>
        <div className="portal-stat">
          <span className="portal-stat__label">Population</span>
          <span className="portal-stat__value">{formatNumber(latest.population)}</span>
          <span className="portal-stat__meta">Latest available constituency population.</span>
        </div>
        <div className="portal-stat">
          <span className="portal-stat__label">Median age</span>
          <span className="portal-stat__value">{latest.median_age ?? "—"}</span>
          <span className="portal-stat__meta">Compared against England and Wales averages.</span>
        </div>
        <div className="portal-stat">
          <span className="portal-stat__label">Median household income</span>
          <span className="portal-stat__value">
            {latest.median_household_income != null
              ? `£${formatNumber(latest.median_household_income)}`
              : "—"}
          </span>
          <span className="portal-stat__meta">Household income reference measure.</span>
        </div>
      </div>
      <div className="portal-data-note">
        National averages shown here are approximate 2021 England and Wales census figures.
      </div>
      <div className="portal-comparison-list">
        {DEMOGRAPHIC_FIELDS.map((field) => (
          <ComparisonCard
            key={field.key}
            label={field.label}
            value={latest[field.key]}
            national={NATIONAL_AVERAGES[field.key]}
          />
        ))}
      </div>
    </div>
  );
}

function CandidatesTab({ results }) {
  const candidates = useMemo(() => {
    const grouped = new Map();

    results.forEach((row) => {
      const candidateId = row.candidates?.id;
      if (!candidateId) return;

      if (!grouped.has(candidateId)) {
        grouped.set(candidateId, {
          id: candidateId,
          name: `${row.candidates.first_name} ${row.candidates.last_name}`,
          contests: [],
        });
      }

      grouped.get(candidateId).contests.push({
        electionName: row.elections?.name ?? "—",
        electionDate: row.elections?.election_date ?? "",
        partyName: row.parties?.short_name || row.parties?.name || "—",
        partyHex: row.parties?.colour_hex,
        votes: row.votes,
        voteShare: row.vote_share,
        isWinner: row.is_winner,
      });
    });

    return [...grouped.values()]
      .map((candidate) => ({
        ...candidate,
        contests: candidate.contests.sort((a, b) => b.electionDate.localeCompare(a.electionDate)),
        bestShare: Math.max(...candidate.contests.map((contest) => parseFloat(contest.voteShare) || 0)),
        won: candidate.contests.some((contest) => contest.isWinner),
      }))
      .sort((a, b) => b.bestShare - a.bestShare);
  }, [results]);

  if (candidates.length === 0) {
    return (
      <div className="portal-placeholder-panel">
        <p className="portal-placeholder-panel__title">No candidate history available</p>
        <p className="portal-placeholder-panel__body">
          Candidate records for this constituency have not been loaded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="portal-record-list">
      {candidates.map((candidate) => (
        <div key={candidate.id} className="portal-record">
          <div className="portal-record__header">
            <div>
              <p className="portal-record__title">{candidate.name}</p>
              <p className="portal-record__meta">
                {candidate.contests.length} contest{candidate.contests.length !== 1 ? "s" : ""}
              </p>
            </div>
            {candidate.won && <span className="status-pill success">Elected</span>}
          </div>
          <div className="portal-record__rows">
            {candidate.contests.map((contest) => (
              <div
                key={`${candidate.id}-${contest.electionName}-${contest.electionDate}`}
                className="portal-record__row"
              >
                <span className="portal-record__meta">
                  {contest.electionDate ? new Date(contest.electionDate).getFullYear() : "—"}
                </span>
                <span className="party-chip">
                  <PartyDot hex={contest.partyHex} />
                  <span>{contest.partyName}</span>
                </span>
                <span className="portal-record__meta">{contest.electionName}</span>
                <span className="portal-record__meta">
                  {formatNumber(contest.votes)} votes ({formatPct(contest.voteShare)})
                </span>
                {contest.isWinner && <span className="status-pill success">Won</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Council party colour palette (local councils, not in parties table) ──────
const COUNCIL_PARTY_COLOURS = {
  "Reform UK":          "#12B6CF",
  "Liberal Democrat":   "#FAA61A",
  "Conservative":       "#0087DC",
  "Green":              "#02A95B",
  "Labour":             "#E4003B",
  "Restore Britain":    "#8B5CF6",
  "SNP":                "#FDF38E",
  "Plaid Cymru":        "#3F8428",
  "Independent":        "#6B7280",
};

function councilPartyHex(name) {
  if (!name) return "#94a3b8";
  return COUNCIL_PARTY_COLOURS[name] ?? "#94a3b8";
}

function ControlBadge({ controlType }) {
  if (!controlType) return null;
  const label = controlType === "majority" ? "Majority" :
                controlType === "minority" ? "Minority administration" :
                controlType === "coalition" ? "Coalition" :
                controlType === "noc" ? "No overall control" :
                controlType;
  const cls = controlType === "majority" ? "success" :
              controlType === "minority" ? "warning" :
              "secondary";
  return <span className={`status-pill ${cls}`}>{label}</span>;
}

function AlertBadge({ level }) {
  if (!level || level === "low") return null;
  return (
    <span className={`status-pill ${level === "high" ? "error" : "warning"}`}>
      {level === "high" ? "High alert" : "Medium alert"}
    </span>
  );
}

function CouncilAlertPanel({ alertReason }) {
  if (!alertReason) return null;
  return (
    <div style={{
      background: "#fef2f2",
      border: "1px solid #fecaca",
      borderLeft: "4px solid #dc2626",
      borderRadius: 6,
      padding: "12px 16px",
      marginBottom: 16,
    }}>
      <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#dc2626", marginBottom: 4 }}>
        Intelligence Alert
      </p>
      <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
        {alertReason}
      </p>
    </div>
  );
}

function CouncilCompositionTable({ composition, totalSeats }) {
  if (!composition || Object.keys(composition).length === 0) return null;
  const entries = Object.entries(composition).sort((a, b) => b[1] - a[1]);
  return (
    <div className="table-wrap" style={{ marginTop: 8 }}>
      <table className="table table--compact">
        <thead>
          <tr>
            <th>Party</th>
            <th>Seats</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([party, seats]) => {
            const hex = councilPartyHex(party);
            const pct = totalSeats > 0 ? ((seats / totalSeats) * 100).toFixed(1) : "—";
            return (
              <tr key={party}>
                <td>
                  <span className="party-chip">
                    <span className="party-dot" style={{ width: 10, height: 10, background: toHexColor(hex) ?? "#94a3b8" }} />
                    <span>{party}</span>
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>{seats}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden", minWidth: 60 }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: toHexColor(hex), borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, color: "#64748b", width: 40, textAlign: "right" }}>{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CouncilTimeline({ changes }) {
  if (!changes || changes.length === 0) return null;
  const sorted = [...changes].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div style={{ marginTop: 8 }}>
      {sorted.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6", marginTop: 3, flexShrink: 0 }} />
            {i < sorted.length - 1 && (
              <div style={{ width: 2, flex: 1, background: "#e2e8f0", marginTop: 2, minHeight: 20 }} />
            )}
          </div>
          <div style={{ paddingBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 2 }}>
              {formatDate(item.date)}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#1e293b", lineHeight: 1.5 }}>
              {item.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CouncilCard({ council }) {
  const majority = council.total_seats ? Math.floor(council.total_seats / 2) + 1 : null;
  const controllingSeats = council.composition?.[council.controlling_party] ?? null;
  const isHigh = council.alert_level === "high";
  const isMedium = council.alert_level === "medium";

  return (
    <div className="portal-record" style={{ marginBottom: 16 }}>
      {/* Header */}
      <div className="portal-data-section__header">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <p className="portal-data-section__title" style={{ marginBottom: 4 }}>
              {council.council_name}
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {council.council_type && (
                <span className="portal-data-section__meta">{council.council_type}</span>
              )}
              <ControlBadge controlType={council.control_type} />
              {(isHigh || isMedium) && <AlertBadge level={council.alert_level} />}
            </div>
          </div>
          {council.next_election_date && (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>Next election</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1e293b" }}>
                {formatDate(council.next_election_date)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Key stats */}
      <div className="portal-summary-grid" style={{ marginTop: 12, marginBottom: 16 }}>
        <div className="portal-stat">
          <span className="portal-stat__label">Largest party</span>
          <span className="portal-stat__value" style={{ fontSize: 18 }}>
            {council.controlling_party || "—"}
          </span>
          <span className="portal-stat__meta">
            {controllingSeats != null ? `${controllingSeats} seats` : ""}
          </span>
        </div>
        <div className="portal-stat">
          <span className="portal-stat__label">Total council seats</span>
          <span className="portal-stat__value" style={{ fontSize: 18 }}>
            {council.total_seats ?? "—"}
          </span>
          <span className="portal-stat__meta">
            {majority != null ? `Majority requires ${majority}` : ""}
          </span>
        </div>
        <div className="portal-stat">
          <span className="portal-stat__label">Last election</span>
          <span className="portal-stat__value" style={{ fontSize: 18 }}>
            {council.election_date ? new Date(council.election_date).getFullYear() : "—"}
          </span>
          <span className="portal-stat__meta">{formatDate(council.election_date)}</span>
        </div>
      </div>

      {/* Alert panel */}
      {(isHigh || isMedium) && <CouncilAlertPanel alertReason={council.alert_reason} />}

      {/* Political context */}
      {council.political_context && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Political context
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.65 }}>
            {council.political_context}
          </p>
        </div>
      )}

      {/* Composition */}
      {council.composition && Object.keys(council.composition).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Council composition
          </p>
          <CouncilCompositionTable composition={council.composition} totalSeats={council.total_seats} />
        </div>
      )}

      {/* Recent changes */}
      {council.recent_changes && council.recent_changes.length > 0 && (
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Recent changes
          </p>
          <CouncilTimeline changes={council.recent_changes} />
        </div>
      )}

      {/* Source */}
      {council.source_url && (
        <div className="portal-data-note" style={{ marginTop: 8 }}>
          Source: {council.source_url}
        </div>
      )}
    </div>
  );
}

function CouncilsTab({ councils }) {
  if (!councils || councils.length === 0) {
    return (
      <div className="portal-placeholder-panel">
        <p className="portal-placeholder-panel__title">No council data available</p>
        <p className="portal-placeholder-panel__body">
          Council intelligence for this constituency has not been loaded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="portal-data-section">
      {councils.map((council) => (
        <CouncilCard key={council.id} council={council} />
      ))}
    </div>
  );
}

function ConstituencyHeader({ constituency, electedWinner, currentStatus, swings, nationals }) {
  // Pick the most relevant swing to highlight in the header
  const keySwingStat = useMemo(() => {
    if (!swings || swings.length === 0) return null;
    const { from, to } = primaryPairing(electedWinner?.partyId);
    const match = swings.find((s) => s.from_party_id === from && s.to_party_id === to);
    if (!match) return null;
    const national = nationals?.find((s) => s.from_party_id === from && s.to_party_id === to);
    const pairing = SWING_PAIRINGS.find((p) => p.from === from && p.to === to);
    return {
      label: pairing?.label ?? "Swing",
      value: match.swing_value,
      national: national?.swing_value ?? null,
    };
  }, [swings, nationals, electedWinner]);

  return (
    <Card>
      <div className="portal-page-header">
        <div className="portal-page-header__content">
          <span className="portal-page-header__eyebrow">Constituency Intelligence</span>
          <h1 className="portal-page-header__title">{constituency.name}</h1>
          <p className="portal-page-header__subtitle">
            Current seat summary, election history, candidate record, and constituency reference data.
          </p>
        </div>
        <div className="portal-page-header__actions">
          <Link to="/portal/constituency" className="button ghost">
            Back to constituency search
          </Link>
        </div>
      </div>

      <div className="portal-summary-grid" style={{ marginTop: 24 }}>
        <div className="portal-stat">
          <span className="portal-stat__label">Elected in 2024</span>
          <span className="portal-stat__value">
            {electedWinner?.candidateName || "—"}
          </span>
          <span className="portal-stat__meta">
            <span className="party-chip">
              {electedWinner?.partyName ? <PartyDot hex={electedWinner.partyHex} size={12} /> : null}
              <span>{electedWinner?.partyName || "No winner loaded"}</span>
            </span>
          </span>
        </div>
        <div className="portal-stat">
          <span className="portal-stat__label">Current status</span>
          <span className="portal-stat__value">
            {currentStatus?.currentMemberName || electedWinner?.candidateName || "—"}
          </span>
          <span className="portal-stat__meta">
            <span className="party-chip">
              {(currentStatus?.currentPartyName || electedWinner?.partyName) ? (
                <PartyDot hex={currentStatus?.currentPartyHex || electedWinner?.partyHex} size={12} />
              ) : null}
              <span>{currentStatus?.currentPartyName || electedWinner?.partyName || "No current status loaded"}</span>
            </span>
          </span>
        </div>
        <div className="portal-stat">
          <span className="portal-stat__label">Majority</span>
          <span className="portal-stat__value">
            {electedWinner?.majority != null ? formatNumber(electedWinner.majority) : "—"}
          </span>
          <span className="portal-stat__meta">{electedWinner?.electionName || "Latest available election"}</span>
        </div>
        <div className="portal-stat">
          <span className="portal-stat__label">Region</span>
          <span className="portal-stat__value">{constituency.region || "—"}</span>
          <span className="portal-stat__meta">{constituency.country || "Country not listed"}</span>
        </div>
        <div className="portal-stat">
          <span className="portal-stat__label">Electorate</span>
          <span className="portal-stat__value">{formatNumber(constituency.electorate_current)}</span>
          <span className="portal-stat__meta">{constituency.constituency_type || "Constituency type not listed"}</span>
        </div>
      </div>

      {currentStatus?.differsFromElected && (
        <div className="portal-data-note" style={{ marginTop: 16 }}>
          Elected: <strong>{electedWinner?.partyName || "—"}</strong> | Current:{" "}
          <strong>{currentStatus.currentPartyName}</strong>
          {currentStatus.currentMemberName ? ` (${currentStatus.currentMemberName})` : ""}
          {currentStatus.effectiveDate ? ` • updated ${formatDate(currentStatus.effectiveDate)}` : ""}
        </div>
      )}

      {keySwingStat && (
        <div className="portal-data-note" style={{ marginTop: 16 }}>
          Key swing ({keySwingStat.label}):{" "}
          <strong style={{ color: keySwingStat.value >= 0 ? "#15803d" : "#b91c1c" }}>
            {formatSwing(keySwingStat.value) ?? "—"}
          </strong>
          {keySwingStat.national != null
            ? ` • National avg ${formatSwing(keySwingStat.national)}`
            : ""}
        </div>
      )}
    </Card>
  );
}

export default function ConstituencyDetail() {
  const { onsCode } = useParams();
  const [constituency, setConstituency] = useState(null);
  const [results, setResults] = useState([]);
  const [demographics, setDemographics] = useState([]);
  const [swings, setSwings] = useState([]);
  const [nationals, setNationals] = useState([]);
  const [councils, setCouncils] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("history");

  useEffect(() => {
    if (!onsCode) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const nextConstituency = await getConstituency(onsCode);
        if (cancelled) return;
        setConstituency(nextConstituency);

        const [nextResults, nextDemographics, nextSwings, nextCouncils] = await Promise.all([
          getConstituencyResults(nextConstituency.id),
          getConstituencyDemographics(nextConstituency.id),
          getConstituencySwings(nextConstituency.id),
          getCouncilData(nextConstituency.id),
        ]);

        if (cancelled) return;
        setResults(nextResults);
        setDemographics(nextDemographics);
        setSwings(nextSwings.swings);
        setNationals(nextSwings.nationals);
        setCouncils(nextCouncils);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load constituency.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [onsCode]);

  // Build a party id → party object lookup from results (covers all parties in this constituency)
  const partyMap = useMemo(() => {
    const map = {};
    results.forEach((row) => {
      if (row.parties?.id) map[row.parties.id] = row.parties;
    });
    return map;
  }, [results]);

  const electedWinner = useMemo(() => {
    if (!results.length) return null;
    const sorted = [...results]
      .filter((row) => row.elections?.election_type === "general")
      .sort((a, b) => (b.elections?.election_date ?? "").localeCompare(a.elections?.election_date ?? ""));
    const pool = sorted.length > 0 ? sorted : [...results].sort((a, b) =>
      (b.elections?.election_date ?? "").localeCompare(a.elections?.election_date ?? "")
    );
    const winner = pool.find((row) => row.is_winner);
    if (!winner) return null;

    return {
      candidateName: winner.candidates
        ? `${winner.candidates.first_name} ${winner.candidates.last_name}`
        : null,
      partyName: winner.parties?.short_name || winner.parties?.name,
      partyHex: winner.parties?.colour_hex,
      partyId: winner.parties?.id,
      majority: winner.majority,
      electionName: winner.elections?.name,
    };
  }, [results]);

  const currentStatus = useMemo(() => {
    if (!constituency) return null;
    return getCurrentStatus(constituency.name, electedWinner?.partyName || "");
  }, [constituency, electedWinner]);

  if (loading) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Constituency Intelligence</span>
              <h1 className="portal-page-header__title">Loading constituency detail</h1>
              <p className="portal-page-header__subtitle">
                Preparing the current constituency summary and reference data.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (error || !constituency) {
    return (
      <div className="page stack">
        <Card>
          <div className="status error" role="alert">
            {error || "Constituency not found."}
          </div>
          <div className="portal-page-header__actions" style={{ marginTop: 16 }}>
            <Link to="/portal/constituency" className="button ghost">
              Back to constituency search
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page stack">
      <ConstituencyHeader
        constituency={constituency}
        electedWinner={electedWinner}
        currentStatus={currentStatus}
        swings={swings}
        nationals={nationals}
      />

      <Card>
        <TabBar active={activeTab} onChange={setActiveTab} />
        {activeTab === "history" && (
          <ElectionHistoryTab
            results={results}
            swings={swings}
            nationals={nationals}
            partyMap={partyMap}
          />
        )}
        {activeTab === "demographics" && <DemographicsTab demographics={demographics} />}
        {activeTab === "candidates" && <CandidatesTab results={results} />}
        {activeTab === "councils" && <CouncilsTab councils={councils} />}
      </Card>
    </div>
  );
}
