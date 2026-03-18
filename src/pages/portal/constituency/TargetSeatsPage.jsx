import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../../components/Card.jsx";
import { getTargetSeats } from "./constituencyApi.js";

const CLASSIFICATION_COLOURS = {
  "Top Target": "#dc2626",
  "Key Target": "#ea580c",
  "Longer Shot": "#6b7280",
};

const FILTERS = ["All", "Top Target", "Key Target", "Longer Shot"];

function ClassificationBadge({ classification }) {
  const colour = CLASSIFICATION_COLOURS[classification] ?? "#6b7280";
  return (
    <span
      className="status-pill"
      style={{ background: colour, color: "#ffffff", fontSize: 11 }}
    >
      {classification}
    </span>
  );
}

function ReformRiskBar({ value }) {
  const pct = Math.min((Number(value) / 10) * 100, 100);
  const colour = value >= 7 ? "#dc2626" : value >= 5 ? "#ea580c" : "#6b7280";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: colour, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: colour, fontWeight: 600, width: 28 }}>
        {Number(value).toFixed(1)}
      </span>
    </div>
  );
}

export default function TargetSeatsPage() {
  const [seats, setSeats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getTargetSeats();
        if (!cancelled) setSeats(data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load target seats.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (activeFilter === "All") return seats;
    return seats.filter((s) => s.target_classification === activeFilter);
  }, [seats, activeFilter]);

  const stats = useMemo(() => {
    if (!seats.length) return null;
    const topTargets = seats.filter((s) => s.target_classification === "Top Target").length;
    const avgSwing = seats.slice(0, 50).reduce((sum, s) => sum + Number(s.swing_required), 0) / Math.min(seats.length, 50);
    return { total: seats.length, topTargets, avgSwing };
  }, [seats]);

  if (loading) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Analytics Engine</span>
              <h1 className="portal-page-header__title">Loading Target Seats…</h1>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Analytics Engine</span>
              <h1 className="portal-page-header__title">Conservative Target Seats 2029</h1>
            </div>
          </div>
          <div className="status error" role="alert">{error}</div>
          <div className="portal-data-note" style={{ marginTop: 12 }}>
            The target seats table may not exist yet. Run{" "}
            <code>docs/target_seats_ddl.sql</code> in Supabase, then run{" "}
            <code>python scripts/calculate_target_seats.py</code>.
          </div>
        </Card>
      </div>
    );
  }

  if (!seats.length) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Analytics Engine</span>
              <h1 className="portal-page-header__title">Conservative Target Seats 2029</h1>
            </div>
          </div>
          <div className="portal-placeholder-panel">
            <p className="portal-placeholder-panel__title">No target seat data yet</p>
            <p className="portal-placeholder-panel__body">
              Run <code>python scripts/calculate_target_seats.py</code> to populate target seats.
            </p>
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
            <h1 className="portal-page-header__title">Conservative Target Seats 2029</h1>
            <p className="portal-page-header__subtitle">
              Top 150 seats ranked by Conservative recovery potential. Scoring weights swing
              requirement, Reform squeeze risk, and demographic alignment.
            </p>
          </div>
          <div className="portal-page-header__actions">
            <Link to="/portal/constituency" className="button ghost">All constituencies</Link>
          </div>
        </div>

        {stats && (
          <div className="portal-summary-grid" style={{ marginTop: 24 }}>
            <div className="portal-stat">
              <span className="portal-stat__label">Total targets</span>
              <span className="portal-stat__value">{stats.total}</span>
              <span className="portal-stat__meta">Top 150 ranked seats</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">Top targets</span>
              <span className="portal-stat__value" style={{ color: "#dc2626" }}>{stats.topTargets}</span>
              <span className="portal-stat__meta">Ranked 1-50</span>
            </div>
            <div className="portal-stat">
              <span className="portal-stat__label">Avg swing required</span>
              <span className="portal-stat__value">{stats.avgSwing.toFixed(1)}%</span>
              <span className="portal-stat__meta">Across top 50 targets</span>
            </div>
          </div>
        )}
      </Card>

      <Card title={`Target seats (${filtered.length})`}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`button${activeFilter === f ? "" : " ghost"}`}
              style={{ fontSize: 13, padding: "4px 12px" }}
              onClick={() => setActiveFilter(f)}
            >
              {f}
              {f !== "All" && (
                <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.75 }}>
                  ({seats.filter((s) => s.target_classification === f).length})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="table-wrap">
          <table className="table table--compact">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Constituency</th>
                <th>Region</th>
                <th>Current holder</th>
                <th>Swing required</th>
                <th>Reform risk</th>
                <th>Classification</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((seat) => {
                const con = seat.constituencies;
                return (
                  <tr key={seat.constituency_id || seat.target_rank}>
                    <td style={{ fontWeight: 700, color: "#94a3b8", fontSize: 13 }}>
                      #{seat.target_rank}
                    </td>
                    <td>
                      {con ? (
                        <Link className="table-link" to={`/portal/constituency/${con.ons_code}`}>
                          {con.name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>{con?.region ?? "—"}</td>
                    <td>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {seat.current_holder}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          color: Number(seat.swing_required) < 5 ? "#16a34a" :
                                 Number(seat.swing_required) < 10 ? "#ea580c" : "#b91c1c",
                        }}
                      >
                        {Number(seat.swing_required).toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      <ReformRiskBar value={seat.reform_squeeze_risk} />
                    </td>
                    <td>
                      <ClassificationBadge classification={seat.target_classification} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Methodology">
        <div className="portal-data-note" style={{ marginTop: 0 }}>
          <strong>Scoring components:</strong> 40% swing required (lower = better), 30% Reform squeeze
          risk mitigation (lower Reform share = less squeeze = more recoverable), 30% demographic
          alignment (Leave vote share and owner-occupancy as Con-leaning proxies).
          The 4 constituencies where Conservative MPs defected to Reform UK are not scored here
          (they are treated as seats to re-win, not defend).
        </div>
      </Card>
    </div>
  );
}
