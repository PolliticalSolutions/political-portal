import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Card from "../../../components/Card.jsx";
import {
  getConstituency,
  getConstituencyDemographics,
  getConstituencyResults,
} from "./constituencyApi.js";

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

function ElectionHistoryTab({ results }) {
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

  return (
    <div className="portal-data-section">
      {groups.map(({ election, rows }) => {
        const winner = rows.find((row) => row.is_winner);
        return (
          <div key={election?.id ?? "unknown"} className="portal-record">
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

function CouncilsTab() {
  return (
    <div className="portal-placeholder-panel">
      <p className="portal-placeholder-panel__title">Council data</p>
      <p className="portal-placeholder-panel__body">
        Council data will be available in a future release.
      </p>
    </div>
  );
}

function ConstituencyHeader({ constituency, currentWinner }) {
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
          <span className="portal-stat__label">Current winner</span>
          <span className="portal-stat__value">
            {currentWinner?.candidateName || "—"}
          </span>
          <span className="portal-stat__meta">
            <span className="party-chip">
              {currentWinner?.partyName ? <PartyDot hex={currentWinner.partyHex} size={12} /> : null}
              <span>{currentWinner?.partyName || "No winner loaded"}</span>
            </span>
          </span>
        </div>
        <div className="portal-stat">
          <span className="portal-stat__label">Majority</span>
          <span className="portal-stat__value">
            {currentWinner?.majority != null ? formatNumber(currentWinner.majority) : "—"}
          </span>
          <span className="portal-stat__meta">{currentWinner?.electionName || "Latest available election"}</span>
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
    </Card>
  );
}

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
        const nextConstituency = await getConstituency(onsCode);
        if (cancelled) return;
        setConstituency(nextConstituency);

        const [nextResults, nextDemographics] = await Promise.all([
          getConstituencyResults(nextConstituency.id),
          getConstituencyDemographics(nextConstituency.id),
        ]);

        if (cancelled) return;
        setResults(nextResults);
        setDemographics(nextDemographics);
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

  const currentWinner = useMemo(() => {
    if (!results.length) return null;
    const winner = results.find((row) => row.is_winner);
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
