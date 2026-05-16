-- ===========================================================================
-- Campaign Sessions & Volunteer Coordination Module
--
-- Adds seven new tables for portal-managed campaign sessions, portal-user
-- RSVPs, post-session attendance records, a public volunteer database,
-- tokenised volunteer RSVPs, a party-membership verification table, a
-- role table for campaign-specific permissions, and an audit log for
-- the weekly volunteer email programme.
--
-- RLS posture:
--   campaign_sessions / session_rsvps / campaign_roles  — RLS DISABLED
--     (matches the existing portal pattern for CRM tables; Cognito is
--     the auth perimeter; role gate enforced in JS before writes).
--   volunteers / volunteer_rsvps / volunteer_email_log  — RLS ENABLED,
--     service-role only. Writes happen through Lambda handlers using
--     the SUPABASE_SERVICE_KEY. Anon clients cannot read or write PII.
--   party_membership                                    — RLS ENABLED,
--     anon SELECT (verification lookups), service-role writes.
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. campaign_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            VARCHAR(200) NOT NULL,
  session_type     VARCHAR(20)  NOT NULL
                   CHECK (session_type IN ('canvass','leaflet','phone_bank','committee_room','other')),
  constituency_id  UUID NOT NULL REFERENCES constituencies(id) ON DELETE RESTRICT,
  association_id   UUID NOT NULL REFERENCES associations(id)   ON DELETE RESTRICT,
  region           VARCHAR(100) NOT NULL,
  meeting_place    TEXT         NOT NULL,
  session_date     DATE         NOT NULL,
  start_time       TIME         NOT NULL,
  duration_minutes INTEGER      NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
  contact_name     VARCHAR(200) NOT NULL,
  contact_phone    VARCHAR(50)  NOT NULL,
  contact_email    VARCHAR(200) NOT NULL,
  max_capacity     INTEGER      NULL CHECK (max_capacity IS NULL OR max_capacity > 0),
  notes            TEXT         NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','published','cancelled')),
  created_by_sub   VARCHAR(200) NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cs_region_status_date ON campaign_sessions(region, status, session_date);
CREATE INDEX IF NOT EXISTS idx_cs_association        ON campaign_sessions(association_id);
CREATE INDEX IF NOT EXISTS idx_cs_constituency       ON campaign_sessions(constituency_id);
CREATE INDEX IF NOT EXISTS idx_cs_created_by         ON campaign_sessions(created_by_sub);

-- ---------------------------------------------------------------------------
-- 2. session_rsvps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_rsvps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES campaign_sessions(id) ON DELETE CASCADE,
  cognito_sub       VARCHAR(200) NOT NULL,
  display_name      VARCHAR(200) NOT NULL,
  user_email        VARCHAR(200) NOT NULL,
  association_id    UUID NULL REFERENCES associations(id),
  attendance_status VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (attendance_status IN ('pending','attended','did_not_attend')),
  rsvp_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attendance_set_at TIMESTAMPTZ NULL,
  UNIQUE (session_id, cognito_sub)
);

CREATE INDEX IF NOT EXISTS idx_sr_session    ON session_rsvps(session_id);
CREATE INDEX IF NOT EXISTS idx_sr_sub        ON session_rsvps(cognito_sub);
CREATE INDEX IF NOT EXISTS idx_sr_attendance ON session_rsvps(cognito_sub, attendance_status);

-- ---------------------------------------------------------------------------
-- 3. volunteers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS volunteers (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name             VARCHAR(100) NOT NULL,
  last_name              VARCHAR(100) NOT NULL,
  email                  VARCHAR(200) NOT NULL UNIQUE,
  phone                  VARCHAR(50)  NULL,
  postcode               VARCHAR(10)  NOT NULL,
  postcode_area          VARCHAR(4)   NOT NULL,
  membership_number      VARCHAR(20)  NULL,
  association_preference UUID NULL REFERENCES associations(id),
  heard_via              VARCHAR(40)  NULL,
  consent_given          BOOLEAN      NOT NULL DEFAULT FALSE,
  consent_at             TIMESTAMPTZ  NULL,
  region                 VARCHAR(100) NOT NULL,
  status                 VARCHAR(20)  NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','approved','rejected')),
  membership_verified    BOOLEAN      NOT NULL DEFAULT FALSE,
  approval_note          TEXT         NULL,
  approved_by_sub        VARCHAR(200) NULL,
  approved_at            TIMESTAMPTZ  NULL,
  email_opt_out          BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_v_region_status     ON volunteers(region, status);
CREATE INDEX IF NOT EXISTS idx_v_association_pref  ON volunteers(association_preference);
CREATE INDEX IF NOT EXISTS idx_v_opt_out           ON volunteers(email_opt_out) WHERE email_opt_out = FALSE;

ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vol_service_all ON volunteers;
CREATE POLICY vol_service_all ON volunteers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS vol_anon_block ON volunteers;
CREATE POLICY vol_anon_block ON volunteers
  FOR ALL TO anon USING (false);

-- ---------------------------------------------------------------------------
-- 4. volunteer_rsvps
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS volunteer_rsvps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES campaign_sessions(id) ON DELETE CASCADE,
  volunteer_id      UUID NOT NULL REFERENCES volunteers(id)        ON DELETE CASCADE,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  email             VARCHAR(200) NOT NULL,
  attendance_status VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (attendance_status IN ('pending','attended','did_not_attend')),
  rsvp_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attendance_set_at TIMESTAMPTZ NULL,
  UNIQUE (session_id, volunteer_id)
);

CREATE INDEX IF NOT EXISTS idx_vr_session   ON volunteer_rsvps(session_id);
CREATE INDEX IF NOT EXISTS idx_vr_volunteer ON volunteer_rsvps(volunteer_id);

ALTER TABLE volunteer_rsvps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vr_service_all ON volunteer_rsvps;
CREATE POLICY vr_service_all ON volunteer_rsvps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS vr_anon_block ON volunteer_rsvps;
CREATE POLICY vr_anon_block ON volunteer_rsvps
  FOR ALL TO anon USING (false);

-- ---------------------------------------------------------------------------
-- 5. party_membership
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS party_membership (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_number VARCHAR(20)  NOT NULL UNIQUE,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  postcode          VARCHAR(10)  NOT NULL,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_active ON party_membership(membership_number) WHERE is_active = TRUE;

ALTER TABLE party_membership ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_anon_select ON party_membership;
CREATE POLICY pm_anon_select ON party_membership
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS pm_service_all ON party_membership;
CREATE POLICY pm_service_all ON party_membership
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 6. campaign_roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub     VARCHAR(200) NOT NULL,
  user_email      VARCHAR(200) NULL,
  role            VARCHAR(40)  NOT NULL
                  CHECK (role IN ('campaign_manager','volunteer_coordinator','regional_viewer')),
  association_id  UUID NULL REFERENCES associations(id),
  region          VARCHAR(100) NULL,
  granted_by_sub  VARCHAR(200) NOT NULL,
  granted_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cr_uniq ON campaign_roles(
  cognito_sub,
  role,
  COALESCE(association_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(region, '')
) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_cr_sub   ON campaign_roles(cognito_sub, is_active);
CREATE INDEX IF NOT EXISTS idx_cr_assoc ON campaign_roles(association_id, role, is_active);

-- ---------------------------------------------------------------------------
-- 7. volunteer_email_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS volunteer_email_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id   UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  sent_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  region         VARCHAR(100) NOT NULL,
  session_ids    UUID[] NOT NULL DEFAULT '{}',
  success        BOOLEAN NOT NULL,
  ses_message_id VARCHAR(200) NULL,
  error_message  TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_vel_volunteer_sent ON volunteer_email_log(volunteer_id, sent_at DESC);

ALTER TABLE volunteer_email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vel_service_all ON volunteer_email_log;
CREATE POLICY vel_service_all ON volunteer_email_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS vel_anon_block ON volunteer_email_log;
CREATE POLICY vel_anon_block ON volunteer_email_log
  FOR ALL TO anon USING (false);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cs_updated ON campaign_sessions;
CREATE TRIGGER trg_cs_updated BEFORE UPDATE ON campaign_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_v_updated ON volunteers;
CREATE TRIGGER trg_v_updated BEFORE UPDATE ON volunteers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
