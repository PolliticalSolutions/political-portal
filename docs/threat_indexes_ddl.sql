-- Lib Dem and Green Threat Index tables DDL
-- Run this in the Supabase SQL Editor before running the threat calculation scripts

CREATE TABLE IF NOT EXISTS public.libdem_threat_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  constituency_id UUID REFERENCES constituencies(id),
  threat_score DECIMAL(5,2),
  threat_rank INT,
  ld_2024_share DECIMAL(5,2),
  ld_share_trend DECIMAL(6,3),
  con_ld_majority DECIMAL(6,2),
  graduate_pct DECIMAL(5,2),
  owner_occupancy_pct DECIMAL(5,2),
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.libdem_threat_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read" ON public.libdem_threat_index
  FOR SELECT TO anon USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS libdem_threat_constituency_idx
  ON public.libdem_threat_index (constituency_id);

-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.green_threat_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  constituency_id UUID REFERENCES constituencies(id),
  threat_score DECIMAL(5,2),
  threat_rank INT,
  green_2024_share DECIMAL(5,2),
  green_share_trend DECIMAL(6,3),
  incumbent_majority DECIMAL(6,2),
  graduate_pct DECIMAL(5,2),
  urban_density_score DECIMAL(5,2),
  incumbent_party VARCHAR(100),
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.green_threat_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read" ON public.green_threat_index
  FOR SELECT TO anon USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS green_threat_constituency_idx
  ON public.green_threat_index (constituency_id);
