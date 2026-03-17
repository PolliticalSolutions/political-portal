import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../../components/Card.jsx";
import DataProvenancePanel from "../../../components/DataProvenancePanel.jsx";
import { byElectionAlerts } from "../../../data/byElectionAlerts.js";
import { getIntelligenceMetadata } from "../../../lib/intelligenceMetadataApi.js";
import { getByElectionWatchSeats, getLatestElectionWinners } from "../constituency/constituencyApi.js";
import { getCurrentStatus } from "../constituency/constituencyPresentation.js";

const AnalyticsChoroplethMapClient = lazy(
  () => import("../constituency/AnalyticsChoroplethMapClient.jsx")
);

function getRiskFill(score) {
  const numericScore = Number(score) || 0;
  if (numericScore >= 9) return "#b91c1c";
  if (numericScore >= 8.25) return "#dc2626";
  return "#f97316";
}

function getRiskFactorLabel(seat) {
  const factors = [
    { key: "majority_factor", label: "Majority exposure", value: Number(seat.majority_factor) || 0 },
    {
      key: "council_instability_factor",
      label: "Council instability",
      value: Number(seat.council_instability_factor) || 0,
    },
    {
      key: "defection_risk_factor",
      label: "Defection and member movement",
      value: Number(seat.defection_risk_factor) || 0,
    },
    {
      key: "polling_trend_factor",
      label: "Polling and trend pressure",
      value: Number(seat.polling_trend_factor) || 0,
    },
  ].sort((a, b) => b.value - a.value);

  return factors[0]?.value > 0 ? factors[0].label : "Risk model summary unavailable";
}

function RiskBadge({ level }) {
  const palette = {
    "Very High": "#b91c1c",
    High: "#dc2626",
    Medium: "#f97316",
  };

  return (
    <span className="status-pill" style={{ background: palette[level] || "#64748b", color: "#ffffff" }}>
      {level || "Unrated"}
    </span>
  );
}

function AlertList({ items }) {
  if (!items.length) {
    return <span className="portal-current-status__meta">No constituency-specific alert recorded.</span>;
  }

  return (
    <div className="portal-stack-compact">
      {items.map((alert, index) => (
        <span key={`${alert.alertType}-${index}`} className="portal-current-status__meta">
          {alert.summary}
        </span>
      ))}
    </div>
  );
}

export default function ByElectionWatchPage() {
  const [seats, setSeats] = useState([]);
  const [winnerMap, setWinnerMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [watchSeats, electionData] = await Promise.all([
          getByElectionWatchSeats(),
          getLatestElectionWinners(),
        ]);
        if (cancelled) return;

        const nextWinnerMap = {};
        electionData.winners.forEach((winner) => {
          if (!winner.constituencies?.id) return;
          nextWinnerMap[winner.constituencies.id] = winner;
        });

        setSeats(watchSeats);
        setWinnerMap(nextWinnerMap);
        const nextMetadata = await getIntelligenceMetadata({
          modelKey: "byElectionRisk",
        });
        if (!cancelled) setMetadata(nextMetadata);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load by-election watch data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const enrichedSeats = useMemo(() => {
    return seats.map((seat) => {
      const winner = winnerMap[seat.constituency_id];
      const constituency = winner?.constituencies;
      const currentStatus = constituency
        ? getCurrentStatus(constituency.name, winner?.parties?.name || winner?.parties?.short_name || "")
        : null;
      const matchingAlerts = byElectionAlerts.filter(
        (alert) => alert.constituencyName && alert.constituencyName === constituency?.name
      );

      return {
        ...seat,
        winner,
        constituency,
        currentStatus,
        matchingAlerts,
        primaryRiskFactor: getRiskFactorLabel(seat),
      };
    });
  }, [seats, winnerMap]);

  const mapSeatsByOnsCode = useMemo(() => {
    const nextMap = {};
    enrichedSeats.forEach((seat) => {
      const onsCode = seat.constituency?.ons_code?.toUpperCase();
      if (!onsCode) return;
      nextMap[onsCode] = {
        fill: getRiskFill(seat.risk_score),
        stroke: "#ffffff",
        strokeWidth: 0.45,
        title: `${seat.constituency.name}: ${seat.risk_level} by-election risk (${Number(
          seat.risk_score
        ).toFixed(1)}/10)`,
      };
    });
    return nextMap;
  }, [enrichedSeats]);

  if (loading) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Analytics Engine</span>
              <h1 className="portal-page-header__title">Loading by-election watch…</h1>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (error || enrichedSeats.length === 0) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Analytics Engine</span>
              <h1 className="portal-page-header__title">By-Election Watch</h1>
              <p className="portal-page-header__subtitle">
                Monitor constituencies with the highest modelled risk of a near-term by-election event.
              </p>
            </div>
            <div className="portal-page-header__actions">
              <Link to="/portal/constituency" className="button ghost">
                Constituencies
              </Link>
            </div>
          </div>
          {error && <div className="status error" role="alert">{error}</div>}
          {!error && (
            <div className="portal-placeholder-panel">
              <p className="portal-placeholder-panel__title">No by-election watch data yet</p>
              <p className="portal-placeholder-panel__body">
                Run <code>python scripts/calculate_by_election_risk.py</code> after creating the{" "}
                <code>by_election_risk</code> table in Supabase.
              </p>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Analytics Engine</span>
            <h1 className="portal-page-header__title">By-Election Watch</h1>
            <p className="portal-page-header__subtitle">
              Seats with a modelled by-election risk score above 7, combining majority pressure, council
              instability, member movement, and wider political trend indicators.
            </p>
          </div>
          <div className="portal-page-header__actions">
            <Link to="/portal/constituency" className="button ghost">
              Constituencies
            </Link>
          </div>
        </div>

        <div className="portal-summary-grid" style={{ marginTop: 24 }}>
          <div className="portal-stat">
            <span className="portal-stat__label">Seats on watch</span>
            <span className="portal-stat__value">{enrichedSeats.length}</span>
            <span className="portal-stat__meta">Risk score above 7.0</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Highest model score</span>
            <span className="portal-stat__value">
              {Math.max(...enrichedSeats.map((seat) => Number(seat.risk_score) || 0)).toFixed(1)}
            </span>
            <span className="portal-stat__meta">Across all watched seats</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Next scheduled vote date</span>
            <span className="portal-stat__value">Not available</span>
            <span className="portal-stat__meta">No scheduled election trigger recorded</span>
          </div>
        </div>
      </Card>

      <DataProvenancePanel
        metadata={metadata}
        fallbackCopy="By-election watch provenance will appear here when the model and source links are recorded in the metadata layer."
      />

      <div className="portal-split-grid">
        <Card title="High-risk seats map">
          <div className="portal-map-shell">
            <div className="portal-map-frame">
              <Suspense fallback={<div className="portal-map-fallback" />}>
                <AnalyticsChoroplethMapClient
                  ariaLabel="By-election risk map"
                  seatsByOnsCode={mapSeatsByOnsCode}
                  defaultFill="#e5e7eb"
                />
              </Suspense>
            </div>
            <div className="portal-legend">
              <span className="portal-legend__title">Risk intensity</span>
              <div className="portal-legend__items">
                <span className="portal-legend__item">
                  <span className="portal-legend__swatch" style={{ background: "#f97316" }} />
                  Elevated
                </span>
                <span className="portal-legend__item">
                  <span className="portal-legend__swatch" style={{ background: "#dc2626" }} />
                  High
                </span>
                <span className="portal-legend__item">
                  <span className="portal-legend__swatch" style={{ background: "#b91c1c" }} />
                  Acute
                </span>
                <span className="portal-legend__item">
                  <span className="portal-legend__swatch" style={{ background: "#e5e7eb" }} />
                  Other seats
                </span>
              </div>
            </div>
          </div>
        </Card>

        <div className="portal-kpi-list">
          <Card title="Operational guidance">
            <div className="portal-data-note" style={{ marginTop: 0 }}>
              Use this page as a live watchlist rather than a forecast. It identifies seats where a by-election
              could plausibly be triggered by member movement, local instability, or wider political deterioration,
              and gives the campaign team a ranked list for contingency planning.
            </div>
          </Card>
        </div>
      </div>

      <Card title={`Watched seats (${enrichedSeats.length})`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Constituency</th>
                <th>Risk level</th>
                <th>Current MP</th>
                <th>Majority</th>
                <th>Primary risk factor</th>
                <th>Active political alerts</th>
              </tr>
            </thead>
            <tbody>
              {enrichedSeats.map((seat) => {
                const currentHolderName =
                  seat.currentStatus?.currentMemberName ||
                  (seat.winner?.candidates
                    ? `${seat.winner.candidates.first_name} ${seat.winner.candidates.last_name}`
                    : "Current holder not available");

                return (
                  <tr key={seat.constituency_id}>
                    <td>
                      {seat.constituency ? (
                        <Link className="table-link" to={`/portal/constituency/${seat.constituency.ons_code}`}>
                          {seat.constituency.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <div className="portal-stack-compact">
                        <RiskBadge level={seat.risk_level} />
                        <span className="portal-current-status__meta">
                          {Number(seat.risk_score).toFixed(1)}/10
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="portal-stack-compact">
                        <span>{currentHolderName}</span>
                        {seat.currentStatus?.differsFromElected && (
                          <span className="portal-current-status__meta">
                            Current party: {seat.currentStatus.currentPartyName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{seat.winner?.majority != null ? seat.winner.majority.toLocaleString("en-GB") : "—"}</td>
                    <td>
                      <div className="portal-stack-compact">
                        <span>{seat.primaryRiskFactor}</span>
                        <span className="portal-current-status__meta">{seat.risk_summary || "—"}</span>
                      </div>
                    </td>
                    <td>
                      <AlertList items={seat.matchingAlerts} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
