import { useEffect, useMemo, useState } from "react";

import Card from "../../../components/Card.jsx";
import ModelConfidenceBadge from "../../../components/ModelConfidenceBadge.jsx";
import { buildModelPerformancePageSummary } from "../../../lib/modelPerformanceSummary.js";
import { getModelBacktestAvailability } from "../../../lib/modelBacktestApi.js";

function toModeLabel(mode) {
  const labels = {
    standard: "Validated ranking",
    directional: "Directional model",
    watchlist: "Watchlist model",
    planning_only: "Planning tool",
  };
  return labels[mode] ?? mode;
}

function BacktestBadge({ state }) {
  if (state === "available") return <span className="status-pill success">Backtest available</span>;
  if (state === "not_applicable") return <span className="status-pill info">Not applicable</span>;
  return <span className="status-pill warning">Pending</span>;
}

function AccordionItem({ model }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="portal-record" style={{ padding: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "16px 20px",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{model.label}</span>
          <span className={`status-pill ${model.maturity.tone}`}>{toModeLabel(model.confidence.presentationMode)}</span>
          <ModelConfidenceBadge confidence={model.confidence} compact />
        </div>
        <span style={{ fontSize: 13, color: "#6b7280", flexShrink: 0 }}>{open ? "Hide detail ▲" : "Show detail ▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 20px 20px", borderTop: "1px solid #f3f4f6" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 24,
              marginTop: 20,
            }}
          >
            {/* Left column */}
            <div className="stack" style={{ gap: 16 }}>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Model question</p>
                <p style={{ margin: 0, fontSize: 14 }}>{model.targetQuestion || "—"}</p>
              </div>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Universe</p>
                <p style={{ margin: 0, fontSize: 14 }}>{model.eligibleUniverse || "—"}</p>
              </div>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Score range</p>
                <p style={{ margin: 0, fontSize: 14 }}>{model.scoreRange || "—"}</p>
              </div>
              {model.interpretationGuidance && (
                <div className="portal-insight-callout">
                  <p className="portal-insight-callout__title">Interpretation</p>
                  <p className="portal-insight-callout__body">{model.interpretationGuidance}</p>
                </div>
              )}
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>What this model should not claim</p>
                <ul className="model-performance-list">
                  {model.nonClaims.length ? model.nonClaims.map((item) => <li key={item}>{item}</li>) : <li>None specified.</li>}
                </ul>
              </div>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Known weaknesses</p>
                <ul className="model-performance-list">
                  {model.knownWeaknesses.length ? model.knownWeaknesses.map((item) => <li key={item}>{item}</li>) : <li>None specified.</li>}
                </ul>
              </div>
            </div>

            {/* Right column */}
            <div className="stack" style={{ gap: 16 }}>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Signal basis</p>
                <div style={{ display: "flex", gap: 24 }}>
                  <div>
                    <span style={{ fontSize: 24, fontWeight: 700, color: "#16a34a" }}>{model.signalAudit.counts.robust}</span>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>Robust signals</p>
                  </div>
                  <div>
                    <span style={{ fontSize: 24, fontWeight: 700, color: "#ea580c" }}>{model.signalAudit.counts.noisy}</span>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>Noisy signals</p>
                  </div>
                </div>
              </div>
              {model.signalAudit.warning && (
                <div className="portal-insight-callout portal-insight-callout--warning">
                  <p className="portal-insight-callout__title">Signal quality warning</p>
                  <p className="portal-insight-callout__body">{model.signalAudit.warning}</p>
                </div>
              )}
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Success metrics</p>
                <ul className="model-performance-list">
                  {model.successMetrics.length ? model.successMetrics.map((item) => <li key={item}>{item}</li>) : <li>Not yet defined.</li>}
                </ul>
              </div>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Data gaps</p>
                <ul className="model-performance-list">
                  {model.calibration.keyDataGaps.length ? model.calibration.keyDataGaps.map((item) => <li key={item}>{item}</li>) : <li>No immediate gaps flagged.</li>}
                </ul>
              </div>
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Signals safe to retain</p>
                <ul className="model-performance-list">
                  {model.calibration.strongestRetainedSignals.length ? model.calibration.strongestRetainedSignals.map((item) => <li key={item}>{item}</li>) : <li>None identified yet.</li>}
                </ul>
              </div>
              {model.calibration.immediateNextStep && (
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Immediate next step</p>
                  <p style={{ margin: 0, fontSize: 14 }}>{model.calibration.immediateNextStep}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ModelPerformancePage() {
  const [runtimeBacktests, setRuntimeBacktests] = useState({
    ok: true,
    hasRuntimeMetrics: false,
    models: {},
    limitations: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getModelBacktestAvailability()
      .then((result) => { if (!cancelled) setRuntimeBacktests(result); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const summary = useMemo(
    () => buildModelPerformancePageSummary({ runtimeBacktests }),
    [runtimeBacktests]
  );

  return (
    <div className="page stack">

      {/* ── Section 1: Header ─────────────────────────────────────────────── */}
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Analytics Engine</span>
            <h1 className="portal-page-header__title">Model Performance &amp; Validation</h1>
            <p className="portal-page-header__subtitle">
              Internal validation surface for model maturity, signal quality, and backtest readiness.
              Models are classified by the strength of evidence that supports them — not all outputs carry equal empirical weight.
            </p>
          </div>
        </div>

        <div className="portal-summary-grid" style={{ marginTop: 24 }}>
          <div className="portal-stat">
            <span className="portal-stat__label">Validated ranking</span>
            <span className="portal-stat__value">{summary.maturityCounts.strong}</span>
            <span className="portal-stat__meta">Historically defensible</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Directional</span>
            <span className="portal-stat__value">{summary.maturityCounts.partial}</span>
            <span className="portal-stat__meta">Useful with caveats</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Watchlist</span>
            <span className="portal-stat__value">{summary.maturityCounts.weak}</span>
            <span className="portal-stat__meta">Operationally useful</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Planning tool</span>
            <span className="portal-stat__value">{summary.maturityCounts.planningOnly}</span>
            <span className="portal-stat__meta">Assumption-governed</span>
          </div>
        </div>
      </Card>

      {/* ── Section 2: 2×2 Model Cards ────────────────────────────────────── */}
      <Card title="Models">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            marginTop: 16,
          }}
        >
          {summary.models.map((model) => (
            <div
              key={model.modelKey}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{model.label}</h3>
                <span className={`status-pill ${model.maturity.tone}`} style={{ flexShrink: 0 }}>
                  {toModeLabel(model.confidence.presentationMode)}
                </span>
              </div>

              <ModelConfidenceBadge confidence={model.confidence} />

              <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.5 }}>
                {model.maturity.summary}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: "auto" }}>
                <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
                  {model.signalAudit.counts.robust} robust signal{model.signalAudit.counts.robust !== 1 ? "s" : ""},{" "}
                  {model.signalAudit.counts.noisy} noisy
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
                  Backtest:{" "}
                  <span style={{ fontWeight: 600 }}>
                    {model.backtest.state === "available"
                      ? "Available"
                      : model.backtest.state === "not_applicable"
                      ? "Not applicable"
                      : "Pending"}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Section 3: Signal Quality Table ───────────────────────────────── */}
      <Card title="Signal quality">
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Signal quality</th>
                <th>Historical coverage</th>
                <th>Current coverage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.models.map((model) => (
                <tr key={`${model.modelKey}-audit`}>
                  <td style={{ fontWeight: 600 }}>{model.label}</td>
                  <td>{model.signalAudit.confidenceSummary}</td>
                  <td>{model.signalAudit.historicalCoverage}</td>
                  <td>{model.signalAudit.currentCoverage}</td>
                  <td>
                    <span className={`status-pill ${model.maturity.tone}`}>{model.maturity.label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="portal-data-note" style={{ marginTop: 12 }}>
          Signal quality caveats, where applicable, are shown in the detailed model accordions below.
        </p>
      </Card>

      {/* ── Section 4: Backtest Status Table ──────────────────────────────── */}
      <Card title="Backtest status">
        {loading ? (
          <p className="muted" style={{ marginTop: 16 }}>Loading runtime backtest status…</p>
        ) : (
          <>
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.models.map((model) => (
                    <tr key={`${model.modelKey}-backtest`}>
                      <td style={{ fontWeight: 600 }}>{model.label}</td>
                      <td><BacktestBadge state={model.backtest.state} /></td>
                      <td style={{ fontSize: 13, color: "#374151" }}>
                        {model.backtest.state === "not_applicable"
                          ? "Governed by assumption transparency, not hit-rate testing."
                          : model.backtest.state === "available"
                          ? "Runtime metrics present — not a substitute for full cycle-aligned artifact review."
                          : "Framework in place; cycle-aligned feature extracts still required."}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {runtimeBacktests.limitations.length > 0 && (
              <div className="portal-data-note" style={{ marginTop: 12 }}>
                {runtimeBacktests.limitations.join(" ")}
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Section 5: Key Priorities ─────────────────────────────────────── */}
      <Card title="Key priorities">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 24,
            marginTop: 16,
          }}
        >
          <div>
            <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>What to do next</h4>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li>
                Run cycle-aligned feature extracts for historical backtest periods (2017, 2019, 2024).
              </li>
              <li>
                Populate <code>candidates.first_elected_year</code> via <code>import_first_elected_year.py</code> to activate incumbency boost.
              </li>
              <li>
                Surface runtime backtest artifact metadata for the vulnerability and Reform Threat models.
              </li>
              <li>
                Expand council instability data coverage beyond current local authority snapshot.
              </li>
            </ol>
          </div>

          <div>
            <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Data gaps</h4>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              {summary.crossModelPriorities.keyDataGaps.length > 0
                ? summary.crossModelPriorities.keyDataGaps.map((gap, i) => <li key={i}>{gap}</li>)
                : (
                  <>
                    <li>Historical event-driven signal coverage (MP defections, by-election triggers).</li>
                    <li>Incumbency data — <code>first_elected_year</code> not yet populated.</li>
                    <li>Cycle-aligned feature extracts for pre-election model runs.</li>
                  </>
                )}
            </ol>
          </div>

          <div>
            <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>What not to claim</h4>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              <li>That all models carry equal empirical support — they do not.</li>
              <li>That the By-Election Watch is a statistical prediction of vacancies.</li>
              <li>That the Scenario Simulator outputs are forecasts — they are structured planning scenarios.</li>
              <li>That Reform Threat scores reflect future vote share rather than structural signal patterns.</li>
            </ol>
          </div>
        </div>
      </Card>

      {/* ── Section 6: Detail Accordions ──────────────────────────────────── */}
      <Card title="Detailed model cards">
        <p className="portal-data-note" style={{ marginTop: 0, marginBottom: 16 }}>
          Expand a model to see its full signal basis, data gaps, interpretation guidance, and what it should not claim.
        </p>
        <div className="stack" style={{ gap: 0 }}>
          {summary.models.map((model, i) => (
            <div
              key={model.modelKey}
              style={{
                borderTop: i === 0 ? "1px solid #e5e7eb" : "none",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <AccordionItem model={model} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
