import { getScoringModel } from "../config/scoringModels.js";
import { getModelValidationSpec } from "../config/modelValidationSpecs.js";

const REQUIRED_SPEC_FIELDS = [
  "modelKey",
  "label",
  "targetQuestion",
  "eligibleUniverse",
  "predictionType",
  "primaryUseCase",
  "successMetrics",
  "minimumSignalRequirements",
  "signalsExcludedFromHistoricalTesting",
  "historicalBacktestability",
  "knownWeaknesses",
  "interpretationGuidance",
  "nonClaims",
  "recommendedPresentation",
  "validationNotes",
];

export function validateModelValidationSpec(spec) {
  const missingFields = REQUIRED_SPEC_FIELDS.filter((field) => {
    const value = spec?.[field];
    return value == null || (Array.isArray(value) ? false : value === "");
  });

  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

export function getModelValidationSummary(modelKey) {
  const spec = getModelValidationSpec(modelKey);
  const model = getScoringModel(modelKey);
  const validation = validateModelValidationSpec(spec);

  return {
    spec,
    scoringModel: model,
    validation,
    alignedSignalKeys:
      spec && model
        ? spec.minimumSignalRequirements.every((signalKey) =>
            (model.signalKeys ?? []).includes(signalKey)
          )
        : false,
  };
}
