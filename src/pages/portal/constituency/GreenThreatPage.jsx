import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import Card from "../../../components/Card.jsx";
import ThreatMethodologyDisclosure from "../../../components/ThreatMethodologyDisclosure.jsx";
import { getGreenThreatIndex } from "./constituencyApi.js";

function TrendCell({ value }) {
  const v = Number(value ?? 0);
  const colour = v > 5 ? "#16a34a" : v > 0 ? "#65a30d" : "#b91c1c";
  return (
    <span style={{ fontWeight: 700, color: colour }}>
      {v > 0 ? "+" : ""}{v.toFixed(1)}pp
    </span>
  );
}

function ScoreBar({ value }) {
  const pct = Math.min((Number(value) / 10) * 100, 100);
  const colour = value >= 6 ? "#16a34a" : value >= 4 ? "#65a30d" : "#94a3b8";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: colour, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: colour, width: 30 }}>
        {Number(value).toFixed(1)}
      </span>
    </div>
  );
}

const PARTY_COLOURS = { Lab: "#E4003B", Con: "#0087DC" };

function PartyBadge({ party }) {
  const colour = PARTY_COLOURS[party] ?? "#6b7280";
  return (
    <span style={{
      background: colour + "20", color: colour,
      borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 700,
    }}>
      {party}
    </span>
  );
}

export default function GreenThreatPage() {
  const { data: seats = [], isLoading: loading, isError, error: queryError } = useQuery({
    queryKey: ["greenThreatIndex"],
    queryFn: getGreenThreatIndex,
  });
  const error = isError ? (queryError?.message || "Failed to load data.") : "";

  const stats = useMemo(() => {
    if (!seats.length) return null;
    const avgShare = seats.reduce((s, r) => s + Number(r.green_2024_share ?? 0), 0) / seats.length;
    const avgTrend = seats.reduce((s, r) => s + Number(r.green_share_trend ?? 0), 0) / seats.length;
    const labSeats = seats.filter((r) => (r.incumbent_party ?? "").includes("Lab")).length;
    const conSeats = seats.filter((r) => (r.incumbent_party ?? "").includes("Con")).length;
    return { total: seats.length, avgShare, avgTrend, labSeats, conSeats };
  }, [seats]);

  const topSeatExplanation = useMemo(() => {
    const topSeat = seats[0];
    const constituency = topSeat?.constituencies;
    if (!topSeat || !constituency) return null;
    return {
      name: constituency.name,
      body: `${constituency.name} ranks highly because the Green vote reached ${Number(
        topSeat.green_2024_share ?? 0
      ).toFixed(1)}% in 2024, the Green trend since 2019 is ${Number(
        topSeat.green_share_trend ?? 0
      ).toFixed(1)} points, and the incumbent majority is only ${Number(
        topSeat.incumbent_majority ?? 0
      ).toFixed(1)}%.`,
    };
  }, [seats]);

  if (loading) return (
    <div className="page stack"><Card>
      <div className="portal-page-header">
        <div className="portal-page-header__content">
          <span className="portal-page-header__eyebrow">Analytics Engine</span>
          <h1 className="portal-page-header__title">Loading Green Threat Index…</h1>
        </div>
      </div>
    </Card></div>
  );

  if (error || !seats.length) return (
    <div className="page stack"><Card>
      <div className="portal-page-header">
        <div className="portal-page-header__content">
          <span className="portal-page-header__eyebrow">Analytics Engine</span>
          <h1 className="portal-page-header__title">Green Threat Index</h1>
        </div>
      </div>
      {error
        ? <div className="status error" role="alert">{error}</div>
        : <div className="portal-placeholder-panel">
            <p className="portal-placeholder-panel__title">No data loaded</p>
            <p className="portal-placeholder-panel__body">
              Run <code>docs/threat_indexes_ddl.sql</code> in Supabase, then{" "}
              <code>python scripts/calculate_green_threat.py</code>.
            </p>
          </div>}
    </Card></div>
  );

  return (
    <div className="page stack">
      <Helmet><title>Green Threat Index | Political Solutions</title></Helmet>
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Analytics Engine</span>
            <h1 className="portal-page-header__title">Green Threat Index</h1>
            <p className="portal-page-header__subtitle">
              Top 30 Conservative and Labour-held seats most at risk from the Green Party.
              Weighted by 2024 vote share, momentum trend, incumbency margin,
              graduate population, and urban density.
            </p>
          </div>
          <div className="portal-page-header__actions">
            <Link to="/portal/constituency/libdem-threat" className="button ghost">Lib Dem Threat</Link>
            <Link to="/portal/constituency/reform-threat" className="button ghost">Reform Threat</Link>
          </div>
        </div>

        {stats && (
          <div className="portal-summary-grid" style={{ marginTop: 24 }}>
            <div className="portal-stat">
              <span className="portal-stat__label">Seats ranked</span>
              <span className="portal-stat__value">{stats.total}</span>
              <span className="portal-stat__meta">Con + Lab seats, Green &gt;5%</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">Avg Green share</span>
              <span className="portal-stat__value">{stats.avgShare.toFixed(1)}%</span>
              <span className="portal-stat__meta">Top 30 seats</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">Avg Green trend</span>
              <span className="portal-stat__value" style={{ color: "#16a34a" }}>
                +{stats.avgTrend.toFixed(1)}pp
              </span>
              <span className="portal-stat__meta">2019→2024</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">Lab-held</span>
              <span className="portal-stat__value" style={{ color: "#E4003B" }}>{stats.labSeats}</span>
              <span className="portal-stat__meta">Labour incumbent</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">Con-held</span>
              <span className="portal-stat__value" style={{ color: "#0087DC" }}>{stats.conSeats}</span>
              <span className="portal-stat__meta">Conservative incumbent</span>
            </div>
          </div>
        )}
      </Card>

      <ThreatMethodologyDisclosure
        summary="This index surfaces seats where Green growth looks electorally meaningful enough to disrupt the current incumbent."
        signals={[
          { label: "Green 2024 share", body: "Higher existing Green support moves the seat up the ranking." },
          { label: "Green trend", body: "Seats with a sharper Green rise since 2019 are treated as more exposed." },
          { label: "Incumbent fragility", body: "Smaller incumbent majorities and structurally receptive seats score more highly." },
        ]}
        disclaimer="These scores are analytical tools to support planning, not predictions of electoral outcomes."
        topSeatName={topSeatExplanation?.name}
        topSeatExplanation={topSeatExplanation?.body}
      />

      <Card title="Top 30 Green threat seats">
        <div className="table-wrap">
          <table className="table table--compact">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Constituency</th>
                <th>Region</th>
                <th>Incumbent</th>
                <th>Green 2024</th>
                <th>Green Trend</th>
                <th>Majority</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {seats.map((s) => {
                const con = s.constituencies;
                return (
                  <tr key={s.constituency_id || s.threat_rank}>
                    <td style={{ fontWeight: 700, color: "#94a3b8", fontSize: 13 }}>#{s.threat_rank}</td>
                    <td>
                      {con ? (
                        <Link className="table-link" to={`/portal/constituency/${con.ons_code}`}>
                          {con.name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>{con?.region ?? "—"}</td>
                    <td><PartyBadge party={s.incumbent_party ?? "?"} /></td>
                    <td style={{ fontWeight: 600 }}>{Number(s.green_2024_share ?? 0).toFixed(1)}%</td>
                    <td><TrendCell value={s.green_share_trend} /></td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>{Number(s.incumbent_majority ?? 0).toFixed(1)}%</td>
                    <td><ScoreBar value={s.threat_score} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Methodology">
        <div className="portal-data-note" style={{ marginTop: 0 }}>
          <strong>Signals:</strong> Green 2024 vote share (30%), Green trend 2019→2024 (25%),
          incumbent majority (20%), graduate population % (15%), urban density score (10%).
          Scored across Conservative and Labour-held seats where Green received &gt;5% in 2024.
          Trend uses 2019 notional election on 2024 boundaries.
          <br /><br />
          <Link to="/portal/data-sources">Data sources and methodology →</Link>
        </div>
      </Card>
    </div>
  );
}
