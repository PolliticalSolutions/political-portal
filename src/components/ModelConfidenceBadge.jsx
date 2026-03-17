function toBadgeLabel(confidenceLevel) {
  if (confidenceLevel === "insufficient_data") return "Insufficient data";
  return `${confidenceLevel.charAt(0).toUpperCase()}${confidenceLevel.slice(1)} confidence`;
}

function toModeLabel(mode) {
  const labels = {
    standard: "Standard presentation",
    directional: "Directional assessment",
    watchlist: "Watchlist mode",
    planning_only: "Planning tool",
  };
  return labels[mode] || mode;
}

export default function ModelConfidenceBadge({ confidence, compact = false }) {
  if (!confidence) return null;

  const toneClass =
    confidence.confidenceLevel === "high"
      ? "success"
      : confidence.confidenceLevel === "medium"
        ? "info"
        : confidence.confidenceLevel === "low"
          ? "warning"
          : "danger";

  return (
    <div className={`portal-confidence-panel${compact ? " portal-confidence-panel--compact" : ""}`}>
      <div className="portal-confidence-panel__header">
        <span className={`status-pill ${toneClass}`}>{toBadgeLabel(confidence.confidenceLevel)}</span>
        <span className="portal-confidence-panel__mode">{toModeLabel(confidence.presentationMode)}</span>
      </div>
      <p className="portal-confidence-panel__body">{confidence.summaryText}</p>
      {!compact && (
        <p className="portal-confidence-panel__meta">
          {confidence.coverageSummary}. {confidence.recommendedPresentation}
        </p>
      )}
    </div>
  );
}
