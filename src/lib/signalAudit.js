import { getCanonicalValidationKey, getModelValidationSpec } from "../config/modelValidationSpecs.js";
import { getScoringModel } from "../config/scoringModels.js";
import { getIntelligenceSignal } from "../config/intelligenceSignals.js";

const STATUS_BUCKETS = ["robust", "noisy", "decorative", "insufficient_data", "pending_review"];
const COVERAGE_SCORES = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

function averageCoverage(signals, field) {
  if (!signals.length) return "unknown";
  const total = signals.reduce((sum, signal) => sum + (COVERAGE_SCORES[signal[field]] ?? 0), 0);
  const avg = total / signals.length;
  if (avg >= 2.5) return "high";
  if (avg >= 1.5) return "medium";
  if (avg > 0) return "low";
  return "unknown";
}

export function getSignalAuditForModel(modelKey) {
  const canonicalKey = getCanonicalValidationKey(modelKey);
  const model = getScoringModel(canonicalKey);
  const validationSpec = getModelValidationSpec(canonicalKey);
  const signalKeys = [
    ...new Set([
      ...(model?.signalKeys ?? []),
      ...(validationSpec?.minimumSignalRequirements ?? []),
      ...(validationSpec?.optionalSignals ?? []),
    ]),
  ];
  const signals = signalKeys
    .map((signalKey) => getIntelligenceSignal(signalKey))
    .filter(Boolean);

  const counts = STATUS_BUCKETS.reduce((accumulator, status) => {
    accumulator[status] = signals.filter((signal) => signal.auditStatus === status).length;
    return accumulator;
  }, {});

  const robustRatio = signals.length ? counts.robust / signals.length : 0;
  const confidenceSummary =
    counts.insufficient_data > 0
      ? "limited"
      : robustRatio >= 0.6
        ? "strong"
        : robustRatio >= 0.3
          ? "mixed"
          : "weak";

  return {
    modelKey: canonicalKey,
    modelTitle: model?.title || validationSpec?.label || canonicalKey,
    signals,
    counts,
    historicalCoverage: averageCoverage(signals, "historicalCoverage"),
    currentCoverage: averageCoverage(signals, "currentCoverage"),
    confidenceSummary,
    warning:
      counts.insufficient_data > 0 || counts.noisy >= Math.max(2, counts.robust)
        ? "This model currently relies on noisy or incomplete signals and should be treated as directional rather than fully validated."
        : "",
  };
}
