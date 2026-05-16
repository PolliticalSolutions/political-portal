-- ===========================================================================
-- Campaign Module — Amendment 1
--
-- (1) RLS — enable RLS on portal-internal tables and add FOR ALL TO anon
--     policies. The Supabase project has RLS-by-default; without explicit
--     policies, anon writes from the portal are blocked with
--     "violates row-level security policy".
-- (2) Multi-type sessions + GOTV / GOTPV — replace session_type VARCHAR
--     with session_types TEXT[]. Backfill existing rows; drop the old col.
-- (3) Pin coordinates per session — latitude/longitude columns for the
--     map, populated at create time by frontend geocoding via postcodes.io.
-- (4) Live register support — new walk_in_attendees table for on-the-day
--     check-in of people who never RSVP'd.
-- (5) Structured meeting-place address — split free-text meeting_place
--     into venue_name + street_address + postcode columns. Best-effort
--     backfill extracts postcode via regex and moves remainder verbatim
--     into street_address.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Multi-type sessions + GOTV / GOTPV
-- ---------------------------------------------------------------------------

ALTER TABLE campaign_sessions
  ADD COLUMN IF NOT EXISTS session_types TEXT[] NOT NULL DEFAULT '{}';

-- Backfill from session_type only if that column still exists. Wrapped in
-- a DO block so the migration is idempotent — re-runs after the column
-- has been dropped are no-ops here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_sessions' AND column_name = 'session_type'
  ) THEN
    EXECUTE $sql$
      UPDATE campaign_sessions
        SET session_types = ARRAY[session_type]
        WHERE array_length(session_types, 1) IS NULL
          AND session_type IS NOT NULL
    $sql$;
    EXECUTE 'ALTER TABLE campaign_sessions DROP COLUMN session_type';
  END IF;
END$$;

-- Drop any prior version of the constraint before recreating so this
-- migration stays idempotent across reruns.
ALTER TABLE campaign_sessions
  DROP CONSTRAINT IF EXISTS cs_session_types_valid;

ALTER TABLE campaign_sessions
  ADD CONSTRAINT cs_session_types_valid
  CHECK (
    array_length(session_types, 1) >= 1
    AND session_types <@ ARRAY[
      'canvass','leaflet','phone_bank','committee_room',
      'gotv','gotpv','other'
    ]
  );

-- ---------------------------------------------------------------------------
-- 2. Structured meeting-place address + pin coordinates
-- ---------------------------------------------------------------------------

ALTER TABLE campaign_sessions
  ADD COLUMN IF NOT EXISTS venue_name     VARCHAR(200) NULL,
  ADD COLUMN IF NOT EXISTS street_address TEXT         NULL,
  ADD COLUMN IF NOT EXISTS postcode       VARCHAR(10)  NULL,
  ADD COLUMN IF NOT EXISTS latitude       DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS longitude      DOUBLE PRECISION NULL;

-- Backfill from the existing free-text meeting_place. Uses regexp_match
-- (singular — returns NULL on no match) and PostgreSQL's \m..\M word
-- anchors. Skips rows where meeting_place has already been migrated.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_sessions' AND column_name = 'meeting_place'
  ) THEN
    EXECUTE $sql$
      UPDATE campaign_sessions
        SET postcode = (regexp_match(upper(meeting_place),
              '\m([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\M'))[1],
            street_address = COALESCE(street_address, meeting_place)
        WHERE postcode IS NULL AND meeting_place IS NOT NULL
    $sql$;
  END IF;
END$$;

-- Normalise extracted postcodes to canonical SW1A 1AA form.
UPDATE campaign_sessions
  SET postcode = regexp_replace(postcode, '\s+', '', 'g')
  WHERE postcode IS NOT NULL;

UPDATE campaign_sessions
  SET postcode = substring(postcode for length(postcode)-3) || ' ' ||
                 substring(postcode from length(postcode)-2)
  WHERE postcode IS NOT NULL AND length(postcode) >= 5
    AND position(' ' in postcode) = 0;

ALTER TABLE campaign_sessions DROP COLUMN IF EXISTS meeting_place;

CREATE INDEX IF NOT EXISTS idx_cs_coords
  ON campaign_sessions(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. walk_in_attendees — register support
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS walk_in_attendees (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES campaign_sessions(id) ON DELETE CASCADE,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  email             VARCHAR(200) NULL,
  phone             VARCHAR(50)  NULL,
  notes             TEXT         NULL,
  checked_in_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  checked_in_by_sub VARCHAR(200) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wia_session ON walk_in_attendees(session_id);

-- ---------------------------------------------------------------------------
-- 4. RLS policies for portal-internal tables
-- ---------------------------------------------------------------------------

ALTER TABLE campaign_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_rsvps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_roles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE walk_in_attendees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cs_anon_all    ON campaign_sessions;
DROP POLICY IF EXISTS cs_service_all ON campaign_sessions;
CREATE POLICY cs_anon_all    ON campaign_sessions FOR ALL TO anon         USING (true) WITH CHECK (true);
CREATE POLICY cs_service_all ON campaign_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sr_anon_all    ON session_rsvps;
DROP POLICY IF EXISTS sr_service_all ON session_rsvps;
CREATE POLICY sr_anon_all    ON session_rsvps     FOR ALL TO anon         USING (true) WITH CHECK (true);
CREATE POLICY sr_service_all ON session_rsvps     FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cr_anon_select ON campaign_roles;
DROP POLICY IF EXISTS cr_service_all ON campaign_roles;
CREATE POLICY cr_anon_select ON campaign_roles    FOR SELECT TO anon         USING (true);
CREATE POLICY cr_service_all ON campaign_roles    FOR ALL    TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS wia_anon_all    ON walk_in_attendees;
DROP POLICY IF EXISTS wia_service_all ON walk_in_attendees;
CREATE POLICY wia_anon_all    ON walk_in_attendees FOR ALL TO anon         USING (true) WITH CHECK (true);
CREATE POLICY wia_service_all ON walk_in_attendees FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
