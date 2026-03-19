import runtimeValidationPayload from "../../artifacts/runtime/validation_summaries.json";

const CATEGORY_DEFINITIONS = {
  validated: {
    title: "Validated models",
    description: "Evidence-backed models with real empirical validation artifacts and usable ranking metrics.",
  },
  directional: {
    title: "Directional models",
    description: "Useful prioritisation models with partial historical comparability and clear caveats.",
  },
  watchlist_event: {
    title: "Watchlist / event models",
    description: "Event-driven intelligence layers that are operationally useful but weaker historically.",
  },
  planning_tool: {
    title: "Planning tools",
    description: "Governed scenario aids that support decision-making without claiming predictive validation.",
  },
};

const CATEGORY_LABELS = {
  validated: "Validated",
  directional: "Directional",
  watchlist_event: "Watchlist / event",
  planning_tool: "Planning tool",
};

const EVIDENCE_LABELS = {
  empirical_strongest_available: "Strongest empirical evidence available",
  partial_directional_only: "Partial directional evidence",
  limited_event_evidence: "Limited event-history evidence",
  governed_planning_only: "Governed planning-only evidence",
};

const REQUIRED_FIELDS = [
  "model_key",
  "model_name",
  "model_category",
  "model_status",
  "summary_interpretation",
  "confidence_treatment",
  "caveats",
  "key_validation_metrics",
  "evidence_completeness",
  "artifact_provenance",
];

export function normalizeValidationModel(model) {
  const safeModel = { ...(model ?? {}) };
  const missingFields = REQUIRED_FIELDS.filter((field) => safeModel[field] == null);
  const category = safeModel.model_category ?? "directional";
  return {
    modelKey: safeModel.model_key ?? "unknown_model",
    modelName: safeModel.model_name ?? "Unnamed model",
    modelCategory: category,
    categoryLabel: CATEGORY_LABELS[category] ?? category,
    modelStatus: safeModel.model_status ?? "status_unavailable",
    summaryInterpretation:
      safeModel.summary_interpretation ?? "Validation summary is not available for this model yet.",
    confidenceTreatment:
      safeModel.confidence_treatment ?? "Treat this model cautiously until stronger validation evidence is available.",
    caveats: Array.isArray(safeModel.caveats) ? safeModel.caveats : [],
    keyValidationMetrics:
      safeModel.key_validation_metrics && typeof safeModel.key_validation_metrics === "object"
        ? safeModel.key_validation_metrics
        : {},
    evidenceCompleteness: safeModel.evidence_completeness ?? "unknown",
    evidenceCompletenessLabel:
      EVIDENCE_LABELS[safeModel.evidence_completeness] ?? "Evidence status not yet classified",
    backtestAvailable: Boolean(safeModel.backtest_available),
    latestAvailableCycles: Array.isArray(safeModel.latest_available_cycles)
      ? safeModel.latest_available_cycles
      : [],
    strongestVariant: safeModel.strongest_variant ?? null,
    recommendedVariant: safeModel.recommended_variant ?? null,
    seatLevelMetadataAvailable: Boolean(safeModel.seat_level_metadata_available),
    artifactProvenance:
      safeModel.artifact_provenance && typeof safeModel.artifact_provenance === "object"
        ? safeModel.artifact_provenance
        : { generated_at: null, last_updated: null, source_artifacts: [] },
    majorWarnings: Array.isArray(safeModel.major_warnings) ? safeModel.major_warnings : [],
    missingFields,
  };
}

export function getRuntimeValidationPayload() {
  const payload = runtimeValidationPayload ?? {};
  const models = Array.isArray(payload.models) ? payload.models.map(normalizeValidationModel) : [];
  return {
    contractVersion: payload.contract_version ?? 0,
    generatedAt: payload.generated_at ?? null,
    models,
  };
}

export function buildValidationDeliverySummary() {
  const payload = getRuntimeValidationPayload();
  const modelsByCategory = Object.fromEntries(
    Object.keys(CATEGORY_DEFINITIONS).map((category) => [category, []]),
  );

  payload.models.forEach((model) => {
    if (!modelsByCategory[model.modelCategory]) {
      modelsByCategory[model.modelCategory] = [];
    }
    modelsByCategory[model.modelCategory].push(model);
  });

  return {
    ...payload,
    categories: Object.entries(CATEGORY_DEFINITIONS).map(([key, definition]) => ({
      key,
      ...definition,
      models: modelsByCategory[key] ?? [],
    })),
  };
}
