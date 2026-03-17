import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../../components/Card.jsx";
import { getReformThreatIndex, getLatestElectionWinners } from "./constituencyApi.js";

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

export default function ReformThreatIndex() {
  const [threats, setThreats] = useState([]);
  const [constituencyMap, setConstituencyMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [threatData, electionData] = await Promise.all([
          getReformThreatIndex(),
          getLatestElectionWinners(),
        ]);
        if (cancelled) return;
        const conMap = {};
        electionData.winners.forEach((w) => {
          if (w.constituencies) conMap[w.constituencies.id] = w.constituencies;
        });
        setThreats(threatData);
        setConstituencyMap(conMap);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load Reform threat index.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    if (!threats.length) return null;
    const avgShare = threats.reduce((s, t) => s + Number(t.ruk_2024_share), 0) / threats.length;
    const avgSwing = threats.reduce((s, t) => s + Number(t.con_ruk_swing), 0) / threats.length;
    const avgMaj = threats.reduce((s, t) => s + Number(t.con_majority), 0) / threats.length;
    return { avgShare, avgSwing, avgMaj };
  }, [threats]);

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
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Analytics Engine</span>
            <h1 className="portal-page-header__title">Reform UK Threat Index</h1>
            <p className="portal-page-header__subtitle">
              Top {threats.length} Conservative seats at greatest risk from Reform UK, ranked by composite threat score.
              Combines Con→Reform swing, Reform 2024 vote share, majority size, council-level Reform strength, and
              demographic alignment.
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
              <span className="portal-stat__label">Avg Conservative majority</span>
              <span className="portal-stat__value">{stats.avgMaj.toFixed(1)}%</span>
              <span className="portal-stat__meta">Of electorate</span>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div style={{
          background: "#fff7ed",
          border: "1px solid #fed7aa",
          borderLeft: "4px solid #f97316",
          borderRadius: 6,
          padding: "12px 16px",
          marginBottom: 16,
        }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 13, color: "#c2410c" }}>
            National context
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
            Reform UK polled 14.3% nationally in 2024, winning 5 seats. National polling in early 2026 shows
            Reform at 18–22%, ahead of Conservatives at 21–24%. In May 2025 local elections, Reform became
            the largest party on 4 English county councils (Essex, Kent, Staffordshire, Warwickshire) and
            won councils under NOC arrangements in 14 others. The party is building a local electoral base
            that could amplify threat scores at the next general election.
          </p>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Constituency</th>
                <th>Threat score</th>
                <th>Reform 2024 share</th>
                <th>Con→Reform swing</th>
                <th>Con majority</th>
              </tr>
            </thead>
            <tbody>
              {threats.map((t) => {
                const con = constituencyMap[t.constituency_id];
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
