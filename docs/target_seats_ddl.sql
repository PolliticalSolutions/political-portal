-- Target Seats table DDL
-- Run this in the Supabase SQL Editor before running calculate_target_seats.py

CREATE TABLE IF NOT EXISTS public.target_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  constituency_id UUID REFERENCES constituencies(id),
  target_rank INT,
  target_score DECIMAL(4,2),
  swing_required DECIMAL(5,2),
  current_holder VARCHAR(100),
  current_majority INT,
  con_2024_share DECIMAL(5,2),
  reform_squeeze_risk DECIMAL(4,2),
  demographic_profile VARCHAR(50),
  target_classification VARCHAR(50),
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.target_seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read" ON public.target_seats
  FOR SELECT TO anon USING (true);
