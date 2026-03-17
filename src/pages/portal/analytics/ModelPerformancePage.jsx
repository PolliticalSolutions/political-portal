import { useEffect, useMemo, useState } from "react";
import Card from "../../../components/Card.jsx";
import ModelConfidenceBadge from "../../../components/ModelConfidenceBadge.jsx";
import { getScoringModel } from "../../../config/scoringModels.js";
import { getModelConfidence } from "../../../lib/modelConfidence.js";
import { getModelPerformanceSummaries } from "../../../lib/modelPerformanceApi.js";

const MODELS = ["vulnerability", "reformThreat", "byElectionRisk"];

function formatDate(value) {
  if (!value) return "No evaluation recorded";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ModelPerformancePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getModelPerformanceSummaries()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const rowsByModel = useMemo(() => {
    const grouped = {};
    rows.forEach((row) => {
      if (!grouped[row.model_key]) grouped[row.model_key] = [];
      grouped[row.model_key].push(row);
    });
    return grouped;
  }, [rows]);

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Analytics Engine</span>
            <h1 className="portal-page-header__title">Model performance</h1>
            <p className="portal-page-header__subtitle">
              Review backtesting and validation coverage for the core intelligence models. Where no evaluation
              records exist yet, the page remains explicit about the data still required.
            </p>
          </div>
        </div>
      </Card>

      <div className="portal-insight-callout">
        <p className="portal-insight-callout__title">Validation standard</p>
        <p className="portal-insight-callout__body">
          This page is intended to show how well each model has performed against historical outcomes. Until
          backtest data is loaded, treat the cards below as structured placeholders rather than evidence of
          validated predictive performance.
        </p>
      </div>

      <div className="card-grid">
        {MODELS.map((modelKey) => {
          const model = getScoringModel(modelKey);
          const metrics = rowsByModel[modelKey] || [];
          const confidence = getModelConfidence({
            modelKey,
            availableSignalKeys: model?.signalKeys ?? [],
          });

          return (
            <Card key={modelKey} title={model?.title || modelKey}>
              <ModelConfidenceBadge confidence={confidence} compact />
              {loading ? (
                <p className="muted">Loading model performance…</p>
              ) : metrics.length > 0 ? (
                <div className="portal-stack-compact">
                  <div className="portal-data-note" style={{ marginTop: 0 }}>
                    Validation framing: {confidence.summaryText}
                  </div>
                  <div className="portal-summary-grid">
                    <div className="portal-stat">
                      <span className="portal-stat__label">Metrics loaded</span>
                      <span className="portal-stat__value">{metrics.length}</span>
                      <span className="portal-stat__meta">Current validation measures available.</span>
                    </div>
                    <div className="portal-stat">
                      <span className="portal-stat__label">Last evaluated</span>
                      <span className="portal-stat__value" style={{ fontSize: 18 }}>
                        {formatDate(metrics[0]?.last_evaluated_at)}
                      </span>
                      <span className="portal-stat__meta">Most recent recorded backtest run.</span>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table className="table table--compact">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Value</th>
                          <th>Sample</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.map((metric) => (
                          <tr key={`${metric.model_key}-${metric.metric_name}`}>
                            <td>{metric.metric_name}</td>
                            <td>{metric.metric_value}</td>
                            <td>{metric.sample_size || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="portal-placeholder-panel">
                  <p className="portal-placeholder-panel__title">Backtest data required</p>
                  <p className="portal-placeholder-panel__body">
                    No evaluation rows were found for this model. Add historical performance data to
                    <code> model_performance_backtests </code>
                    to show calibration, hit-rate, or ranking quality metrics here.
                  </p>
                  <p className="portal-placeholder-panel__body">
                    {confidence.summaryText}
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
