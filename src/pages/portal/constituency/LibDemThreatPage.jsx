import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../../components/Card.jsx";
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
  const [seats, setSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getLibDemThreatIndex()
      .then((data) => { if (!cancelled) setSeats(data); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load data."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    if (!seats.length) return null;
    const avgShare = seats.reduce((s, r) => s + Number(r.ld_2024_share ?? 0), 0) / seats.length;
    const avgTrend = seats.reduce((s, r) => s + Number(r.ld_share_trend ?? 0), 0) / seats.length;
    const highlyAt = seats.filter((r) => Number(r.threat_score) >= 5).length;
    return { total: seats.length, avgShare, avgTrend, highlyAt };
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
          <div className="portal-summary-grid" style={{ marginTop: 24 }}>
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
              <span className="portal-stat__value" style={{ color: stats.avgTrend > 0 ? "#16a34a" : "#b91c1c" }}>
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

      <Card title="Top 50 Lib Dem threat seats">
        <div className="table-wrap">
          <table className="table table--compact">
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
                    <td style={{ fontWeight: 700, color: "#94a3b8", fontSize: 13 }}>#{s.threat_rank}</td>
                    <td>
                      {con ? (
                        <Link className="table-link" to={`/portal/constituency/${con.ons_code}`}>
                          {con.name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>{con?.region ?? "—"}</td>
                    <td style={{ fontWeight: 600 }}>{Number(s.ld_2024_share ?? 0).toFixed(1)}%</td>
                    <td><TrendCell value={s.ld_share_trend} /></td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>{Number(s.con_ld_majority ?? 0).toFixed(1)}%</td>
                    <td><ScoreBar value={s.threat_score} colour="#FAA61A" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Methodology">
        <div className="portal-data-note" style={{ marginTop: 0 }}>
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
