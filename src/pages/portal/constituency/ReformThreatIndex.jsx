import { lazy, Suspense, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import Card from "../../../components/Card.jsx";
import DataProvenancePanel from "../../../components/DataProvenancePanel.jsx";
import ModelConfidenceBadge from "../../../components/ModelConfidenceBadge.jsx";
import ScoringMethodologyPanel from "../../../components/ScoringMethodologyPanel.jsx";
import ThreatMethodologyDisclosure from "../../../components/ThreatMethodologyDisclosure.jsx";
import { getScoringModel } from "../../../config/scoringModels.js";
import { getIntelligenceMetadata } from "../../../lib/intelligenceMetadataApi.js";
import { getModelConfidence } from "../../../lib/modelConfidence.js";
import { mpDefections } from "../../../data/currentMPs.js";
import { getReformThreatIndex, getLatestElectionWinners } from "./constituencyApi.js";

const AnalyticsChoroplethMapClient = lazy(() => import("./AnalyticsChoroplethMapClient.jsx"));

function ScoreBar({ value, max = 10 }) {
  const pct = Math.min((Number(value) / max) * 100, 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "#12B6CF", borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, width: 32, textAlign: "right" }}>
        {Number(value).toFixed(1)}
      </span>
    </div>
  );
}

function getThreatFill(score) {
  const numericScore = Number(score) || 0;
  if (numericScore >= 8.5) return "#dc2626";
  if (numericScore >= 7) return "#f97316";
  return "#f59e0b";
}

function getThreatBand(score) {
  const numericScore = Number(score) || 0;
  if (numericScore >= 8.5) return "Extreme";
  if (numericScore >= 7) return "High";
  return "Moderate";
}

export default function ReformThreatIndex() {
  const model = getScoringModel("reformThreat");

  const { data: threats = [], isLoading: threatsLoading, isError: threatsError } = useQuery({
    queryKey: ["reformThreatIndex"],
    queryFn: getReformThreatIndex,
  });

  const { data: electionData, isLoading: electionLoading } = useQuery({
    queryKey: ["latestElectionWinners"],
    queryFn: getLatestElectionWinners,
  });

  const { data: metadata = null } = useQuery({
    queryKey: ["intelligenceMetadata", "reformThreat"],
    queryFn: () => getIntelligenceMetadata({ modelKey: "reformThreat" }),
    staleTime: Infinity,
  });

  const loading = threatsLoading || electionLoading;
  const error = threatsError ? "Failed to load Reform threat index." : "";

  const constituencyMap = useMemo(() => {
    const map = {};
    (electionData?.winners ?? []).forEach((w) => {
      if (w.constituencies) map[w.constituencies.id] = w.constituencies;
    });
    return map;
  }, [electionData]);

  const stats = useMemo(() => {
    if (!threats.length) return null;
    const avgShare = threats.reduce((s, t) => s + Number(t.ruk_2024_share), 0) / threats.length;
    const avgSwing = threats.reduce((s, t) => s + Number(t.con_ruk_swing), 0) / threats.length;
    const avgMaj = threats.reduce((s, t) => s + Number(t.con_majority), 0) / threats.length;
    const extreme = threats.filter((seat) => Number(seat.threat_score) >= 8.5).length;
    const high = threats.filter(
      (seat) => Number(seat.threat_score) >= 7 && Number(seat.threat_score) < 8.5
    ).length;
    return { avgShare, avgSwing, avgMaj, extreme, high };
  }, [threats]);

  const highlightedSeatsByOnsCode = useMemo(() => {
    const seats = {};

    threats.forEach((threat) => {
      const constituency = constituencyMap[threat.constituency_id];
      const onsCode = constituency?.ons_code?.toUpperCase();
      if (!onsCode) return;

      seats[onsCode] = {
        fill: getThreatFill(threat.threat_score),
        stroke: "#ffffff",
        strokeWidth: 0.45,
        title: `${constituency.name}: ${getThreatBand(threat.threat_score)} Reform threat (${Number(
          threat.threat_score
        ).toFixed(1)}/10)`,
      };
    });

    return seats;
  }, [constituencyMap, threats]);

  const confidence = useMemo(
    () =>
      getModelConfidence({
        modelKey: "reformThreat",
        availableSignalKeys: model?.signalKeys ?? [],
      }),
    [model]
  );

  const topSeatExplanation = useMemo(() => {
    const topSeat = threats[0];
    const constituency = topSeat ? constituencyMap[topSeat.constituency_id] : null;
    if (!topSeat || !constituency) return null;
    return {
      name: constituency.name,
      body: `${constituency.name} sits at the top of the Reform watchlist because Reform already polled ${Number(
        topSeat.ruk_2024_share ?? 0
      ).toFixed(1)}%, the Con→Reform swing was ${Number(topSeat.con_ruk_swing ?? 0).toFixed(
        1
      )} points, and the Conservative majority is only ${Number(topSeat.con_majority ?? 0).toFixed(
        1
      )}% of the electorate.`,
    };
  }, [constituencyMap, threats]);

  if (loading) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Analytics Engine</span>
              <h1 className="portal-page-header__title">Loading Reform Threat Index…</h1>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (error || threats.length === 0) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Analytics Engine</span>
              <h1 className="portal-page-header__title">Reform UK Threat Index</h1>
            </div>
          </div>
          {error && <div className="status error" role="alert">{error}</div>}
          {!error && (
            <div className="portal-placeholder-panel">
              <p className="portal-placeholder-panel__title">No Reform threat data yet</p>
              <p className="portal-placeholder-panel__body">
                Run <code>python scripts/calculate_reform_threat.py</code> after creating the{" "}
                <code>reform_threat_index</code> table in Supabase.
              </p>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Link to="/portal/constituency" className="button ghost">Back to constituencies</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page stack">
      <Helmet><title>Reform UK Threat Index | Political Solutions</title></Helmet>
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Analytics Engine</span>
            <h1 className="portal-page-header__title">{model?.title || "Reform UK Threat Index"}</h1>
            <p className="portal-page-header__subtitle">
              Top {threats.length} Conservative seats at greatest risk from Reform UK, ranked by a shared model
              definition. {model?.description}
            </p>
          </div>
          <div className="portal-page-header__actions">
            <Link to="/portal/constituency" className="button ghost">All constituencies</Link>
          </div>
        </div>

        {stats && (
          <div className="portal-summary-grid" style={{ marginTop: 24 }}>
            <div className="portal-stat">
              <span className="portal-stat__label">Seats in index</span>
              <span className="portal-stat__value">{threats.length}</span>
              <span className="portal-stat__meta">Top 50 Con seats by Reform threat</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">Avg Reform vote share</span>
              <span className="portal-stat__value">{stats.avgShare.toFixed(1)}%</span>
              <span className="portal-stat__meta">Across indexed seats</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">Avg Con→Reform swing</span>
              <span className="portal-stat__value">{stats.avgSwing.toFixed(1)}pp</span>
              <span className="portal-stat__meta">2019 notional → 2024</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">Extreme risk seats</span>
              <span className="portal-stat__value" style={{ color: "#dc2626" }}>{stats.extreme}</span>
              <span className="portal-stat__meta">Threat score 8.5+</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">High risk seats</span>
              <span className="portal-stat__value" style={{ color: "#f97316" }}>{stats.high}</span>
              <span className="portal-stat__meta">Threat score 7.0 to 8.4</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">Avg Conservative majority</span>
              <span className="portal-stat__value">{stats.avgMaj.toFixed(1)}%</span>
              <span className="portal-stat__meta">Of electorate</span>
            </div>
          </div>
        )}
      </Card>

      <DataProvenancePanel
        metadata={metadata}
        fallbackCopy="Source links, confidence scoring, and model review dates will appear here when Reform Threat provenance records are populated."
      />

      <ThreatMethodologyDisclosure
        summary="This index highlights where Reform UK looks most strategically disruptive to Conservative-held seats under current conditions."
        signals={[
          { label: "Reform vote share", body: "Seats where Reform already has a visible electoral base rank higher." },
          { label: "Conservative majority pressure", body: "Smaller Conservative margins leave less room for right-of-centre vote splitting." },
          { label: "Local and demographic alignment", body: "Where local Reform traction and demographic fit are stronger, the seat moves up the ranking." },
        ]}
        disclaimer="These scores are analytical tools to support planning, not predictions of electoral outcomes."
        topSeatName={topSeatExplanation?.name}
        topSeatExplanation={topSeatExplanation?.body}
      />

      <ScoringMethodologyPanel model={model} />

      <ModelConfidenceBadge confidence={confidence} />

      <div className="portal-split-grid">
        <Card title="At-risk Conservative seats map">
          <div className="portal-map-shell">
            <div className="portal-map-frame">
              <Suspense fallback={<div className="portal-map-fallback" />}>
                <AnalyticsChoroplethMapClient
                  ariaLabel="Reform threat map"
                  seatsByOnsCode={highlightedSeatsByOnsCode}
                  defaultFill="#e5e7eb"
                />
              </Suspense>
            </div>
            <div className="portal-legend">
              <span className="portal-legend__title">Threat gradient</span>
              <div className="portal-legend__items">
                <span className="portal-legend__item">
                  <span className="portal-legend__swatch" style={{ background: "#f59e0b" }} />
                  Moderate
                </span>
                <span className="portal-legend__item">
                  <span className="portal-legend__swatch" style={{ background: "#f97316" }} />
                  High
                </span>
                <span className="portal-legend__item">
                  <span className="portal-legend__swatch" style={{ background: "#dc2626" }} />
                  Extreme
                </span>
                <span className="portal-legend__item">
                  <span className="portal-legend__swatch" style={{ background: "#e5e7eb" }} />
                  Other seats
                </span>
              </div>
            </div>
            <div className="portal-data-note">
              Only the top 50 at-risk Conservative seats are highlighted. All other constituencies are subdued.
            </div>
          </div>
        </Card>

        <div className="portal-kpi-list">
          <Card title="Analytical readout">
            <div className="portal-stack-compact">
              <ModelConfidenceBadge confidence={confidence} compact />
              <div className="portal-data-note" style={{ marginTop: 0 }}>
                {model?.explanationText}
              </div>
              <div className="portal-summary-grid">
                <div className="portal-stat">
                  <span className="portal-stat__label">Indexed seats</span>
                  <span className="portal-stat__value">{threats.length}</span>
                  <span className="portal-stat__meta">Top ranked Conservative targets</span>
                </div>
                <div className="portal-stat">
                  <span className="portal-stat__label">Avg Reform share</span>
                  <span className="portal-stat__value">{stats?.avgShare.toFixed(1)}%</span>
                  <span className="portal-stat__meta">2024 Westminster vote share</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {(() => {
        const defectedToReform = mpDefections.filter(
          (d) => d.currentParty === "Reform UK" && d.electedParty === "Conservative"
        );
        if (!defectedToReform.length) return null;
        return (
          <Card title="Conservative → Reform defections">
            <div className="portal-data-note" style={{ marginTop: 0 }}>
              The following 4 Conservative MPs defected to Reform UK after the 2024 election.
              These constituencies are excluded from the threat index ranking — they have already been lost.
            </div>
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Constituency</th>
                    <th>MP</th>
                    <th>Defected</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {defectedToReform.map((d) => (
                    <tr key={d.constituencyName}>
                      <td style={{ fontWeight: 600 }}>{d.constituencyName}</td>
                      <td>{d.mpName}</td>
                      <td style={{ fontSize: 12, color: "#6b7280" }}>{d.defectionDate}</td>
                      <td>
                        <span className="status-pill" style={{ background: "#12B6CF", color: "#ffffff", fontSize: 11 }}>
                          Now Reform UK
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })()}

      <Card>
        <div className="portal-insight-callout portal-insight-callout--warning">
          <p className="portal-insight-callout__title">National context</p>
          <p className="portal-insight-callout__body">
            {model?.interpretation}
          </p>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Constituency</th>
                <th>Threat band</th>
                <th>Threat score</th>
                <th>Reform 2024 share</th>
                <th>Con→Reform swing</th>
                <th>Con majority</th>
              </tr>
            </thead>
            <tbody>
              {threats.map((t) => {
                const con = constituencyMap[t.constituency_id];
                const threatBand = getThreatBand(t.threat_score);
                const threatColour = getThreatFill(t.threat_score);
                return (
                  <tr key={t.constituency_id || t.threat_rank}>
                    <td style={{ fontWeight: 700, color: "#94a3b8", fontSize: 13 }}>
                      #{t.threat_rank}
                    </td>
                    <td>
                      {con ? (
                        <Link className="table-link" to={`/portal/constituency/${con.ons_code}`}>
                          {con.name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td>
                      <span className="status-pill" style={{ background: threatColour, color: "#ffffff" }}>
                        {threatBand}
                      </span>
                    </td>
                    <td style={{ minWidth: 100 }}>
                      <ScoreBar value={t.threat_score} />
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: "#12B6CF" }}>
                        {Number(t.ruk_2024_share).toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: t.con_ruk_swing > 0 ? "#12B6CF" : "#94a3b8" }}>
                        {t.con_ruk_swing > 0 ? "+" : ""}{Number(t.con_ruk_swing).toFixed(1)}pp
                      </span>
                    </td>
                    <td>
                      <span style={{ color: Number(t.con_majority) < 5 ? "#dc2626" : "#374151" }}>
                        {Number(t.con_majority).toFixed(1)}%
                      </span>
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
