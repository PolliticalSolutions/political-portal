import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import Card from "../../../components/Card.jsx";
import ThreatMethodologyDisclosure from "../../../components/ThreatMethodologyDisclosure.jsx";
import { getLibDemThreatIndex } from "./constituencyApi.js";

function TrendCell({ value }) {
  const v = Number(value ?? 0);
  const colour = v > 5 ? "#16a34a" : v > 0 ? "#65a30d" : v < -2 ? "#b91c1c" : "#6b7280";
  return (
    <span style={{ fontWeight: 700, color: colour }}>
      {v > 0 ? "+" : ""}{v.toFixed(1)}pp
    </span>
  );
}

function ScoreBar({ value, max = 10, colour }) {
  const pct = Math.min((Number(value) / max) * 100, 100);
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

export default function LibDemThreatPage() {
  const { data: seats = [], isLoading: loading, isError, error: queryError } = useQuery({
    queryKey: ["libDemThreatIndex"],
    queryFn: getLibDemThreatIndex,
  });
  const error = isError ? (queryError?.message || "Failed to load data.") : "";

  const stats = useMemo(() => {
    if (!seats.length) return null;
    const avgShare = seats.reduce((s, r) => s + Number(r.ld_2024_share ?? 0), 0) / seats.length;
    const avgTrend = seats.reduce((s, r) => s + Number(r.ld_share_trend ?? 0), 0) / seats.length;
    const highlyAt = seats.filter((r) => Number(r.threat_score) >= 5).length;
    return { total: seats.length, avgShare, avgTrend, highlyAt };
  }, [seats]);

  const topSeatExplanation = useMemo(() => {
    const topSeat = seats[0];
    const constituency = topSeat?.constituencies;
    if (!topSeat || !constituency) return null;
    return {
      name: constituency.name,
      body: `${constituency.name} ranks highest because the Liberal Democrats took ${Number(
        topSeat.ld_2024_share ?? 0
      ).toFixed(1)}% in 2024, their trend since 2019 is ${Number(topSeat.ld_share_trend ?? 0).toFixed(
        1
      )} points, and the Conservative lead over the Liberal Democrats is only ${Number(
        topSeat.con_ld_majority ?? 0
      ).toFixed(1)}%.`,
    };
  }, [seats]);

  if (loading) return (
    <div className="page stack"><Card>
      <div className="portal-page-header">
        <div className="portal-page-header__content">
          <span className="portal-page-header__eyebrow">Analytics Engine</span>
          <h1 className="portal-page-header__title">Loading Lib Dem Threat Index…</h1>
        </div>
      </div>
    </Card></div>
  );

  if (error || !seats.length) return (
    <div className="page stack"><Card>
      <div className="portal-page-header">
        <div className="portal-page-header__content">
          <span className="portal-page-header__eyebrow">Analytics Engine</span>
          <h1 className="portal-page-header__title">Lib Dem Threat Index</h1>
        </div>
      </div>
      {error
        ? <div className="status error" role="alert">{error}</div>
        : <div className="portal-placeholder-panel">
            <p className="portal-placeholder-panel__title">No data loaded</p>
            <p className="portal-placeholder-panel__body">
              Run <code>docs/threat_indexes_ddl.sql</code> in Supabase, then{" "}
              <code>python scripts/calculate_libdem_threat.py</code>.
            </p>
          </div>}
    </Card></div>
  );

  return (
    <div className="page stack">
      <Helmet><title>Lib Dem Threat Index | Political Solutions</title></Helmet>
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Analytics Engine</span>
            <h1 className="portal-page-header__title">Lib Dem Threat Index</h1>
            <p className="portal-page-header__subtitle">
              Top 50 Conservative seats most at risk from Liberal Democrat challenge.
              Weighted by 2024 vote share, momentum trend, incumbency margin,
              graduate population, and owner-occupancy.
            </p>
          </div>
          <div className="portal-page-header__actions">
            <Link to="/portal/constituency/reform-threat" className="button ghost">Reform Threat</Link>
            <Link to="/portal/constituency/green-threat" className="button ghost">Green Threat</Link>
          </div>
        </div>

        {stats && (
          <div className="portal-summary-grid" style={{ marginTop: "var(--space-4)" }}>
            <div className="portal-stat">
              <span className="portal-stat__label">Seats ranked</span>
              <span className="portal-stat__value">{stats.total}</span>
              <span className="portal-stat__meta">Con seats with LD threat</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">Avg LD share</span>
              <span className="portal-stat__value">{stats.avgShare.toFixed(1)}%</span>
              <span className="portal-stat__meta">Across top 50</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">Avg LD trend</span>
              <span className="portal-stat__value" style={{ color: stats.avgTrend > 0 ? "#16a34a" : "var(--danger)" }}>
                {stats.avgTrend > 0 ? "+" : ""}{stats.avgTrend.toFixed(1)}pp
              </span>
              <span className="portal-stat__meta">2019→2024 swing</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">High threat (≥5.0)</span>
              <span className="portal-stat__value" style={{ color: "#FAA61A" }}>{stats.highlyAt}</span>
              <span className="portal-stat__meta">Score ≥ 5.0</span>
            </div>
          </div>
        )}
      </Card>

      <ThreatMethodologyDisclosure
        summary="This ranking is designed to show where Liberal Democrat challenge looks most operationally serious in Conservative-held seats."
        signals={[
          { label: "Liberal Democrat 2024 share", body: "A larger existing Liberal Democrat vote base raises the threat score." },
          { label: "Momentum trend", body: "Seats where the Liberal Democrats moved forward between 2019 and 2024 are ranked higher." },
          { label: "Conservative margin", body: "A smaller Conservative advantage over the Liberal Democrats makes the seat harder to defend." },
        ]}
        disclaimer="These scores are analytical tools to support planning, not predictions of electoral outcomes."
        topSeatName={topSeatExplanation?.name}
        topSeatExplanation={topSeatExplanation?.body}
      />

      <Card title="Top 50 Lib Dem threat seats">
        <div className="table-wrap">
          <table className="table table--compact" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "6%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Constituency</th>
                <th>Region</th>
                <th>LD 2024</th>
                <th>LD Trend</th>
                <th>Majority</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {seats.map((s) => {
                const con = s.constituencies;
                return (
                  <tr key={s.constituency_id || s.threat_rank}>
                    <td style={{ fontWeight: 700, color: "var(--text-muted)", fontSize: 13 }}>#{s.threat_rank}</td>
                    <td>
                      {con ? (
                        <Link className="table-link" to={`/portal/constituency/${con.ons_code}`}>
                          {con.name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{con?.region ?? "—"}</td>
                    <td style={{ fontWeight: 600 }}>{Number(s.ld_2024_share ?? 0).toFixed(1)}%</td>
                    <td><TrendCell value={s.ld_share_trend} /></td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{Number(s.con_ld_majority ?? 0).toFixed(1)}%</td>
                    <td><ScoreBar value={s.threat_score} colour="#FAA61A" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Methodology">
        <div className="portal-data-note">
          <strong>Signals:</strong> LD 2024 vote share (25%), LD trend 2019→2024 (25%),
          Conservative majority over LD (25%), graduate population % (15%), owner-occupancy % (10%).
          Scored across 117 Conservative-held seats (4 Reform defections excluded). Only seats
          with meaningful LD presence are ranked. Trend uses 2019 notional election on 2024 boundaries.
          <br /><br />
          <Link to="/portal/data-sources">Data sources and methodology →</Link>
        </div>
      </Card>
    </div>
  );
}
