ALTER TABLE IF EXISTS constituencies
  ADD COLUMN IF NOT EXISTS data_confidence_level text,
  ADD COLUMN IF NOT EXISTS data_last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS data_quality_notes text;

ALTER TABLE IF EXISTS local_authorities
  ADD COLUMN IF NOT EXISTS data_confidence_level text,
  ADD COLUMN IF NOT EXISTS data_last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS data_quality_notes text;

ALTER TABLE IF EXISTS political_alerts
  ADD COLUMN IF NOT EXISTS data_confidence_level text,
  ADD COLUMN IF NOT EXISTS data_last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS data_quality_notes text;
