-- Political Solutions CRM tables in Supabase (PostgreSQL)
-- All tables prefixed crm_ to avoid collisions with existing portal tables.
-- RLS is disabled — access is already gated by Cognito auth in the portal.
-- Tables ordered to satisfy PostgreSQL foreign key constraints.

-- ============================================================================
-- GEOGRAPHY / POLITICAL STRUCTURES
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_councils (
  id         TEXT PRIMARY KEY,
  code       VARCHAR(10)  UNIQUE NOT NULL,
  name       VARCHAR(255) NOT NULL,
  council_type VARCHAR(100),
  region     VARCHAR(100),
  country    VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_constituencies (
  id         TEXT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL UNIQUE,
  region     VARCHAR(100),
  country    VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_federations (
  id         TEXT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL UNIQUE,
  region     VARCHAR(100),
  country    VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_associations (
  id               TEXT PRIMARY KEY,
  name             VARCHAR(255) NOT NULL UNIQUE,
  constituency_id  TEXT REFERENCES crm_constituencies(id) ON DELETE SET NULL,
  region           VARCHAR(100),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_wards (
  id         TEXT PRIMARY KEY,
  code       VARCHAR(10) UNIQUE NOT NULL,
  name       VARCHAR(255) NOT NULL,
  council_id TEXT NOT NULL REFERENCES crm_councils(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ORGANISATIONS (before contacts — contacts FK references organisations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_organisations (
  id                TEXT PRIMARY KEY,
  name              VARCHAR(255) NOT NULL UNIQUE,
  organisation_type VARCHAR(50)  NOT NULL,
  association_id    TEXT REFERENCES crm_associations(id)   ON DELETE SET NULL,
  federation_id     TEXT REFERENCES crm_federations(id)    ON DELETE SET NULL,
  council_id        TEXT REFERENCES crm_councils(id)       ON DELETE SET NULL,
  constituency_id   TEXT REFERENCES crm_constituencies(id) ON DELETE SET NULL,
  email             VARCHAR(255),
  phone             VARCHAR(20),
  address           TEXT,
  website           VARCHAR(255),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_organisations_type ON crm_organisations(organisation_type);
CREATE INDEX IF NOT EXISTS idx_crm_organisations_name ON crm_organisations(name);

CREATE TABLE IF NOT EXISTS crm_organisation_wards (
  organisation_id TEXT NOT NULL REFERENCES crm_organisations(id) ON DELETE CASCADE,
  ward_id         TEXT NOT NULL REFERENCES crm_wards(id)         ON DELETE CASCADE,
  PRIMARY KEY (organisation_id, ward_id)
);

-- ============================================================================
-- CONTACTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_contacts (
  id                      TEXT PRIMARY KEY,
  first_name              VARCHAR(255),
  last_name               VARCHAR(255),
  email                   VARCHAR(255),
  phone                   VARCHAR(20),
  mobile                  VARCHAR(20),
  contact_type            VARCHAR(50)  NOT NULL DEFAULT 'Other',
  influence_level         VARCHAR(50)  DEFAULT 'Medium',
  relationship_strength   VARCHAR(50)  DEFAULT 'Cold',
  current_organisation_id TEXT REFERENCES crm_organisations(id) ON DELETE SET NULL,
  notes                   TEXT,
  last_interaction        TIMESTAMPTZ,
  next_followup           DATE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_email        ON crm_contacts(email);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_name         ON crm_contacts(first_name, last_name);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_type         ON crm_contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_relationship ON crm_contacts(relationship_strength);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_followup     ON crm_contacts(next_followup);

CREATE TABLE IF NOT EXISTS crm_contact_wards (
  contact_id TEXT NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  ward_id    TEXT NOT NULL REFERENCES crm_wards(id)    ON DELETE CASCADE,
  PRIMARY KEY (contact_id, ward_id)
);

CREATE TABLE IF NOT EXISTS crm_contact_constituencies (
  contact_id       TEXT NOT NULL REFERENCES crm_contacts(id)        ON DELETE CASCADE,
  constituency_id  TEXT NOT NULL REFERENCES crm_constituencies(id)  ON DELETE CASCADE,
  PRIMARY KEY (contact_id, constituency_id)
);

CREATE TABLE IF NOT EXISTS crm_contact_roles (
  id              TEXT PRIMARY KEY,
  contact_id      TEXT NOT NULL REFERENCES crm_contacts(id)      ON DELETE CASCADE,
  organisation_id TEXT REFERENCES crm_organisations(id)          ON DELETE SET NULL,
  role_type       VARCHAR(50) NOT NULL,
  start_date      DATE,
  end_date        DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INTERACTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_interactions (
  id               TEXT PRIMARY KEY,
  contact_id       TEXT NOT NULL REFERENCES crm_contacts(id)      ON DELETE CASCADE,
  organisation_id  TEXT REFERENCES crm_organisations(id)          ON DELETE SET NULL,
  interaction_type VARCHAR(50) NOT NULL,
  summary          TEXT,
  interaction_date TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_interactions_contact ON crm_interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_interactions_date    ON crm_interactions(interaction_date DESC);

-- ============================================================================
-- OPPORTUNITIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_opportunities (
  id                    TEXT PRIMARY KEY,
  title                 VARCHAR(255) NOT NULL,
  contact_id            TEXT NOT NULL REFERENCES crm_contacts(id)      ON DELETE CASCADE,
  organisation_id       TEXT REFERENCES crm_organisations(id)          ON DELETE SET NULL,
  stage                 VARCHAR(50)  NOT NULL DEFAULT 'Identified',
  service_type          VARCHAR(50)  NOT NULL DEFAULT 'Other',
  estimated_value       NUMERIC(10, 2),
  expected_close_date   DATE,
  probability_percent   INTEGER,
  one_off_or_recurring  VARCHAR(20),
  next_action_date      DATE,
  decision_maker        VARCHAR(255),
  blockers              TEXT,
  competitor            VARCHAR(255),
  lead_source           VARCHAR(255),
  lost_date             DATE,
  lost_reason           VARCHAR(50),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_contact    ON crm_opportunities(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_stage      ON crm_opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_crm_opportunities_close_date ON crm_opportunities(expected_close_date);

-- ============================================================================
-- PROJECTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_projects (
  id           TEXT PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  project_type VARCHAR(50)  NOT NULL,
  status       VARCHAR(50)  NOT NULL DEFAULT 'Idea',
  description  TEXT,
  start_date   DATE,
  end_date     DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_projects_status ON crm_projects(status);
CREATE INDEX IF NOT EXISTS idx_crm_projects_type   ON crm_projects(project_type);

CREATE TABLE IF NOT EXISTS crm_project_phases (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES crm_projects(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  order_index INTEGER DEFAULT 0,
  status      VARCHAR(50),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_project_contacts (
  project_id TEXT NOT NULL REFERENCES crm_projects(id)  ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES crm_contacts(id)  ON DELETE CASCADE,
  PRIMARY KEY (project_id, contact_id)
);

CREATE TABLE IF NOT EXISTS crm_project_organisations (
  project_id      TEXT NOT NULL REFERENCES crm_projects(id)      ON DELETE CASCADE,
  organisation_id TEXT NOT NULL REFERENCES crm_organisations(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, organisation_id)
);

CREATE TABLE IF NOT EXISTS crm_project_opportunities (
  project_id      TEXT NOT NULL REFERENCES crm_projects(id)      ON DELETE CASCADE,
  opportunity_id  TEXT NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, opportunity_id)
);

-- ============================================================================
-- TASKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_tasks (
  id              TEXT PRIMARY KEY,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  status          VARCHAR(50)  NOT NULL DEFAULT 'To_do',
  priority        INTEGER DEFAULT 2,
  due_date        DATE,
  reminder_date   DATE,
  contact_id      TEXT REFERENCES crm_contacts(id)       ON DELETE SET NULL,
  organisation_id TEXT REFERENCES crm_organisations(id)  ON DELETE SET NULL,
  opportunity_id  TEXT REFERENCES crm_opportunities(id)  ON DELETE SET NULL,
  project_id      TEXT REFERENCES crm_projects(id)       ON DELETE SET NULL,
  phase_id        TEXT REFERENCES crm_project_phases(id) ON DELETE SET NULL,
  recurrence      VARCHAR(50),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_status   ON crm_tasks(status);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due_date ON crm_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_contact  ON crm_tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_project  ON crm_tasks(project_id);

CREATE TABLE IF NOT EXISTS crm_task_checklist_items (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  completed   BOOLEAN DEFAULT FALSE,
  order_index INTEGER DEFAULT 0
);

-- ============================================================================
-- NOTES (after opportunities + projects so FKs resolve)
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_notes (
  id              TEXT PRIMARY KEY,
  content         TEXT NOT NULL,
  note_type       VARCHAR(50) NOT NULL,
  colour          VARCHAR(50) NOT NULL DEFAULT 'Blue',
  contact_id      TEXT REFERENCES crm_contacts(id)      ON DELETE CASCADE,
  organisation_id TEXT REFERENCES crm_organisations(id) ON DELETE CASCADE,
  opportunity_id  TEXT REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  project_id      TEXT REFERENCES crm_projects(id)      ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_notes_contact      ON crm_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_organisation ON crm_notes(organisation_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_type         ON crm_notes(note_type);

-- ============================================================================
-- POLITICAL DEADLINES
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_political_deadlines (
  id              TEXT PRIMARY KEY,
  title           VARCHAR(255) NOT NULL,
  deadline_type   VARCHAR(50)  NOT NULL,
  deadline_date   DATE NOT NULL,
  constituency_id TEXT REFERENCES crm_constituencies(id) ON DELETE SET NULL,
  council_id      TEXT REFERENCES crm_councils(id)       ON DELETE SET NULL,
  region          VARCHAR(100),
  description     TEXT,
  urgency         VARCHAR(50),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_deadlines_date ON crm_political_deadlines(deadline_date);

-- ============================================================================
-- FILE LINKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_file_links (
  id              TEXT PRIMARY KEY,
  display_name    VARCHAR(255)  NOT NULL,
  onedrive_url    VARCHAR(1000) NOT NULL,
  contact_id      TEXT REFERENCES crm_contacts(id)      ON DELETE CASCADE,
  organisation_id TEXT REFERENCES crm_organisations(id) ON DELETE CASCADE,
  opportunity_id  TEXT REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  project_id      TEXT REFERENCES crm_projects(id)      ON DELETE CASCADE,
  task_id         TEXT REFERENCES crm_tasks(id)         ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_audit_log (
  id         TEXT PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  record_id  TEXT NOT NULL,
  action     VARCHAR(50)  NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by VARCHAR(100) DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_crm_audit_record ON crm_audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_crm_audit_date   ON crm_audit_log(changed_at DESC);
