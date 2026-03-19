-- ============================================================
-- Associations & Permissions DDL
-- Run in Supabase SQL Editor before seeding data.
-- ============================================================

-- Associations table (Conservative associations)
CREATE TABLE IF NOT EXISTS public.associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  region VARCHAR(100),
  country VARCHAR(50) DEFAULT 'England',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.associations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read" ON public.associations FOR SELECT TO anon USING (true);

-- Association to constituency mapping
-- One association can cover multiple constituencies
CREATE TABLE IF NOT EXISTS public.association_constituencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID REFERENCES associations(id) ON DELETE CASCADE,
  constituency_id UUID REFERENCES constituencies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(association_id, constituency_id)
);
ALTER TABLE public.association_constituencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read" ON public.association_constituencies FOR SELECT TO anon USING (true);

-- User permissions table
-- Links a Cognito user to one or more associations
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub VARCHAR(200) NOT NULL,
  user_email VARCHAR(200) NOT NULL,
  association_id UUID REFERENCES associations(id) ON DELETE CASCADE,
  granted_by VARCHAR(200),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  UNIQUE(cognito_sub, association_id)
);
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.user_permissions FOR ALL TO authenticated USING (false);
CREATE POLICY "Allow service role" ON public.user_permissions FOR ALL TO service_role USING (true);

-- Admin audit log
CREATE TABLE IF NOT EXISTS public.permission_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email VARCHAR(200),
  action VARCHAR(50),
  target_email VARCHAR(200),
  association_id UUID REFERENCES associations(id),
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.permission_audit_log FOR ALL TO service_role USING (true);
