import Card from "./Card.jsx";
import { getSignalAuditForModel } from "../lib/signalAudit.js";

function prettyCoverage(value) {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function SignalAuditPanel({ modelKey }) {
  const audit = getSignalAuditForModel(modelKey);

  if (!audit.signals.length) {
    return (
      <Card title="Signal audit">
        <div className="portal-placeholder-panel">
          <p className="portal-placeholder-panel__title">Signal inventory pending</p>
          <p className="portal-placeholder-panel__body">
            This model has not yet been linked to a named signal inventory.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Signal audit">
      <div className="portal-stack-compact">
        <div className="portal-summary-grid">
          <div className="portal-stat">
            <span className="portal-stat__label">Robust signals</span>
            <span className="portal-stat__value">{audit.counts.robust}</span>
            <span className="portal-stat__meta">Historically defensible model inputs</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Noisy signals</span>
            <span className="portal-stat__value">{audit.counts.noisy}</span>
            <span className="portal-stat__meta">Useful, but less stable or less comparable</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Historical coverage</span>
            <span className="portal-stat__value">{prettyCoverage(audit.historicalCoverage)}</span>
            <span className="portal-stat__meta">Across the full signal set</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Current coverage</span>
            <span className="portal-stat__value">{prettyCoverage(audit.currentCoverage)}</span>
            <span className="portal-stat__meta">Current-data availability across signals</span>
          </div>
        </div>

        {audit.warning ? <div className="portal-data-note">{audit.warning}</div> : null}

        <div className="portal-record-list">
          {audit.signals.map((signal) => (
            <div key={signal.key} className="portal-record">
              <div className="portal-record__header">
                <div>
                  <p className="portal-record__title">{signal.label}</p>
                  <p className="portal-record__meta">{signal.description}</p>
                </div>
                <span className={`status-pill${signal.auditStatus === "robust" ? " success" : signal.auditStatus === "noisy" ? " warning" : ""}`}>
                  {signal.auditStatus.replace(/_/g, " ")}
                </span>
              </div>
              <div className="portal-record__rows">
                <div className="portal-record__row">
                  <span>Type</span>
                  <strong>{signal.signalType}</strong>
                </div>
                <div className="portal-record__row">
                  <span>Historical coverage</span>
                  <strong>{prettyCoverage(signal.historicalCoverage)}</strong>
                </div>
                <div className="portal-record__row">
                  <span>Current coverage</span>
                  <strong>{prettyCoverage(signal.currentCoverage)}</strong>
                </div>
                <div className="portal-record__row">
                  <span>Source</span>
                  <strong>{signal.dataSourceKey}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
