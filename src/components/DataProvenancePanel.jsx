import Card from "./Card.jsx";

function formatDate(value) {
  if (!value) return "Not reviewed";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DataProvenancePanel({
  title = "Data provenance",
  metadata,
  fallbackCopy = "Confidence, review date, and source references will appear here when dataset provenance has been recorded.",
}) {
  const quality = metadata?.quality || null;
  const sources = Array.isArray(metadata?.sources) ? metadata.sources.filter(Boolean) : [];
  const source = sources[0]?.source || null;
  const modelVersion = metadata?.modelVersion || null;
  const hasData = Boolean(quality?.confidenceLevel || quality?.lastReviewedAt || source?.name || modelVersion?.version);

  return (
    <Card title={title}>
      {hasData ? (
        <div className="portal-summary-grid">
          <div className="portal-stat">
            <span className="portal-stat__label">Confidence</span>
            <span className="portal-stat__value" style={{ fontSize: 18 }}>
              {quality?.confidenceLevel || "Not assigned"}
            </span>
            <span className="portal-stat__meta">Analyst confidence in the published intelligence output.</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Last reviewed</span>
            <span className="portal-stat__value" style={{ fontSize: 18 }}>
              {formatDate(quality?.lastReviewedAt || sources[0]?.reviewedAt || source?.last_verified_at)}
            </span>
            <span className="portal-stat__meta">Most recent recorded analyst or source verification date.</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Primary source</span>
            <span className="portal-stat__value" style={{ fontSize: 18 }}>
              {source?.name || "Source not linked"}
            </span>
            <span className="portal-stat__meta">
              {source?.publisher || "No publisher recorded"}
            </span>
          </div>
          {modelVersion && (
            <div className="portal-stat">
              <span className="portal-stat__label">Model version</span>
              <span className="portal-stat__value" style={{ fontSize: 18 }}>
                {modelVersion.version}
              </span>
              <span className="portal-stat__meta">
                {modelVersion.displayName || "Current scoring model release"}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="portal-placeholder-panel">
          <p className="portal-placeholder-panel__title">Provenance pending</p>
          <p className="portal-placeholder-panel__body">{fallbackCopy}</p>
        </div>
      )}

      {quality?.qualityNotes && (
        <div className="portal-data-note" style={{ marginTop: 16 }}>
          {quality.qualityNotes}
        </div>
      )}

      {sources.length > 1 && (
        <div className="portal-data-note" style={{ marginTop: 16 }}>
          Additional sources:{" "}
          {sources
            .slice(1)
            .map((entry) => entry?.source?.name)
            .filter(Boolean)
            .join(", ")}
        </div>
      )}
    </Card>
  );
}
