import Card from "./Card.jsx";

function formatWeight(weight) {
  return `${Math.round(Number(weight || 0) * 100)}%`;
}

export default function ScoringMethodologyPanel({ model, title = "Scoring methodology" }) {
  if (!model) return null;

  return (
    <Card title={title}>
      <div className="portal-stack-compact">
        <div className="portal-data-note" style={{ marginTop: 0 }}>
          <strong>{model.title}</strong> uses a structured {model.scoreRange} scoring range. {model.explanationText}
        </div>

        <div className="portal-summary-grid">
          <div className="portal-stat">
            <span className="portal-stat__label">Model version</span>
            <span className="portal-stat__value" style={{ fontSize: 18 }}>
              {model.version}
            </span>
            <span className="portal-stat__meta">Current scoring definition in the frontend intelligence layer.</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Score range</span>
            <span className="portal-stat__value" style={{ fontSize: 18 }}>
              {model.scoreRange}
            </span>
            <span className="portal-stat__meta">Higher scores indicate greater risk or exposure.</span>
          </div>
        </div>

        <div className="portal-methodology-list">
          {model.components.map((component) => (
            <div key={component.key} className="portal-methodology-item">
              <div className="portal-methodology-item__header">
                <div>
                  <p className="portal-record__title">{component.label}</p>
                  <p className="portal-record__meta">{component.description}</p>
                </div>
                <span className="status-pill warning">{formatWeight(component.weight)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="portal-insight-callout">
          <p className="portal-insight-callout__title">How to interpret the score</p>
          <p className="portal-insight-callout__body">{model.interpretation}</p>
        </div>
      </div>
    </Card>
  );
}
