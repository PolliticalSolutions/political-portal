import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../../components/Card.jsx";
import { getAllLgrAuthorities } from "./localGovApi.js";

// ── Key milestone dates ───────────────────────────────────────────────────
const MILESTONES = [
  {
    id: "wave2",
    label: "Wave 2 consultation closes",
    date: new Date("2026-03-26T23:59:00Z"),
    urgency: "critical",
    note: "MHCLG consultation deadline for 14 county areas",
  },
  {
    id: "surrey",
    label: "Surrey shadow elections",
    date: new Date("2026-05-07T00:00:00Z"),
    urgency: "high",
    note: "First elections for East Surrey & West Surrey Councils",
  },
  {
    id: "dpp",
    label: "DPP decisions expected",
    date: new Date("2026-06-30T00:00:00Z"),
    urgency: "medium",
    note: "Norfolk/Suffolk, Essex, Hampshire, Sussex — spring/mid 2026",
    approximate: true,
  },
];

function daysUntil(date) {
  const diff = date - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function CountdownCard({ milestone }) {
  const days = daysUntil(milestone.date);
  const urgent = days <= 14;
  const colours = {
    critical: { bg: "#fef2f2", border: "#fecaca", accent: "#dc2626", text: "#7f1d1d" },
    high:     { bg: "#fff7ed", border: "#fed7aa", accent: "#ea580c", text: "#7c2d12" },
    medium:   { bg: "#fffbeb", border: "#fde68a", accent: "#d97706", text: "#78350f" },
  };
  const c = colours[milestone.urgency] ?? colours.medium;
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`,
      borderLeft: `4px solid ${c.accent}`,
      borderRadius: 6, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: urgent ? "#dc2626" : c.accent, lineHeight: 1 }}>
          {milestone.approximate ? "~" : ""}{days}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>days</span>
      </div>
      <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{milestone.label}</p>
      <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>{milestone.note}</p>
      <p style={{ margin: 0, fontSize: 11, color: c.accent, fontWeight: 600 }}>
        {milestone.date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        {milestone.approximate && " (approx.)"}
      </p>
    </div>
  );
}

// ── Surrey reorganisation structure ──────────────────────────────────────
const SURREY_STRUCTURE = {
  abolished: {
    "East Surrey Council": [
      "Elmbridge Borough Council",
      "Epsom and Ewell Borough Council",
      "Mole Valley District Council",
      "Reigate and Banstead Borough Council",
      "Tandridge District Council",
    ],
    "West Surrey Council": [
      "Guildford Borough Council",
      "Runnymede Borough Council",
      "Spelthorne Borough Council",
      "Surrey Heath Borough Council",
      "Waverley Borough Council",
      "Woking Borough Council",
    ],
  },
};

const STATUS_ORDER = ["Order made", "Shadow authority", "Consultation closed", "Consultation open", "Completed"];

const STATUS_COLOURS = {
  "Order made": { bg: "#fef2f2", text: "#dc2626", dot: "#dc2626" },
  "Consultation closed": { bg: "#fff7ed", text: "#ea580c", dot: "#ea580c" },
  "Consultation open": { bg: "#fffbeb", text: "#d97706", dot: "#d97706" },
  "Shadow authority": { bg: "#f0fdf4", text: "#16a34a", dot: "#16a34a" },
  "Completed": { bg: "#f0fdf4", text: "#16a34a", dot: "#16a34a" },
};

const WAVE_LABELS = {
  "Surrey": "Surrey — Order made",
  "DPP": "Devolution Priority Programme",
  "Wave 2": "Wave 2",
};

function StatusBadge({ status }) {
  const colours = STATUS_COLOURS[status] ?? { bg: "#f1f5f9", text: "#475569", dot: "#94a3b8" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: colours.bg, color: colours.text,
      borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: colours.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

const ALL_WAVES = ["All", "Surrey", "DPP", "Wave 2"];

export default function LGRTrackerPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeWave, setActiveWave] = useState("All");
  const [activeArea, setActiveArea] = useState("All");

  useEffect(() => {
    let cancelled = false;
    getAllLgrAuthorities()
      .then((data) => { if (!cancelled) setRecords(data); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load LGR data."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const areas = useMemo(() => {
    const set = new Set(records.map((r) => r.area_name).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [records]);

  const filtered = useMemo(() => {
    return records
      .filter((r) => activeWave === "All" || r.lgr_wave === activeWave)
      .filter((r) => activeArea === "All" || r.area_name === activeArea)
      .sort((a, b) => {
        const wi = STATUS_ORDER.indexOf(a.lgr_status);
        const wj = STATUS_ORDER.indexOf(b.lgr_status);
        if (wi !== wj) return wi - wj;
        return (a.area_name ?? "").localeCompare(b.area_name ?? "");
      });
  }, [records, activeWave, activeArea]);

  const stats = useMemo(() => {
    const confirmed = records.filter((r) => r.lgr_status === "Order made" || r.lgr_status === "Shadow authority").length;
    const consulting = records.filter((r) => r.lgr_status === "Consultation closed" || r.lgr_status === "Consultation open").length;
    const areas2027 = records.filter((r) => r.abolition_date?.startsWith("2027")).length;
    const areas2028 = records.filter((r) => r.abolition_date?.startsWith("2028")).length;
    return { total: records.length, confirmed, consulting, areas2027, areas2028 };
  }, [records]);

  if (loading) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Local Government Intelligence</span>
              <h1 className="portal-page-header__title">Loading LGR Tracker…</h1>
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
              <span className="portal-page-header__eyebrow">Local Government Intelligence</span>
              <h1 className="portal-page-header__title">LGR Tracker</h1>
            </div>
          </div>
          <div className="status error" role="alert">{error}</div>
          <div className="portal-data-note" style={{ marginTop: 12 }}>
            Run <code>docs/lgr_authorities_ddl.sql</code> in Supabase SQL Editor, then{" "}
            <code>python scripts/import_lgr_data.py</code>.
          </div>
        </Card>
      </div>
    );
  }

  if (!records.length) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Local Government Intelligence</span>
              <h1 className="portal-page-header__title">LGR Tracker</h1>
            </div>
          </div>
          <div className="portal-placeholder-panel">
            <p className="portal-placeholder-panel__title">No LGR data loaded</p>
            <p className="portal-placeholder-panel__body">
              Run <code>docs/lgr_authorities_ddl.sql</code> in Supabase, then{" "}
              <code>python scripts/import_lgr_data.py</code>.
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
            <span className="portal-page-header__eyebrow">Local Government Intelligence</span>
            <h1 className="portal-page-header__title">Local Government Reorganisation Tracker</h1>
            <p className="portal-page-header__subtitle">
              19 English two-tier areas undergoing reorganisation following the English Devolution
              White Paper (December 2024). Surrey legally confirmed (Order made March 2026);
              all other areas in consultation as of March 2026.
            </p>
          </div>
          <div className="portal-page-header__actions">
            <Link to="/portal/local-government" className="button ghost">All councils</Link>
          </div>
        </div>

        <div className="portal-summary-grid" style={{ marginTop: 24 }}>
          <div className="portal-stat">
            <span className="portal-stat__label">Councils tracked</span>
            <span className="portal-stat__value">{stats.total}</span>
            <span className="portal-stat__meta">Across 19 two-tier areas</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Legally confirmed</span>
            <span className="portal-stat__value" style={{ color: "#dc2626" }}>{stats.confirmed}</span>
            <span className="portal-stat__meta">Order made or shadow authority</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">In consultation</span>
            <span className="portal-stat__value" style={{ color: "#d97706" }}>{stats.consulting}</span>
            <span className="portal-stat__meta">Decision pending 2026</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Vesting 2027</span>
            <span className="portal-stat__value">{stats.areas2027}</span>
            <span className="portal-stat__meta">Surrey confirmed</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Vesting 2028</span>
            <span className="portal-stat__value">{stats.areas2028}</span>
            <span className="portal-stat__meta">All other areas (target)</span>
          </div>
        </div>
      </Card>

      {/* ── Countdown milestones ── */}
      <Card title="Key milestones">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 8 }}>
          {MILESTONES.map((m) => <CountdownCard key={m.id} milestone={m} />)}
        </div>
        <p className="portal-data-note" style={{ marginTop: 12, marginBottom: 0 }}>
          Countdowns computed from today. Wave 2 consultation closes 26 March 2026 — after that,
          government makes decisions on unitary structure for 14 county areas.
          Surrey shadow elections 7 May 2026 are the first elections for brand new unitary councils.
        </p>
      </Card>

      {/* ── Surrey intelligence panel ── */}
      <Card title="Surrey — confirmed reorganisation">
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderLeft: "4px solid #dc2626", borderRadius: 6, padding: "12px 16px", marginBottom: 16 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#7f1d1d" }}>
            Surrey (Structural Changes) Order 2026 — made 10 March 2026
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#374151" }}>
            Surrey County Council and all 11 district/borough councils abolished 1 April 2027.
            Shadow authority elections 7 May 2026. 12 councils → 2 new unitary authorities.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {Object.entries(SURREY_STRUCTURE.abolished).map(([unitary, districts]) => (
            <div key={unitary} style={{ border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ background: "#1e293b", color: "#f8fafc", padding: "10px 14px" }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{unitary}</p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8" }}>New unitary authority — vests 1 April 2027</p>
              </div>
              <div style={{ padding: "10px 14px" }}>
                <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Abolished councils absorbed
                </p>
                <ul style={{ margin: 0, padding: "0 0 0 16px", listStyle: "disc" }}>
                  {districts.map((d) => (
                    <li key={d} style={{ fontSize: 13, color: "#374151", marginBottom: 3, lineHeight: 1.4 }}>{d}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
        <p className="portal-data-note" style={{ marginTop: 12, marginBottom: 0 }}>
          Surrey County Council is also abolished. Combined: 12 councils abolished → 2 new unitaries.
          Woking Borough Council was already in special measures following a £1.7bn financial collapse.
          Shadow authority elections on 7 May 2026 elect the first councillors for both new councils.
        </p>
      </Card>

      <Card title={`LGR records (${filtered.length})`}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Wave:</span>
          {ALL_WAVES.map((w) => (
            <button
              key={w}
              type="button"
              className={`button${activeWave === w ? "" : " ghost"}`}
              style={{ fontSize: 12, padding: "3px 10px" }}
              onClick={() => setActiveWave(w)}
            >
              {WAVE_LABELS[w] ?? w}
            </button>
          ))}
        </div>

        {areas.length > 2 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>Area:</span>
            {areas.map((a) => (
              <button
                key={a}
                type="button"
                className={`button${activeArea === a ? "" : " ghost"}`}
                style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={() => setActiveArea(a)}
              >
                {a}
              </button>
            ))}
          </div>
        )}

        <div className="table-wrap">
          <table className="table table--compact">
            <thead>
              <tr>
                <th>Authority</th>
                <th>Area</th>
                <th>Wave</th>
                <th>Status</th>
                <th>Abolition</th>
                <th>Successor</th>
                <th>Mayoral CA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const abolitionYear = r.abolition_date ? new Date(r.abolition_date).getFullYear() : "—";
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{r.authority_name}</td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>{r.area_name ?? "—"}</td>
                    <td style={{ fontSize: 11 }}>{WAVE_LABELS[r.lgr_wave] ?? r.lgr_wave ?? "—"}</td>
                    <td><StatusBadge status={r.lgr_status} /></td>
                    <td style={{ fontSize: 13, fontWeight: 600 }}>{abolitionYear}</td>
                    <td style={{ fontSize: 12, color: "#374151", maxWidth: 200 }}>
                      {r.proposed_unitary_name && r.proposed_unitary_name !== "TBC"
                        ? r.proposed_unitary_name
                        : <span style={{ color: "#9ca3af" }}>TBC</span>}
                    </td>
                    <td>
                      {r.mayoral_combined_authority
                        ? <span className="status-pill success" style={{ fontSize: 10 }}>Yes</span>
                        : <span style={{ fontSize: 12, color: "#9ca3af" }}>No</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {filtered.some((r) => r.political_context) && (
        <Card title="Political context notes">
          {filtered
            .filter((r) => r.political_context)
            .map((r) => (
              <div key={r.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{r.authority_name}</span>
                  <StatusBadge status={r.lgr_status} />
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
                  {r.political_context}
                </p>
                {r.source_url && (
                  <a href={r.source_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "#6b7280", marginTop: 4, display: "inline-block" }}>
                    Source →
                  </a>
                )}
              </div>
            ))}
        </Card>
      )}

      <Card title="Methodology">
        <div className="portal-data-note" style={{ marginTop: 0 }}>
          Data sourced from MHCLG consultation documents, the Surrey (Structural Changes) Order 2026,
          the English Devolution White Paper (December 2024), and Institute for Government analysis.
          Status as at March 2026. Abolition dates are government targets and subject to parliamentary
          approval via Structural Changes Orders. Political control data reflects most recent local
          election results and may have changed.
          <br /><br />
          <Link to="/portal/data-sources">Full data sources and methodology →</Link>
        </div>
      </Card>
    </div>
  );
}
