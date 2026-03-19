import Card from "../../../components/Card.jsx";
import { buildValidationDeliverySummary } from "../../../lib/runtimeValidationSummaries.js";

function renderMetricLabel(metricKey) {
  return String(metricKey).replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function ModelCard({ model }) {
  const metricEntries = Object.entries(model.keyValidationMetrics ?? {});

  return (
    <div className="validation-model-card">
      <div className="validation-model-card__header">
        <div>
          <h3 className="validation-model-card__title">{model.modelName}</h3>
          {model.modelCategory !== "planning_tool" && (
            <p className="validation-model-card__status">{model.modelStatus.replace(/_/g, " ")}</p>
          )}
        </div>
        <span className={`status-pill ${model.modelCategory === "validated" ? "success" : model.modelCategory === "planning_tool" ? "info" : "warning"}`}>
          {model.categoryLabel}
        </span>
      </div>

      <p className="validation-model-card__summary">{model.summaryInterpretation}</p>

      <div className="validation-model-card__meta">
        <div>
          <span className="validation-model-card__meta-label">Confidence treatment</span>
          <p>{model.confidenceTreatment}</p>
        </div>
        <div>
          <span className="validation-model-card__meta-label">Evidence completeness</span>
          <p>{model.evidenceCompletenessLabel}</p>
        </div>
      </div>

      {metricEntries.length > 0 ? (
        <div className="validation-metric-grid">
          {metricEntries.map(([metricKey, snapshot]) => (
            <div key={metricKey} className="validation-metric">
              <span className="validation-metric__label">{renderMetricLabel(metricKey)}</span>
              <span className="validation-metric__value">{snapshot.latest?.toFixed?.(3) ?? snapshot.latest}</span>
              <span className="validation-metric__meta">Average {snapshot.average?.toFixed?.(3) ?? snapshot.average}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="portal-data-note">
          No empirical validation metrics are exported for this model yet. The current status is based on governance and evidence readiness rather than fabricated hit rates.
        </div>
      )}

      <div className="validation-model-card__detail-grid">
        <div>
          <span className="validation-model-card__meta-label">Caveats</span>
          <ul className="model-performance-list">
            {model.caveats.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <span className="validation-model-card__meta-label">Evidence & provenance</span>
          <ul className="model-performance-list">
            <li>Backtest available: {model.backtestAvailable ? "Yes" : "No"}</li>
            <li>Available cycles: {model.latestAvailableCycles.length ? model.latestAvailableCycles.join(", ") : "None"}</li>
            <li>Recommended variant: {model.recommendedVariant ?? "Not applicable"}</li>
            <li>Strongest completed variant: {model.strongestVariant ?? "Not applicable"}</li>
            <li>Last updated: {model.artifactProvenance.last_updated ?? "Not available"}</li>
          </ul>
        </div>
      </div>

      {model.modelCategory === "planning_tool" && (
        <div className="portal-insight-callout portal-insight-callout--warning">
          <p className="portal-insight-callout__title">Planning tool only</p>
          <p className="portal-insight-callout__body">
            This output is explicitly non-predictive. Use it to structure campaign planning assumptions, not to imply forecast confidence.
          </p>
        </div>
      )}
    </div>
  );
}

export default function ModelPerformancePage() {
  const summary = buildValidationDeliverySummary();

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <h1 className="portal-page-header__title">Model Performance &amp; Validation</h1>
            <p className="portal-page-header__subtitle">
              Validation hierarchy for the intelligence engine. This page separates evidence-backed ranking models from directional, event-driven, and planning-only tools so weaker outputs cannot be mistaken for validated forecasts.
            </p>
          </div>
        </div>
      </Card>

      <Card title="How to read this page">
        <div className="validation-category-grid">
          {summary.categories.map((category) => (
            <div key={category.key} className="validation-category-card">
              <p className="validation-category-card__title">{category.title}</p>
              <p>{category.description}</p>
            </div>
          ))}
        </div>
      </Card>

      {summary.categories.map((category) => (
        <Card key={category.key} title={category.title}>
          <p className="portal-data-note">{category.description}</p>
          {category.models.length === 0 ? (
            <div className="portal-placeholder-panel">
              No models are currently classified in this section.
            </div>
          ) : (
            <div className="validation-model-grid">
              {category.models.map((model) => (
                <ModelCard key={model.modelKey} model={model} />
              ))}
            </div>
          )}
        </Card>
      ))}

      <Card title="Validation provenance">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Category</th>
                <th>Backtest</th>
                <th>Last updated</th>
              </tr>
            </thead>
            <tbody>
              {summary.models.map((model) => (
                <tr key={`${model.modelKey}-provenance`}>
                  <td>{model.modelName}</td>
                  <td>{model.categoryLabel}</td>
                  <td>{model.backtestAvailable ? "Available" : "Not available"}</td>
                  <td>{model.artifactProvenance.last_updated ?? "Not available"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="portal-data-note">
          Export contract version {summary.contractVersion}. Last generated {summary.generatedAt ?? "not available"}.
        </p>
      </Card>
    </div>
  );
}
