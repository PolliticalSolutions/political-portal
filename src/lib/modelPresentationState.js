import { getCanonicalValidationKey, getModelValidationSpec } from "../config/modelValidationSpecs.js";

export function getModelPresentationState({ modelKey, confidenceLevel }) {
  const canonicalKey = getCanonicalValidationKey(modelKey);
  const spec = getModelValidationSpec(canonicalKey);

  if (canonicalKey === "scenarioSimulator") {
    return "planning_only";
  }

  if (canonicalKey === "byElectionRisk") {
    return "watchlist";
  }

  if (canonicalKey === "reformThreat") {
    return "directional";
  }

  if (canonicalKey === "vulnerability" && confidenceLevel === "high") {
    return "standard";
  }

  if (spec?.predictionType === "ranking") {
    return confidenceLevel === "insufficient_data" ? "directional" : "standard";
  }

  return "directional";
}
