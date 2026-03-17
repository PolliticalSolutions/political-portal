CREATE TABLE IF NOT EXISTS scoring_model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key text NOT NULL,
  version_label text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  summary text,
  methodology_notes text,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (model_key, version_label)
);

CREATE INDEX IF NOT EXISTS scoring_model_versions_model_idx
  ON scoring_model_versions (model_key, status);
