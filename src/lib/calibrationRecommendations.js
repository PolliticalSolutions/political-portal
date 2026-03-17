import { getCanonicalValidationKey, getModelValidationSpec } from "../config/modelValidationSpecs.js";
import { getScoringModel } from "../config/scoringModels.js";
import { getModelConfidence } from "./modelConfidence.js";
import { getSignalAuditForModel } from "./signalAudit.js";

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function createRecommendation({
  modelKey,
  recommendationLevel,
  category,
  title,
  summary,
  reasoning,
  suggestedAction,
  priority = "medium",
}) {
  return {
    modelKey,
    recommendationLevel,
    category,
    title,
    summary,
    reasoning,
    suggestedAction,
    priority,
  };
}

function getDeclaredSignals({ scoringModel, validationSpec }) {
  return unique([
    ...(scoringModel?.signalKeys ?? []),
    ...(validationSpec?.minimumSignalRequirements ?? []),
    ...(validationSpec?.optionalSignals ?? []),
  ]);
}

export function getCalibrationRecommendations({
  modelKey,
  runtimeBacktestsByModel = {},
  availableSignalKeys,
  missingSignalKeys = [],
} = {}) {
  const canonicalKey = getCanonicalValidationKey(modelKey);
  const validationSpec = getModelValidationSpec(canonicalKey);
  const scoringModel = getScoringModel(canonicalKey);
  const declaredSignals = getDeclaredSignals({ scoringModel, validationSpec });
  const confidence = getModelConfidence({
    modelKey: canonicalKey,
    availableSignalKeys: availableSignalKeys ?? declaredSignals,
    missingSignalKeys,
  });
  const signalAudit = getSignalAuditForModel(canonicalKey);
  const runtimeBacktest = runtimeBacktestsByModel?.[canonicalKey] ?? null;
  const recommendations = [];

  if (!validationSpec) {
    return {
      modelKey: canonicalKey,
      overallPosture: "review",
      immediateNextStep: "Define model validation metadata before making calibration recommendations.",
      topIssues: ["Validation metadata missing"],
      strongestRetainedSignals: [],
      keyDataGaps: ["Validation specification not found"],
      recommendations: [
        createRecommendation({
          modelKey: canonicalKey,
          recommendationLevel: "review",
          category: "presentation_risk",
          title: "Validation metadata missing",
          summary: "Calibration guidance cannot be defended until the model has a formal validation specification.",
          reasoning: "No validation spec was found for this model key.",
          suggestedAction: "Add a model validation specification before changing weighting or presentation.",
          priority: "high",
        }),
      ],
    };
  }

  if (canonicalKey === "scenarioSimulator") {
    recommendations.push(
      createRecommendation({
        modelKey: canonicalKey,
        recommendationLevel: "not_applicable",
        category: "presentation_risk",
        title: "Treat as governance rather than calibration",
        summary: "The scenario simulator should be governed through assumption clarity, not ranked as a calibratable prediction model.",
        reasoning: "The validation spec marks this as a planning tool with historical backtesting not applicable.",
        suggestedAction: "Keep assumption disclosure prominent and avoid presenting outputs as empirically calibrated.",
        priority: "high",
      })
    );

    if (confidence.missingCriticalSignals.length > 0) {
      recommendations.push(
        createRecommendation({
          modelKey: canonicalKey,
          recommendationLevel: "data_gap",
          category: "data_completeness",
          title: "Baseline simulator inputs incomplete",
          summary: "The simulator loses credibility quickly if core baseline movement signals are unavailable.",
          reasoning: `Missing critical planning inputs: ${confidence.missingCriticalSignals.join(", ")}.`,
          suggestedAction: "Ensure baseline election movement inputs are always present before exposing projections.",
          priority: "high",
        })
      );
    }
  } else {
    if (signalAudit.counts.robust > 0) {
      const robustSignals = signalAudit.signals
        .filter((signal) => signal.auditStatus === "robust")
        .map((signal) => signal.label);
      recommendations.push(
        createRecommendation({
          modelKey: canonicalKey,
          recommendationLevel: "retain",
          category: "signal_quality",
          title: "Retain the core robust signal spine",
          summary: "Robust electoral signals remain the strongest foundation for model interpretation and future tuning.",
          reasoning: `Robust signals currently available: ${robustSignals.join(", ")}.`,
          suggestedAction: "Preserve core electoral ranking signals as the reference layer before adjusting secondary enrichments.",
          priority: canonicalKey === "vulnerability" ? "high" : "medium",
        })
      );
    }

    if (signalAudit.counts.noisy > 0) {
      const noisySignals = signalAudit.signals
        .filter((signal) => signal.auditStatus === "noisy")
        .map((signal) => signal.label);
      recommendations.push(
        createRecommendation({
          modelKey: canonicalKey,
          recommendationLevel: "review",
          category: "weighting_risk",
          title: "Review noisy supporting signals before increasing their influence",
          summary: "Noisy enrichments can still add value, but they should not dominate model interpretation or future weight changes.",
          reasoning: `Signals currently marked noisy: ${noisySignals.join(", ")}.`,
          suggestedAction: "Keep noisy enrichments secondary until broader cycle coverage or cleaner local data exists.",
          priority: canonicalKey === "reformThreat" ? "high" : "medium",
        })
      );
    }

    if (signalAudit.counts.insufficient_data > 0 || confidence.missingCriticalSignals.length > 0) {
      const gaps = unique([
        ...signalAudit.signals
          .filter((signal) => signal.auditStatus === "insufficient_data")
          .map((signal) => signal.label),
        ...confidence.missingCriticalSignals,
      ]);
      recommendations.push(
        createRecommendation({
          modelKey: canonicalKey,
          recommendationLevel: "data_gap",
          category: "data_completeness",
          title: "Close critical data gaps before stronger claims are made",
          summary: "Incomplete signals should drive data-enrichment work before any attempt at stronger calibration or presentation uplift.",
          reasoning: `Current high-impact gaps: ${gaps.join(", ")}.`,
          suggestedAction: "Prioritise structured historical and current coverage for incomplete signals before tuning weights further.",
          priority: "high",
        })
      );
    }
  }

  if (!runtimeBacktest?.hasRuntimeMetrics && validationSpec.historicalBacktestability !== "not_applicable") {
    recommendations.push(
      createRecommendation({
        modelKey: canonicalKey,
        recommendationLevel: validationSpec.historicalBacktestability === "strong" ? "review" : "data_gap",
        category: "historical_validation",
        title: "Backtest evidence still needs to be surfaced in runtime",
        summary: "The validation framework exists, but this model does not yet have runtime-visible backtest evidence.",
        reasoning:
          "No runtime backtest rows are currently available for this model, so calibration decisions would rely on metadata and audit judgement rather than surfaced validation runs.",
        suggestedAction: "Surface target-cycle backtest outputs or run metadata before making stronger empirical calibration claims.",
        priority: validationSpec.historicalBacktestability === "strong" ? "high" : "medium",
      })
    );
  }

  if (canonicalKey === "vulnerability") {
    recommendations.push(
      createRecommendation({
        modelKey: canonicalKey,
        recommendationLevel: "review",
        category: "historical_validation",
        title: "Improve cycle-aligned enrichment before deeper tuning",
        summary: "The core ranking spine is defensible, but local and demographic enrichments should be tightened before weight tuning goes further.",
        reasoning:
          "Vulnerability is the strongest historical candidate, but its validation spec still treats demographic and anti-incumbent signals as supporting context rather than decisive evidence.",
        suggestedAction: "Backtest the core ranking layer first, then reintroduce secondary enrichments with clearer cycle-aligned evidence.",
        priority: "medium",
      })
    );
  }

  if (canonicalKey === "reformThreat") {
    recommendations.push(
      createRecommendation({
        modelKey: canonicalKey,
        recommendationLevel: "review",
        category: "presentation_risk",
        title: "Keep Reform Threat positioned as directional",
        summary: "This model should not move into a high-certainty presentation until analogue quality and local Reform signal coverage improve.",
        reasoning:
          "Partial historical backtestability and noisy local/current-condition signals make overconfident presentation a bigger risk than under-tuning.",
        suggestedAction: "Retain directional framing and review any weighting that leans too heavily on current Reform share without stronger analogue support.",
        priority: "high",
      })
    );
  }

  if (canonicalKey === "byElectionRisk") {
    recommendations.push(
      createRecommendation({
        modelKey: canonicalKey,
        recommendationLevel: "downgrade",
        category: "presentation_risk",
        title: "Do not strengthen by-election claims ahead of event-history enrichment",
        summary: "The by-election model remains most defensible as a watchlist and contingency tool, not a predictive validator.",
        reasoning:
          "Weak historical backtestability, insufficient-data event signals, and low confidence all point towards constrained use rather than stronger explanatory weighting.",
        suggestedAction: "Keep watchlist framing in place and prioritise structured event-history enrichment before revisiting score ambition.",
        priority: "high",
      })
    );
  }

  const sorted = [...recommendations].sort((left, right) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return (priorityOrder[left.priority] ?? 3) - (priorityOrder[right.priority] ?? 3);
  });

  const strongestRetainedSignals = signalAudit.signals
    .filter((signal) => signal.auditStatus === "robust")
    .map((signal) => signal.label)
    .slice(0, 3);
  const keyDataGaps = unique([
    ...signalAudit.signals
      .filter((signal) => signal.auditStatus === "insufficient_data")
      .map((signal) => signal.label),
    ...confidence.missingCriticalSignals,
  ]).slice(0, 3);
  const overallPosture =
    sorted.find((item) => item.recommendationLevel === "data_gap")?.recommendationLevel ??
    sorted.find((item) => item.recommendationLevel === "downgrade")?.recommendationLevel ??
    sorted.find((item) => item.recommendationLevel === "review")?.recommendationLevel ??
    sorted[0]?.recommendationLevel ??
    "retain";

  return {
    modelKey: canonicalKey,
    overallPosture,
    immediateNextStep:
      sorted.find((item) => item.priority === "high")?.suggestedAction ??
      sorted[0]?.suggestedAction ??
      "Maintain current framing until additional evidence is available.",
    topIssues: sorted.slice(0, 3).map((item) => item.title),
    strongestRetainedSignals,
    keyDataGaps,
    recommendations: sorted,
  };
}
