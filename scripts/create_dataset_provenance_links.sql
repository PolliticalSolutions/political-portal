CREATE TABLE IF NOT EXISTS dataset_provenance_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  dataset_key text NOT NULL,
  data_source_id uuid REFERENCES data_sources(id) ON DELETE SET NULL,
  relationship_type text NOT NULL DEFAULT 'source',
  notes text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS dataset_provenance_links_entity_idx
  ON dataset_provenance_links (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS dataset_provenance_links_dataset_idx
  ON dataset_provenance_links (dataset_key);
