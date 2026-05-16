-- ===========================================================================
-- Campaign Module — campaign_context column
--
-- Adds a required campaign_context VARCHAR column to campaign_sessions
-- distinguishing the WHY of a session (general activity vs by-election
-- vs local-election cycle vs ...) from the WHAT (session_types).
--
-- Idempotent. Backfills existing rows to 'general_campaigning' before
-- enforcing NOT NULL so the migration is safe against already-seeded data.
-- ===========================================================================

BEGIN;

-- 1. Add as nullable so the backfill UPDATE can run against existing rows.
ALTER TABLE campaign_sessions
  ADD COLUMN IF NOT EXISTS campaign_context VARCHAR(40);

-- 2. Backfill any row that doesn't yet have a value.
UPDATE campaign_sessions
  SET campaign_context = 'general_campaigning'
  WHERE campaign_context IS NULL;

-- 3. Enforce NOT NULL once every row is populated.
ALTER TABLE campaign_sessions
  ALTER COLUMN campaign_context SET NOT NULL;

-- 4. Restrict allowed values. Re-droppable for idempotent re-runs.
ALTER TABLE campaign_sessions
  DROP CONSTRAINT IF EXISTS cs_campaign_context_valid;

ALTER TABLE campaign_sessions
  ADD CONSTRAINT cs_campaign_context_valid
  CHECK (campaign_context IN (
    'general_campaigning',
    'by_election',
    'local_election',
    'general_election',
    'mayoral_election',
    'pcc_election',
    'selection_contest',
    'membership_drive',
    'referendum'
  ));

-- 5. Index for the filter — sessions are filtered by context on the
--    portal homepage, often combined with region.
CREATE INDEX IF NOT EXISTS idx_cs_campaign_context
  ON campaign_sessions(campaign_context);

COMMIT;
