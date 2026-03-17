import { supabase } from "./supabaseClient.js";

function normaliseConfidenceLevel(value) {
  if (!value) return "";
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function getEntityQualityMetadata(tableName, id) {
  if (!tableName || !id) return null;

  const { data, error } = await supabase
    .from(tableName)
    .select("data_confidence_level, data_last_reviewed_at, data_quality_notes")
    .eq("id", id)
    .single();

  if (error) return null;

  return {
    confidenceLevel: normaliseConfidenceLevel(data?.data_confidence_level),
    lastReviewedAt: data?.data_last_reviewed_at || "",
    qualityNotes: data?.data_quality_notes || "",
  };
}

export async function getDatasetProvenanceLinks({ entityType, entityId, datasetKey = "" } = {}) {
  if (!entityType || !entityId) return [];

  let query = supabase
    .from("dataset_provenance_links")
    .select(`
      dataset_key,
      relationship_type,
      notes,
      reviewed_at,
      data_sources (
        id,
        name,
        publisher,
        source_type,
        description,
        website_url,
        coverage_period_start,
        coverage_period_end,
        last_verified_at
      )
    `)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);

  if (datasetKey) query = query.eq("dataset_key", datasetKey);

  const { data, error } = await query.order("reviewed_at", { ascending: false });
  if (error) return [];

  return (data ?? []).map((row) => ({
    datasetKey: row.dataset_key,
    relationshipType: row.relationship_type || "",
    notes: row.notes || "",
    reviewedAt: row.reviewed_at || "",
    source: row.data_sources || null,
  }));
}

export async function getScoringModelVersion(modelKey) {
  if (!modelKey) return null;

  const { data, error } = await supabase
    .from("scoring_model_versions")
    .select("model_key, version_label, display_name, status, summary, methodology_notes, released_at")
    .eq("model_key", modelKey)
    .eq("status", "active")
    .order("released_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  if (!data) return null;

  return {
    modelKey: data.model_key,
    version: data.version_label,
    displayName: data.display_name,
    status: data.status,
    summary: data.summary || "",
    methodologyNotes: data.methodology_notes || "",
    releasedAt: data.released_at || "",
  };
}

export async function getIntelligenceMetadata(options) {
  const [quality, sources, modelVersion] = await Promise.all([
    getEntityQualityMetadata(options.tableName, options.entityId),
    getDatasetProvenanceLinks({
      entityType: options.entityType,
      entityId: options.entityId,
      datasetKey: options.datasetKey,
    }),
    options.modelKey ? getScoringModelVersion(options.modelKey) : Promise.resolve(null),
  ]);

  return {
    quality,
    sources,
    modelVersion,
  };
}
