-- Migration: add political composition columns to council_data
-- Run in Supabase SQL Editor before executing import_council_composition.py.
--
-- Note: If constituency_id is currently NOT NULL, uncomment the line below first:
-- ALTER TABLE public.council_data ALTER COLUMN constituency_id DROP NOT NULL;

ALTER TABLE public.council_data
  ADD COLUMN IF NOT EXISTS local_authority_id    UUID         REFERENCES public.local_authorities(id),
  ADD COLUMN IF NOT EXISTS controlling_party     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS control_type          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS total_seats           INTEGER,
  ADD COLUMN IF NOT EXISTS composition           JSONB,
  ADD COLUMN IF NOT EXISTS composition_source    TEXT,
  ADD COLUMN IF NOT EXISTS composition_verified_at TIMESTAMPTZ;

-- Unique index so the import script can upsert by local_authority_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_council_data_authority_unique
  ON public.council_data (local_authority_id)
  WHERE local_authority_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_council_data_authority
  ON public.council_data (local_authority_id);
