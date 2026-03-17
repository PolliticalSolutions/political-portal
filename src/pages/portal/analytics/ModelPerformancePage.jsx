import { useEffect, useMemo, useState } from "react";

import Card from "../../../components/Card.jsx";
import ModelConfidenceBadge from "../../../components/ModelConfidenceBadge.jsx";
import { buildModelPerformancePageSummary } from "../../../lib/modelPerformanceSummary.js";
import { getModelBacktestAvailability } from "../../../lib/modelBacktestApi.js";

function formatDate(value) {
  if (!value) return "Not yet recorded";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function toModeLabel(mode) {
  const labels = {
    standard: "Validated ranking",
    directional: "Directional model",
    watchlist: "Watchlist model",
    planning_only: "Planning tool",
  };

  return labels[mode] ?? mode;
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
      .then((result) => {
        if (!cancelled) setRuntimeBacktests(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(
    () =>
      buildModelPerformancePageSummary({
        runtimeBacktests,
      }),
    [runtimeBacktests]
  );

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Analytics Engine</span>
            <h1 className="portal-page-header__title">Model performance</h1>
            <p className="portal-page-header__subtitle">
              Internal validation surface for model maturity, signal quality, runtime confidence, and historical
              backtest readiness across the platform&apos;s main intelligence outputs.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="portal-data-section__header">
          <h2 className="portal-data-section__title">Overview</h2>
          <p className="portal-data-section__meta">
            Validation matters because these models are decision-support tools, not decorative scores. This page
            distinguishes historically defensible ranking models from directional models, watchlist models, and
            planning tools so that weaker evidence is not presented as equal to stronger evidence.
          </p>
        </div>

        <div className="portal-summary-grid">
          <div className="portal-stat">
            <span className="portal-stat__label">Validated ranking models</span>
            <span className="portal-stat__value">{summary.maturityCounts.strong}</span>
            <span className="portal-stat__meta">Best candidates for formal historical ranking validation.</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Directional models</span>
            <span className="portal-stat__value">{summary.maturityCounts.partial}</span>
            <span className="portal-stat__meta">Useful with caveats where the party system or data coverage is less stable.</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Watchlist models</span>
            <span className="portal-stat__value">{summary.maturityCounts.weak}</span>
            <span className="portal-stat__meta">Operationally useful, but historically constrained by event-driven signal gaps.</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Planning tools</span>
            <span className="portal-stat__value">{summary.maturityCounts.planningOnly}</span>
            <span className="portal-stat__meta">Governed by assumption transparency rather than classical backtesting.</span>
          </div>
        </div>
      </Card>

      <section className="stack">
        <div className="portal-data-section__header">
          <h2 className="portal-data-section__title">Model maturity summary</h2>
          <p className="portal-data-section__meta">
            Each model is shown at the level of maturity justified by its validation basis, signal set, and intended use.
          </p>
        </div>
        <div className="card-grid">
          {summary.models.map((model) => (
            <Card key={model.modelKey} className="model-performance-card">
              <div className="model-performance-card__top">
                <div>
                  <h3 className="model-performance-card__title">{model.label}</h3>
                  <p className="model-performance-card__meta">{model.maturity.label}</p>
                </div>
                <span className={`status-pill ${model.maturity.tone}`}>{toModeLabel(model.confidence.presentationMode)}</span>
              </div>
              <p className="model-performance-card__body">{model.maturity.summary}</p>
              <ModelConfidenceBadge confidence={model.confidence} />
            </Card>
          ))}
        </div>
      </section>

      <section className="stack">
        <div className="portal-data-section__header">
          <h2 className="portal-data-section__title">Detailed model cards</h2>
          <p className="portal-data-section__meta">
            Each card sets out the model question, intended universe, signal basis, historical testing boundary, and what must not be claimed.
          </p>
        </div>

        <div className="card-grid">
          {summary.models.map((model) => (
            <Card key={`${model.modelKey}-detail`} className="model-performance-card model-performance-card--detail">
              <div className="model-performance-card__top">
                <div>
                  <h3 className="model-performance-card__title">{model.label}</h3>
                  <p className="model-performance-card__meta">{model.primaryUseCase}</p>
                </div>
                <ModelConfidenceBadge confidence={model.confidence} compact />
              </div>

              <div className="model-performance-grid">
                <div className="model-performance-kv">
                  <div className="model-performance-kv__row">
                    <span>Target question</span>
                    <strong>{model.targetQuestion}</strong>
                  </div>
                  <div className="model-performance-kv__row">
                    <span>Eligible universe</span>
                    <strong>{model.eligibleUniverse}</strong>
                  </div>
                  <div className="model-performance-kv__row">
                    <span>Prediction type</span>
                    <strong>{model.predictionType.replace(/_/g, " ")}</strong>
                  </div>
                  <div className="model-performance-kv__row">
                    <span>Historical backtestability</span>
                    <strong>{model.historicalBacktestabilityLabel}</strong>
                  </div>
                  <div className="model-performance-kv__row">
                    <span>Scoring version</span>
                    <strong>{model.scoringVersion}</strong>
                  </div>
                  <div className="model-performance-kv__row">
                    <span>Score framing</span>
                    <strong>{model.scoreRange}</strong>
                  </div>
                </div>

                <div className="portal-insight-callout">
                  <p className="portal-insight-callout__title">Interpretation guidance</p>
                  <p className="portal-insight-callout__body">{model.interpretationGuidance}</p>
                </div>
              </div>

              <div className="portal-summary-grid">
                <div className="portal-stat">
                  <span className="portal-stat__label">Robust signals</span>
                  <span className="portal-stat__value">{model.signalAudit.counts.robust}</span>
                  <span className="portal-stat__meta">Historically defensible inputs in the current model inventory.</span>
                </div>
                <div className="portal-stat">
                  <span className="portal-stat__label">Noisy signals</span>
                  <span className="portal-stat__value">{model.signalAudit.counts.noisy}</span>
                  <span className="portal-stat__meta">Useful signals with weaker consistency or coverage.</span>
                </div>
                <div className="portal-stat">
                  <span className="portal-stat__label">Coverage summary</span>
                  <span className="portal-stat__value">{model.signalAudit.confidenceSummary}</span>
                  <span className="portal-stat__meta">
                    Historical: {model.signalAudit.historicalCoverage}. Current: {model.signalAudit.currentCoverage}.
                  </span>
                </div>
              </div>

              {model.signalAudit.warning ? (
                <div className="portal-insight-callout portal-insight-callout--warning">
                  <p className="portal-insight-callout__title">Signal quality warning</p>
                  <p className="portal-insight-callout__body">{model.signalAudit.warning}</p>
                </div>
              ) : null}

              <div className="model-performance-list-grid">
                <div>
                  <h4 className="model-performance-list-title">Success metrics</h4>
                  <ul className="model-performance-list">
                    {model.successMetrics.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="model-performance-list-title">Minimum signal requirements</h4>
                  <ul className="model-performance-list">
                    {model.minimumSignalRequirements.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="model-performance-list-title">Signals excluded from historical testing</h4>
                  <ul className="model-performance-list">
                    {model.excludedSignals.length ? (
                      model.excludedSignals.map((item) => <li key={item}>{item}</li>)
                    ) : (
                      <li>No specific exclusions currently defined.</li>
                    )}
                  </ul>
                </div>
                <div>
                  <h4 className="model-performance-list-title">Known weaknesses</h4>
                  <ul className="model-performance-list">
                    {model.knownWeaknesses.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="model-performance-list-grid">
                <div>
                  <h4 className="model-performance-list-title">What this model should not claim</h4>
                  <ul className="model-performance-list">
                    {model.nonClaims.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="model-performance-list-title">Validation notes</h4>
                  <p className="model-performance-note">{model.validationNotes}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="stack">
        <div className="portal-data-section__header">
          <h2 className="portal-data-section__title">Signal quality and validation caveats</h2>
          <p className="portal-data-section__meta">
            Signal mix matters. Models built mostly on electoral signals are easier to validate than models that depend on patchy local or event-driven inputs.
          </p>
        </div>

        <Card>
          <div className="table-wrap">
            <table className="table table--compact">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Signal quality</th>
                  <th>Historical coverage</th>
                  <th>Current coverage</th>
                  <th>Caveat</th>
                </tr>
              </thead>
              <tbody>
                {summary.models.map((model) => (
                  <tr key={`${model.modelKey}-audit-row`}>
                    <td>{model.label}</td>
                    <td>{model.signalAudit.confidenceSummary}</td>
                    <td>{model.signalAudit.historicalCoverage}</td>
                    <td>{model.signalAudit.currentCoverage}</td>
                    <td>{model.signalAudit.warning || "No additional caveat recorded beyond the validation spec."}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="stack">
        <div className="portal-data-section__header">
          <h2 className="portal-data-section__title">Backtest availability and run status</h2>
          <p className="portal-data-section__meta">
            This section shows what runtime evidence is currently visible in the application context. Missing runtime artifacts are shown explicitly rather than implied away.
          </p>
        </div>

        <Card>
          {loading ? (
            <p className="muted">Loading runtime backtest status…</p>
          ) : (
            <div className="portal-stack-compact">
              <div className="table-wrap">
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Status</th>
                      <th>Latest target cycle / run</th>
                      <th>Metrics available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.models.map((model) => (
                      <tr key={`${model.modelKey}-backtest-row`}>
                        <td>{model.label}</td>
                        <td>{model.backtest.title}</td>
                        <td>{formatDate(model.backtest.latestEvaluatedAt)}</td>
                        <td>{model.metricLabels.length ? model.metricLabels.join(", ") : "Not yet available in runtime context"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!runtimeBacktests.hasRuntimeMetrics ? (
                <div className="portal-placeholder-panel">
                  <p className="portal-placeholder-panel__title">Historical backtest artifacts not yet available in runtime context</p>
                  <p className="portal-placeholder-panel__body">
                    Framework and metrics are in place; cycle-aligned feature extracts and surfaced run metadata are still required before this page can show full historical validation evidence in-app.
                  </p>
                </div>
              ) : null}

              {runtimeBacktests.limitations.map((note) => (
                <div key={note} className="portal-data-note" style={{ marginTop: 0 }}>
                  {note}
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="stack">
        <div className="portal-data-section__header">
          <h2 className="portal-data-section__title">Limitations and next steps</h2>
          <p className="portal-data-section__meta">
            The current validation programme is strong enough to distinguish model maturity, but not yet complete enough to claim equal empirical support across the model set.
          </p>
        </div>

        <Card>
          <div className="model-performance-list-grid">
            <div>
              <h4 className="model-performance-list-title">What remains constrained</h4>
              <ul className="model-performance-list">
                {summary.constrainedModels.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="model-performance-list-title">What would strengthen confidence next</h4>
              <ul className="model-performance-list">
                <li>Cycle-aligned feature extracts for historical runs, especially for local and event-driven signals.</li>
                <li>Structured runtime surfacing of backtest artifacts or model run metadata for each target cycle.</li>
                <li>Better historical event coverage for by-election-style and MP-instability inputs.</li>
              </ul>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
