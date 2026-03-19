-- LGR Authorities table DDL
-- Run this in the Supabase SQL Editor before running import_lgr_data.py

CREATE TABLE IF NOT EXISTS public.lgr_authorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_authority_id UUID REFERENCES local_authorities(id),
  authority_name VARCHAR(200) NOT NULL,
  area_name VARCHAR(200),
  lgr_status VARCHAR(50) NOT NULL,
  lgr_wave VARCHAR(50),
  proposed_unitary_name VARCHAR(200),
  lgr_submission_date DATE,
  lgr_decision_date DATE,
  abolition_date DATE,
  replacement_authority VARCHAR(200),
  mayoral_combined_authority BOOLEAN DEFAULT FALSE,
  mayoral_ca_name VARCHAR(200),
  political_context TEXT,
  source_url VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.lgr_authorities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read" ON public.lgr_authorities
  FOR SELECT TO anon USING (true);

-- Useful index for lookups by authority name
CREATE INDEX IF NOT EXISTS lgr_authorities_name_idx ON public.lgr_authorities (authority_name);
CREATE INDEX IF NOT EXISTS lgr_authorities_status_idx ON public.lgr_authorities (lgr_status);
