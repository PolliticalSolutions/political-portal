import Card from "./Card.jsx";

export default function ThreatMethodologyDisclosure({
  title = "How this works",
  summary,
  signals = [],
  disclaimer,
  topSeatName,
  topSeatExplanation,
}) {
  return (
    <Card>
      <details className="portal-disclosure" open>
        <summary className="portal-disclosure__summary">{title}</summary>
        <div className="portal-disclosure__body">
          {summary && <p className="portal-disclosure__text">{summary}</p>}
          {signals.length > 0 && (
            <div className="portal-disclosure__signals">
              {signals.map((signal) => (
                <div key={signal.label} className="portal-disclosure__signal">
                  <strong>{signal.label}</strong>
                  <span>{signal.body}</span>
                </div>
              ))}
            </div>
          )}
          {disclaimer && (
            <div className="portal-insight-callout portal-insight-callout--warning" style={{ marginTop: 16 }}>
              <p className="portal-insight-callout__title">Analytical use</p>
              <p className="portal-insight-callout__body">{disclaimer}</p>
            </div>
          )}
          {topSeatName && topSeatExplanation && (
            <div className="portal-data-note" style={{ marginTop: 16 }}>
              <strong>Why {topSeatName} ranks highly:</strong> {topSeatExplanation}
            </div>
          )}
        </div>
      </details>
    </Card>
  );
}

