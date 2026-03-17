import { getIntelligenceSignal } from "../config/intelligenceSignals.js";
import { getCanonicalValidationKey, getModelValidationSpec } from "../config/modelValidationSpecs.js";
import { getScoringModel } from "../config/scoringModels.js";
import { getModelCalibrationSummary } from "./modelCalibrationSummary.js";
import { getModelConfidence } from "./modelConfidence.js";
import { getSignalAuditForModel } from "./signalAudit.js";

const MODEL_ORDER = ["vulnerability", "reformThreat", "byElectionRisk", "scenarioSimulator"];

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toSignalLabel(signalKey) {
  return getIntelligenceSignal(signalKey)?.label ?? signalKey;
}

function toMetricLabel(metricName) {
  return String(metricName || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getMaturitySummary(spec) {
  if (!spec) {
    return {
      label: "Validation metadata pending",
      tone: "warning",
      summary: "Model validation framing has not yet been defined.",
    };
  }

  if (spec.historicalBacktestability === "strong") {
    return {
      label: "Strong validation candidate",
      tone: "success",
      summary: "Historically defensible ranking model with clear success metrics.",
    };
  }

  if (spec.historicalBacktestability === "partial") {
    return {
      label: "Partial historical validation",
      tone: "info",
      summary: "Useful directional model with caveated historical comparability.",
    };
  }

  if (spec.historicalBacktestability === "weak") {
    return {
      label: "Watchlist-grade validation",
      tone: "warning",
      summary: "Operationally useful, but historical evidence remains structurally weak.",
    };
  }

  return {
    label: "Planning tool only",
    tone: "info",
    summary: "Designed for structured scenario planning rather than historical backtesting.",
  };
}

function getBacktestStatus({ modelKey, spec, runtimeBacktestsByModel }) {
  if (spec?.historicalBacktestability === "not_applicable") {
    return {
      state: "not_applicable",
      title: "Historical backtesting not applicable",
      body: "This model is governed as a planning tool. The right standard is assumption transparency and deterministic behaviour, not historical hit-rate testing.",
      latestEvaluatedAt: null,
      metricNames: [],
      metricCount: 0,
      notes: [],
    };
  }

  const runtimeModel = runtimeBacktestsByModel?.[modelKey] ?? null;
  if (runtimeModel?.hasRuntimeMetrics) {
    return {
      state: "available",
      title: "Runtime backtest metrics available",
      body: "Runtime metric rows were found for this model. Treat them as evidence of recorded validation work, not as a complete substitute for full cycle-aligned artifact review.",
      latestEvaluatedAt: runtimeModel.latestEvaluatedAt,
      metricNames: runtimeModel.metricNames,
      metricCount: runtimeModel.metricCount,
      notes: runtimeModel.notes,
    };
  }

  return {
    state: "missing",
    title: "Historical backtest artifacts not yet available in runtime context",
    body: "Framework and metrics are in place; cycle-aligned feature extracts and runtime backtest summaries are still required for this model.",
    latestEvaluatedAt: null,
    metricNames: [],
    metricCount: 0,
    notes: [],
  };
}

export function getModelPerformanceModels() {
  return MODEL_ORDER;
}

export function buildModelPerformanceSummary({ modelKey, runtimeBacktestsByModel = {} }) {
  const canonicalKey = getCanonicalValidationKey(modelKey);
  const scoringModel = getScoringModel(canonicalKey);
  const validationSpec = getModelValidationSpec(canonicalKey);
  const declaredSignals = unique([
    ...(scoringModel?.signalKeys ?? []),
    ...(validationSpec?.minimumSignalRequirements ?? []),
    ...(validationSpec?.optionalSignals ?? []),
  ]);
  const confidence = getModelConfidence({
    modelKey: canonicalKey,
    availableSignalKeys: declaredSignals,
  });
  const signalAudit = getSignalAuditForModel(canonicalKey);
  const maturity = getMaturitySummary(validationSpec);
  const backtest = getBacktestStatus({
    modelKey: canonicalKey,
    spec: validationSpec,
    runtimeBacktestsByModel,
  });
  const calibration = getModelCalibrationSummary({
    modelKey: canonicalKey,
    runtimeBacktestsByModel,
    availableSignalKeys: declaredSignals,
  });

  return {
    modelKey: canonicalKey,
    label: validationSpec?.label ?? scoringModel?.title ?? canonicalKey,
    description: scoringModel?.description ?? validationSpec?.validationNotes ?? "",
    scoreRange: scoringModel?.scoreRange ?? (validationSpec?.predictionType === "scenario_projection" ? "Planning scenarios" : "Not specified"),
    targetQuestion: validationSpec?.targetQuestion ?? "",
    eligibleUniverse: validationSpec?.eligibleUniverse ?? "",
    predictionType: validationSpec?.predictionType ?? "",
    primaryUseCase: validationSpec?.primaryUseCase ?? "",
    successMetrics: validationSpec?.successMetrics ?? [],
    minimumSignalRequirements: (validationSpec?.minimumSignalRequirements ?? []).map(toSignalLabel),
    optionalSignals: (validationSpec?.optionalSignals ?? []).map(toSignalLabel),
    excludedSignals: (validationSpec?.signalsExcludedFromHistoricalTesting ?? []).map((signal) =>
      signal.includes(" ") ? signal : toSignalLabel(signal)
    ),
    knownWeaknesses: validationSpec?.knownWeaknesses ?? [],
    interpretationGuidance: validationSpec?.interpretationGuidance ?? "",
    nonClaims: validationSpec?.nonClaims ?? [],
    validationNotes: validationSpec?.validationNotes ?? "",
    historicalBacktestability: validationSpec?.historicalBacktestability ?? "unknown",
    historicalBacktestabilityLabel: titleCase(validationSpec?.historicalBacktestability ?? "unknown"),
    confidence,
    signalAudit,
    maturity,
    backtest,
    calibration,
    scoringVersion: scoringModel?.version ?? "Validation spec only",
    metricLabels: backtest.metricNames.map(toMetricLabel),
  };
}

export function buildModelPerformancePageSummary({ runtimeBacktests }) {
  const runtimeBacktestsByModel = runtimeBacktests?.models ?? {};
  const models = MODEL_ORDER.map((modelKey) =>
    buildModelPerformanceSummary({
      modelKey,
      runtimeBacktestsByModel,
    })
  );

  return {
    models,
    maturityCounts: {
      strong: models.filter((model) => model.historicalBacktestability === "strong").length,
      partial: models.filter((model) => model.historicalBacktestability === "partial").length,
      weak: models.filter((model) => model.historicalBacktestability === "weak").length,
      planningOnly: models.filter((model) => model.historicalBacktestability === "not_applicable").length,
    },
    runtimeBacktests,
    strongestSignalModels: models.filter((model) => model.signalAudit.confidenceSummary === "strong").map((model) => model.label),
    constrainedModels: models
      .filter((model) => model.confidence.confidenceLevel === "low" || model.confidence.confidenceLevel === "insufficient_data")
      .map((model) => model.label),
    crossModelPriorities: {
      bestTuningCandidate:
        models.find((model) => model.historicalBacktestability === "strong")?.label ??
        "No strong historical tuning candidate currently defined",
      overInterpretationRisk: models
        .filter((model) => ["review", "downgrade", "data_gap"].includes(model.calibration.overallPosture))
        .map((model) => model.label),
      keyDataGaps: [
        ...new Set(models.flatMap((model) => model.calibration.keyDataGaps).filter(Boolean)),
      ].slice(0, 5),
      strongestRetainSignals: [
        ...new Set(models.flatMap((model) => model.calibration.strongestRetainedSignals).filter(Boolean)),
      ].slice(0, 5),
    },
  };
}
