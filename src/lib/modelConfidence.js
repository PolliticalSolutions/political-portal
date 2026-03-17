import { getIntelligenceSignal } from "../config/intelligenceSignals.js";
import { getCanonicalValidationKey, getModelValidationSpec } from "../config/modelValidationSpecs.js";
import { getScoringModel } from "../config/scoringModels.js";
import { getModelPresentationState } from "./modelPresentationState.js";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toSentenceCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getModelConfidence({ modelKey, availableSignalKeys, missingSignalKeys = [] }) {
  const canonicalKey = getCanonicalValidationKey(modelKey);
  const spec = getModelValidationSpec(canonicalKey);
  const scoringModel = getScoringModel(canonicalKey);

  const declaredSignals = unique([
    ...(scoringModel?.signalKeys ?? []),
    ...(spec?.minimumSignalRequirements ?? []),
    ...(spec?.optionalSignals ?? []),
  ]);

  const availableSet = new Set(
    unique(availableSignalKeys && availableSignalKeys.length ? availableSignalKeys : declaredSignals)
  );
  const explicitMissingSet = new Set(unique(missingSignalKeys));
  const missingCriticalSignals = (spec?.minimumSignalRequirements ?? []).filter(
    (signalKey) => !availableSet.has(signalKey) || explicitMissingSet.has(signalKey)
  );
  const missingSignals = unique([
    ...declaredSignals.filter((signalKey) => !availableSet.has(signalKey)),
    ...explicitMissingSet,
  ]);

  const availableSignals = declaredSignals
    .filter((signalKey) => availableSet.has(signalKey))
    .map((signalKey) => getIntelligenceSignal(signalKey))
    .filter(Boolean);

  const robustSignalCount = availableSignals.filter((signal) => signal.auditStatus === "robust").length;
  const noisySignalCount = availableSignals.filter((signal) => signal.auditStatus === "noisy").length;
  const insufficientDataSignalCount = availableSignals.filter(
    (signal) => signal.auditStatus === "insufficient_data"
  ).length;

  let confidenceLevel = "low";
  const confidenceReasons = [];

  if (canonicalKey === "scenarioSimulator") {
    confidenceLevel = missingCriticalSignals.length > 0 ? "insufficient_data" : "low";
    confidenceReasons.push("Planning tool based on simplified assumptions.");
  } else if (missingCriticalSignals.length >= Math.max(1, Math.ceil((spec?.minimumSignalRequirements?.length ?? 1) / 2))) {
    confidenceLevel = "insufficient_data";
    confidenceReasons.push(`Missing critical signals: ${missingCriticalSignals.join(", ")}.`);
  } else if (canonicalKey === "vulnerability") {
    confidenceLevel = robustSignalCount >= 3 ? "high" : "medium";
    confidenceReasons.push(
      robustSignalCount >= 3
        ? "Based primarily on robust electoral ranking signals."
        : "Ranking signal present, but some support signals are partial."
    );
  } else if (canonicalKey === "reformThreat") {
    confidenceLevel = missingCriticalSignals.length > 0 ? "low" : "medium";
    confidenceReasons.push("Directional assessment with partial historical comparability.");
  } else if (canonicalKey === "byElectionRisk") {
    confidenceLevel = missingCriticalSignals.length > 0 ? "insufficient_data" : "low";
    confidenceReasons.push("Indicative watchlist based on incomplete event-history coverage.");
  }

  if (missingCriticalSignals.length > 0 && confidenceLevel !== "insufficient_data") {
    confidenceLevel = "low";
    confidenceReasons.push(`Missing critical signals reduce model confidence: ${missingCriticalSignals.join(", ")}.`);
  }

  if (insufficientDataSignalCount > 0 && canonicalKey !== "vulnerability" && confidenceLevel === "medium") {
    confidenceLevel = "low";
    confidenceReasons.push("One or more inputs have insufficient historical or current coverage.");
  }

  if ((spec?.historicalBacktestability === "partial" || spec?.historicalBacktestability === "weak") && confidenceLevel === "high") {
    confidenceLevel = "medium";
  }

  if (spec?.historicalBacktestability === "weak" && confidenceLevel === "medium") {
    confidenceLevel = "low";
  }

  const presentationMode = getModelPresentationState({ modelKey: canonicalKey, confidenceLevel });
  const coverageSummary = `${robustSignalCount} robust, ${noisySignalCount} noisy, ${insufficientDataSignalCount} insufficient-data signals available`;

  return {
    confidenceLevel,
    confidenceReasons,
    missingCriticalSignals,
    noisySignalCount,
    robustSignalCount,
    insufficientDataSignalCount,
    coverageSummary,
    presentationMode,
    historicalBacktestability: spec?.historicalBacktestability || "unknown",
    recommendedPresentation: spec?.recommendedPresentation || "",
    predictionType: spec?.predictionType || "",
    label: spec?.label || scoringModel?.title || canonicalKey,
    summaryText:
      confidenceReasons[0] ||
      `${toSentenceCase(confidenceLevel)} confidence — ${toSentenceCase(presentationMode)} presentation.`,
    missingSignals,
  };
}
