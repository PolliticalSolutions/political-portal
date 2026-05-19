-- ===========================================================================
-- MP Persona — permissions flag and saved-output tables
--
-- Rebuilds the MP Persona Generator as a permission-gated, multi-feature
-- product. Adds a boolean feature flag to user_permissions, plus two new
-- tables for saved style guides (mp_personas) and draft communications
-- (mp_persona_outputs). RLS limits both tables to rows the caller owns,
-- identified by cognito_sub.
-- ===========================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Feature flag on user_permissions.
ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS feature_mp_persona BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_user_permissions_feature_mp_persona
  ON public.user_permissions (cognito_sub)
  WHERE feature_mp_persona = TRUE;

-- 2. mp_personas — one saved Style Guide per user per constituency.
CREATE TABLE IF NOT EXISTS public.mp_personas (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub            TEXT        NOT NULL,
  mp_name                TEXT        NOT NULL,
  constituency_ons_code  TEXT        NOT NULL,
  system_prompt          TEXT        NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mp_personas_sub_ons
  ON public.mp_personas (cognito_sub, constituency_ons_code);

CREATE INDEX IF NOT EXISTS idx_mp_personas_sub
  ON public.mp_personas (cognito_sub);

-- 3. mp_persona_outputs — saved drafts generated against a persona.
CREATE TABLE IF NOT EXISTS public.mp_persona_outputs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id        UUID        NOT NULL REFERENCES public.mp_personas(id) ON DELETE CASCADE,
  cognito_sub       TEXT        NOT NULL,
  output_type       TEXT        NOT NULL
                    CHECK (output_type IN ('email','letter','social_post','speech_notes','press_release')),
  context_provided  TEXT        NOT NULL,
  generated_text    TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_persona_outputs_sub_created
  ON public.mp_persona_outputs (cognito_sub, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mp_persona_outputs_persona
  ON public.mp_persona_outputs (persona_id);

-- 4. updated_at trigger on mp_personas.
CREATE OR REPLACE FUNCTION public.set_mp_personas_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mp_personas_updated ON public.mp_personas;
CREATE TRIGGER trg_mp_personas_updated
  BEFORE UPDATE ON public.mp_personas
  FOR EACH ROW EXECUTE FUNCTION public.set_mp_personas_updated_at();

-- 5. RLS — owner-scoped policies for both tables.
ALTER TABLE public.mp_personas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mp_persona_outputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mp_personas_owner_select ON public.mp_personas;
CREATE POLICY mp_personas_owner_select ON public.mp_personas
  FOR SELECT TO anon, authenticated
  USING (cognito_sub = current_setting('request.jwt.claim.sub', true));

DROP POLICY IF EXISTS mp_personas_owner_modify ON public.mp_personas;
CREATE POLICY mp_personas_owner_modify ON public.mp_personas
  FOR ALL TO anon, authenticated
  USING (cognito_sub = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (cognito_sub = current_setting('request.jwt.claim.sub', true));

DROP POLICY IF EXISTS mp_personas_service_all ON public.mp_personas;
CREATE POLICY mp_personas_service_all ON public.mp_personas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS mp_persona_outputs_owner_select ON public.mp_persona_outputs;
CREATE POLICY mp_persona_outputs_owner_select ON public.mp_persona_outputs
  FOR SELECT TO anon, authenticated
  USING (cognito_sub = current_setting('request.jwt.claim.sub', true));

DROP POLICY IF EXISTS mp_persona_outputs_owner_modify ON public.mp_persona_outputs;
CREATE POLICY mp_persona_outputs_owner_modify ON public.mp_persona_outputs
  FOR ALL TO anon, authenticated
  USING (cognito_sub = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (cognito_sub = current_setting('request.jwt.claim.sub', true));

DROP POLICY IF EXISTS mp_persona_outputs_service_all ON public.mp_persona_outputs;
CREATE POLICY mp_persona_outputs_service_all ON public.mp_persona_outputs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
