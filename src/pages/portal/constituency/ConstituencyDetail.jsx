import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "../../../components/Card.jsx";
import {
  getConstituency,
  getConstituencyDemographics,
  getConstituencyResults,
} from "./constituencyApi.js";

// Approximate 2021 England & Wales census national averages.
// Used for comparison bars in the Demographics tab.
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function toHexColor(hex) {
  if (!hex) return null;
  return hex.startsWith("#") ? hex : `#${hex}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function formatNumber(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-GB");
}

function formatPct(n) {
  if (n == null) return "—";
  const v = parseFloat(n);
  return isNaN(v) ? "—" : `${v.toFixed(1)}%`;
}

function formatChange(n) {
  if (n == null) return null;
  const v = parseFloat(n);
  if (isNaN(v)) return null;
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}`;
}

// ─── Tab navigation ─────────────────────────────────────────────────────────

const TABS = [
  { id: "history", label: "Election History" },
  { id: "demographics", label: "Demographics" },
  { id: "candidates", label: "Candidates" },
  { id: "councils", label: "Local Councils" },
];

function TabBar({ active, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        borderBottom: "2px solid #e2e8f0",
        marginBottom: 20,
        gap: 0,
        overflowX: "auto",
      }}
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          style={{
            background: "none",
            border: "none",
            padding: "10px 20px",
            fontWeight: active === tab.id ? 700 : 400,
            color: active === tab.id ? "#1e293b" : "#64748b",
            borderBottom: active === tab.id ? "2px solid #1e293b" : "2px solid transparent",
            cursor: "pointer",
            marginBottom: -2,
            fontSize: 14,
            whiteSpace: "nowrap",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Vote share bar ──────────────────────────────────────────────────────────

function VoteBar({ voteShare, hex, isWinner }) {
  const pct = Math.min(Math.max(parseFloat(voteShare) || 0, 0), 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 120,
          height: 8,
          background: "#e2e8f0",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: toHexColor(hex) ?? "#94a3b8",
            borderRadius: 4,
          }}
        />
      </div>
      <span style={{ fontSize: 12, color: "#64748b" }}>{formatPct(voteShare)}</span>
      {isWinner && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            background: "#dcfce7",
            color: "#15803d",
            padding: "1px 6px",
            borderRadius: 4,
          }}
        >
          Won
        </span>
      )}
    </div>
  );
}

// ─── Election History tab ────────────────────────────────────────────────────

function groupByElection(results) {
  const map = new Map();
  results.forEach((r) => {
    const eid = r.elections?.id ?? "unknown";
    if (!map.has(eid)) {
      map.set(eid, { election: r.elections, rows: [] });
    }
    map.get(eid).rows.push(r);
  });
  // already sorted by date desc from the API
  return [...map.values()];
}

function ElectionHistoryTab({ results }) {
  const groups = useMemo(() => groupByElection(results), [results]);

  if (groups.length === 0) {
    return <p className="muted">No election results found for this constituency.</p>;
  }

  return (
    <div className="stack" style={{ gap: 24 }}>
      {groups.map(({ election, rows }) => {
        const winner = rows.find((r) => r.is_winner);
        return (
          <div key={election?.id ?? "unknown"}>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{election?.name ?? "Unknown election"}</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>{formatDate(election?.election_date)}</div>
              {winner?.turnout != null && (
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  Turnout: {formatPct(winner.turnout)}
                  {winner.electorate ? ` (electorate: ${formatNumber(winner.electorate)})` : ""}
                </div>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                    <th style={{ padding: "5px 8px" }}>Candidate</th>
                    <th style={{ padding: "5px 8px" }}>Party</th>
                    <th style={{ padding: "5px 8px", textAlign: "right" }}>Votes</th>
                    <th style={{ padding: "5px 8px", textAlign: "right" }}>Change</th>
                    <th style={{ padding: "5px 8px" }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const change = formatChange(r.votes_change);
                    const changeColor =
                      r.votes_change > 0 ? "#15803d" : r.votes_change < 0 ? "#b91c1c" : "#64748b";
                    return (
                      <tr
                        key={r.id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: r.is_winner ? "#f0fdf4" : "transparent",
                        }}
                      >
                        <td style={{ padding: "5px 8px", fontWeight: r.is_winner ? 600 : 400 }}>
                          {r.candidates
                            ? `${r.candidates.first_name} ${r.candidates.last_name}`
                            : "—"}
                        </td>
                        <td style={{ padding: "5px 8px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                background: toHexColor(r.parties?.colour_hex) ?? "#94a3b8",
                                display: "inline-block",
                                flexShrink: 0,
                              }}
                            />
                            {r.parties?.short_name || r.parties?.name || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "right" }}>
                          {formatNumber(r.votes)}
                        </td>
                        <td style={{ padding: "5px 8px", textAlign: "right", color: changeColor }}>
                          {change ?? "—"}
                        </td>
                        <td style={{ padding: "5px 8px" }}>
                          <VoteBar
                            voteShare={r.vote_share}
                            hex={r.parties?.colour_hex}
                            isWinner={r.is_winner}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {winner?.majority != null && (
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>
                  Majority: <strong>{formatNumber(winner.majority)}</strong>
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Demographics tab ────────────────────────────────────────────────────────

const DEMO_FIELDS = [
  { key: "pct_owner_occupied", label: "Owner occupied", pct: true },
  { key: "pct_social_rented", label: "Social rented", pct: true },
  { key: "pct_private_rented", label: "Private rented", pct: true },
  { key: "pct_degree_qualified", label: "Degree qualified", pct: true },
  { key: "pct_no_qualifications", label: "No qualifications", pct: true },
  { key: "pct_white_british", label: "White British", pct: true },
  { key: "pct_born_uk", label: "Born in UK", pct: true },
  { key: "pct_christian", label: "Christian", pct: true },
  { key: "pct_employed", label: "Employed", pct: true },
  { key: "pct_self_employed", label: "Self-employed", pct: true },
];

function ComparisonBar({ value, national, label }) {
  if (value == null) return null;
  const v = parseFloat(value);
  const n = national ?? 0;
  const maxVal = Math.max(v, n, 1);
  const barScale = 180; // px

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: "#64748b", fontSize: 12 }}>
          {formatPct(v)} vs {formatPct(n)} national
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 70, fontSize: 11, color: "#374151" }}>Constituency</span>
          <div style={{ height: 8, background: "#dbeafe", borderRadius: 4, overflow: "hidden", width: barScale }}>
            <div
              style={{
                width: `${Math.min((v / maxVal) * 100, 100)}%`,
                height: "100%",
                background: "#3b82f6",
                borderRadius: 4,
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 70, fontSize: 11, color: "#94a3b8" }}>National</span>
          <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", width: barScale }}>
            <div
              style={{
                width: `${Math.min((n / maxVal) * 100, 100)}%`,
                height: "100%",
                background: "#94a3b8",
                borderRadius: 4,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DemographicsTab({ demographics }) {
  if (demographics.length === 0) {
    return <p className="muted">No demographic data found for this constituency.</p>;
  }

  const latest = demographics[0];

  return (
    <div>
      <div style={{ marginBottom: 16, fontSize: 13, color: "#64748b" }}>
        Census year: <strong>{latest.census_year ?? "—"}</strong>
        {latest.is_estimated && (
          <span
            style={{
              marginLeft: 8,
              fontSize: 11,
              background: "#fef3c7",
              color: "#92400e",
              padding: "1px 6px",
              borderRadius: 4,
            }}
          >
            Estimated
          </span>
        )}
        <span style={{ marginLeft: 16 }}>
          Population: <strong>{formatNumber(latest.population)}</strong>
        </span>
        {latest.median_age != null && (
          <span style={{ marginLeft: 16 }}>
            Median age: <strong>{latest.median_age}</strong>
          </span>
        )}
        {latest.median_household_income != null && (
          <span style={{ marginLeft: 16 }}>
            Median household income: <strong>£{formatNumber(latest.median_household_income)}</strong>
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
        National averages shown are approximate 2021 England &amp; Wales census figures.
      </p>
      {DEMO_FIELDS.map((f) => (
        <ComparisonBar
          key={f.key}
          label={f.label}
          value={latest[f.key]}
          national={NATIONAL_AVERAGES[f.key]}
        />
      ))}
    </div>
  );
}

// ─── Candidates tab ──────────────────────────────────────────────────────────

function CandidatesTab({ results }) {
  const candidates = useMemo(() => {
    const map = new Map();
    results.forEach((r) => {
      const cid = r.candidates?.id;
      if (!cid) return;
      if (!map.has(cid)) {
        map.set(cid, {
          id: cid,
          name: `${r.candidates.first_name} ${r.candidates.last_name}`,
          contests: [],
        });
      }
      map.get(cid).contests.push({
        electionName: r.elections?.name ?? "—",
        electionDate: r.elections?.election_date ?? "",
        partyName: r.parties?.short_name || r.parties?.name || "—",
        partyHex: r.parties?.colour_hex,
        votes: r.votes,
        voteShare: r.vote_share,
        isWinner: r.is_winner,
      });
    });

    return [...map.values()]
      .map((c) => ({
        ...c,
        // Sort this candidate's contests by date desc
        contests: c.contests.sort((a, b) => b.electionDate.localeCompare(a.electionDate)),
        // Best vote share
        bestShare: Math.max(...c.contests.map((x) => parseFloat(x.voteShare) || 0)),
        won: c.contests.some((x) => x.isWinner),
      }))
      .sort((a, b) => b.bestShare - a.bestShare);
  }, [results]);

  if (candidates.length === 0) {
    return <p className="muted">No candidate data found for this constituency.</p>;
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {candidates.map((candidate) => (
        <div
          key={candidate.id}
          style={{
            padding: "12px 16px",
            background: "#f8fafc",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{candidate.name}</span>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {candidate.won && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: "#dcfce7",
                    color: "#15803d",
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  Elected
                </span>
              )}
              <span style={{ fontSize: 12, color: "#64748b" }}>
                {candidate.contests.length} contest{candidate.contests.length !== 1 ? "s" : ""}
              </span>
            </span>
          </div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {candidate.contests.map((contest, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ color: "#64748b", minWidth: 90 }}>
                  {contest.electionDate
                    ? new Date(contest.electionDate).getFullYear()
                    : "—"}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: toHexColor(contest.partyHex) ?? "#94a3b8",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  {contest.partyName}
                </span>
                <span style={{ color: "#64748b" }}>
                  {formatNumber(contest.votes)} votes ({formatPct(contest.voteShare)})
                </span>
                {contest.isWinner && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      background: "#dcfce7",
                      color: "#15803d",
                      padding: "1px 5px",
                      borderRadius: 4,
                    }}
                  >
                    Won
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Local Councils tab ──────────────────────────────────────────────────────

function CouncilsTab() {
  return (
    <div
      style={{
        padding: "32px 24px",
        textAlign: "center",
        background: "#f8fafc",
        borderRadius: 8,
        border: "1px dashed #cbd5e1",
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>🏛️</div>
      <p style={{ margin: 0, fontWeight: 600, color: "#374151" }}>Council data coming soon</p>
      <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
        Local authority and council data for this constituency will appear here in a future update.
      </p>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function ConstituencyHeader({ constituency, currentWinner }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 22 }}>{constituency.name}</h1>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13, color: "#64748b" }}>
            {constituency.region && <span>Region: <strong style={{ color: "#374151" }}>{constituency.region}</strong></span>}
            {constituency.country && <span>Country: <strong style={{ color: "#374151" }}>{constituency.country}</strong></span>}
            {constituency.constituency_type && (
              <span>Type: <strong style={{ color: "#374151" }}>{constituency.constituency_type}</strong></span>
            )}
            {constituency.electorate_current != null && (
              <span>Electorate: <strong style={{ color: "#374151" }}>{formatNumber(constituency.electorate_current)}</strong></span>
            )}
          </div>
        </div>
        <Link to="/portal/constituency" className="button ghost" style={{ whiteSpace: "nowrap" }}>
          ← Back to search
        </Link>
      </div>

      {currentWinner && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            fontSize: 13,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: toHexColor(currentWinner.partyHex) ?? "#94a3b8",
                flexShrink: 0,
              }}
            />
            <span>
              <strong>{currentWinner.candidateName}</strong>
              {" — "}
              {currentWinner.partyName}
            </span>
          </div>
          {currentWinner.majority != null && (
            <span style={{ color: "#64748b" }}>
              Majority: <strong style={{ color: "#374151" }}>{formatNumber(currentWinner.majority)}</strong>
            </span>
          )}
          {currentWinner.electionName && (
            <span style={{ color: "#94a3b8", fontSize: 12 }}>{currentWinner.electionName}</span>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ConstituencyDetail() {
  const { onsCode } = useParams();
  const [constituency, setConstituency] = useState(null);
  const [results, setResults] = useState([]);
  const [demographics, setDemographics] = useState([]);
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
        const c = await getConstituency(onsCode);
        if (cancelled) return;
        setConstituency(c);

        const [r, d] = await Promise.all([
          getConstituencyResults(c.id),
          getConstituencyDemographics(c.id),
        ]);
        if (cancelled) return;
        setResults(r);
        setDemographics(d);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load constituency.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [onsCode]);

  const currentWinner = useMemo(() => {
    if (!results.length) return null;
    // Results are sorted date desc — first winner is the most recent
    const winner = results.find((r) => r.is_winner);
    if (!winner) return null;
    return {
      candidateName: winner.candidates
        ? `${winner.candidates.first_name} ${winner.candidates.last_name}`
        : null,
      partyName: winner.parties?.short_name || winner.parties?.name,
      partyHex: winner.parties?.colour_hex,
      majority: winner.majority,
      electionName: winner.elections?.name,
    };
  }, [results]);

  if (loading) {
    return (
      <div className="page stack">
        <Card>
          <p className="muted">Loading constituency data...</p>
        </Card>
      </div>
    );
  }

  if (error || !constituency) {
    return (
      <div className="page stack">
        <Card>
          <p role="alert" style={{ color: "#b91c1c" }}>
            {error || "Constituency not found."}
          </p>
          <Link to="/portal/constituency" className="button ghost" style={{ marginTop: 12, display: "inline-block" }}>
            ← Back to search
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="page stack">
      <ConstituencyHeader constituency={constituency} currentWinner={currentWinner} />

      <Card>
        <TabBar active={activeTab} onChange={setActiveTab} />
        {activeTab === "history" && <ElectionHistoryTab results={results} />}
        {activeTab === "demographics" && <DemographicsTab demographics={demographics} />}
        {activeTab === "candidates" && <CandidatesTab results={results} />}
        {activeTab === "councils" && <CouncilsTab />}
      </Card>
    </div>
  );
}
