-- Councillor attendance records
-- Tracks attendance at formal council meetings (full council, committees, scrutiny panels).
-- Used as a signal for local party health in the By-Election Watch and council stability scoring.
-- Populate via: scripts/import_councillor_attendance.py or the CSV template.
--
-- Source: individual local authority democracy portals (Modern.gov / Civica / bespoke systems).
-- Update cadence: after each municipal year (typically June, covering April–March).

CREATE TABLE IF NOT EXISTS public.councillor_attendance (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to local authority (required)
  local_authority_id    UUID          NOT NULL REFERENCES public.local_authorities(id) ON DELETE CASCADE,

  -- Councillor identity
  councillor_name       VARCHAR(200)  NOT NULL,
  ward                  VARCHAR(200),
  party                 VARCHAR(100),

  -- Meeting type granularity (full_council | committee | scrutiny | executive | combined)
  -- NULL means aggregated across all meeting types for the period.
  meeting_type          VARCHAR(50)   DEFAULT NULL,

  -- Attendance figures for the reporting period
  meetings_eligible     INTEGER       NOT NULL CHECK (meetings_eligible >= 0),
  meetings_attended     INTEGER       NOT NULL CHECK (meetings_attended >= 0),
  attendance_pct        NUMERIC(5,2)  GENERATED ALWAYS AS (
    CASE WHEN meetings_eligible > 0
         THEN ROUND((meetings_attended::NUMERIC / meetings_eligible) * 100, 2)
         ELSE NULL
    END
  ) STORED,

  -- Reporting period (inclusive)
  period_start          DATE          NOT NULL,
  period_end            DATE          NOT NULL,

  -- Provenance
  source_url            VARCHAR(500),
  import_notes          TEXT,

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Prevent duplicate records for the same councillor/type/period
  CONSTRAINT councillor_attendance_unique
    UNIQUE (local_authority_id, councillor_name, meeting_type, period_start, period_end)
);

-- Index for authority-level queries (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_councillor_attendance_authority
  ON public.councillor_attendance (local_authority_id, period_end DESC);

-- Index for low-attendance flag queries (By-Election Watch signal)
CREATE INDEX IF NOT EXISTS idx_councillor_attendance_low
  ON public.councillor_attendance (attendance_pct)
  WHERE attendance_pct < 50;

-- Row Level Security
ALTER TABLE public.councillor_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read" ON public.councillor_attendance
  FOR SELECT TO anon USING (true);

-- Convenience view: councillors with <50% attendance in the most recent period per authority
-- Used by the By-Election Watch low-attendance signal.
CREATE OR REPLACE VIEW public.low_attendance_councillors AS
SELECT
  ca.*,
  la.name AS authority_name,
  la.region,
  la.country
FROM public.councillor_attendance ca
JOIN public.local_authorities la ON la.id = ca.local_authority_id
WHERE ca.attendance_pct < 50
  AND ca.period_end = (
    SELECT MAX(period_end)
    FROM public.councillor_attendance ca2
    WHERE ca2.local_authority_id = ca.local_authority_id
      AND (ca2.meeting_type = ca.meeting_type OR (ca2.meeting_type IS NULL AND ca.meeting_type IS NULL))
  );
