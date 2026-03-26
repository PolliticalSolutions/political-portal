-- Elections schema updates for Democracy Club sync and constituency-filtered uploads.
-- Run this in the Supabase SQL editor before deploying the Supabase-backed upload elections flow.

ALTER TABLE public.elections
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'CLOSED',
ADD COLUMN IF NOT EXISTS election_type VARCHAR(50) DEFAULT 'general',
ADD COLUMN IF NOT EXISTS is_by_election BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS local_authority_name VARCHAR(200),
ADD COLUMN IF NOT EXISTS ward_name VARCHAR(200),
ADD COLUMN IF NOT EXISTS polling_date DATE,
ADD COLUMN IF NOT EXISTS democracy_club_id VARCHAR(200),
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

UPDATE public.elections
SET
  status = CASE
    WHEN election_type = 'general' AND election_date = DATE '2024-07-04' THEN 'OPEN'
    ELSE COALESCE(status, 'CLOSED')
  END,
  polling_date = COALESCE(polling_date, election_date),
  is_by_election = COALESCE(is_by_election, FALSE)
WHERE TRUE;

CREATE TABLE IF NOT EXISTS public.constituency_elections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES public.elections(id) ON DELETE CASCADE,
  constituency_id UUID NOT NULL REFERENCES public.constituencies(id) ON DELETE CASCADE,
  relevance VARCHAR(50) DEFAULT 'direct',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (election_id, constituency_id)
);

CREATE INDEX IF NOT EXISTS elections_status_polling_date_idx
  ON public.elections (status, polling_date DESC, election_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS elections_democracy_club_id_idx
  ON public.elections (democracy_club_id)
  WHERE democracy_club_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS constituency_elections_constituency_id_idx
  ON public.constituency_elections (constituency_id);

ALTER TABLE public.constituency_elections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'constituency_elections'
      AND policyname = 'Allow anon read'
  ) THEN
    CREATE POLICY "Allow anon read"
      ON public.constituency_elections
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

INSERT INTO public.constituency_elections (election_id, constituency_id)
SELECT e.id, c.id
FROM public.elections e
CROSS JOIN public.constituencies c
WHERE e.election_type = 'general'
ON CONFLICT DO NOTHING;
