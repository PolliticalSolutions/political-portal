-- Conference enquiries, cookie-free daily counts and short-lived abuse controls.
-- Only the server's service role can access these tables or RPCs.
BEGIN;

CREATE TABLE IF NOT EXISTS public.conference_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  visit_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 months'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  organisation text CHECK (length(organisation) <= 200),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  message text CHECK (length(message) <= 2000),
  consent boolean NOT NULL CHECK (consent IS TRUE),
  followup_consent boolean NOT NULL DEFAULT false,
  consent_version text NOT NULL DEFAULT '2026-10-02-v1',
  source text NOT NULL DEFAULT 'conference-qr' CHECK (source = 'conference-qr'),
  payload_hash text NOT NULL,
  user_agent text,
  referrer text
);
CREATE INDEX IF NOT EXISTS conference_leads_expiry ON public.conference_leads (expires_at);

CREATE TABLE IF NOT EXISTS public.conference_daily_metrics (
  day date PRIMARY KEY,
  views bigint NOT NULL DEFAULT 0,
  submissions bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.conference_visits (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.conference_rate_limits (
  scope text NOT NULL,
  ip_hash text NOT NULL,
  bucket timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  PRIMARY KEY (scope, ip_hash, bucket)
);

ALTER TABLE public.conference_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conference_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conference_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conference_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conference_leads, public.conference_daily_metrics,
  public.conference_visits, public.conference_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conference_leads, public.conference_daily_metrics,
  public.conference_visits, public.conference_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.conference_allow_request(p_scope text, p_ip_hash text, p_limit integer)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE request_hits integer;
BEGIN
  INSERT INTO public.conference_rate_limits (scope, ip_hash, bucket)
    VALUES (p_scope, p_ip_hash, date_trunc('minute', now()))
  ON CONFLICT (scope, ip_hash, bucket) DO UPDATE
    SET hits = public.conference_rate_limits.hits + 1
  RETURNING hits INTO request_hits;
  RETURN request_hits <= p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.conference_record_visit(p_visit_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE recorded_at timestamptz;
BEGIN
  INSERT INTO public.conference_visits (id) VALUES (p_visit_id)
    ON CONFLICT (id) DO NOTHING RETURNING created_at INTO recorded_at;
  IF recorded_at IS NOT NULL THEN
    INSERT INTO public.conference_daily_metrics (day, views)
      VALUES ((recorded_at AT TIME ZONE 'Europe/London')::date, 1)
    ON CONFLICT (day) DO UPDATE SET views = public.conference_daily_metrics.views + 1;
  ELSE
    SELECT created_at INTO recorded_at FROM public.conference_visits WHERE id = p_visit_id;
  END IF;
  RETURN recorded_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.conference_save_lead(
  p_request_id uuid, p_visit_id uuid, p_name text, p_organisation text,
  p_email text, p_message text, p_followup_consent boolean, p_payload_hash text
)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE lead_id uuid; saved_hash text;
BEGIN
  INSERT INTO public.conference_leads
    (request_id, visit_id, name, organisation, email, message, consent, followup_consent, payload_hash)
  VALUES
    (p_request_id, p_visit_id, p_name, nullif(p_organisation, ''), p_email,
     nullif(p_message, ''), true, p_followup_consent, p_payload_hash)
  ON CONFLICT (request_id) DO NOTHING RETURNING id INTO lead_id;
  IF lead_id IS NULL THEN
    SELECT id, payload_hash INTO lead_id, saved_hash FROM public.conference_leads WHERE request_id = p_request_id;
    RETURN jsonb_build_object('id', lead_id, 'duplicate', true, 'conflict', saved_hash <> p_payload_hash);
  END IF;
  INSERT INTO public.conference_daily_metrics (day, submissions)
    VALUES ((now() AT TIME ZONE 'Europe/London')::date, 1)
  ON CONFLICT (day) DO UPDATE SET submissions = public.conference_daily_metrics.submissions + 1;
  RETURN jsonb_build_object('id', lead_id, 'duplicate', false, 'conflict', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.conference_cleanup()
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  DELETE FROM public.conference_leads WHERE expires_at <= now();
  DELETE FROM public.conference_visits WHERE created_at < now() - interval '1 day';
  DELETE FROM public.conference_rate_limits WHERE bucket < now() - interval '23 hours';
END;
$$;

REVOKE ALL ON FUNCTION public.conference_allow_request(text, text, integer),
  public.conference_record_visit(uuid),
  public.conference_save_lead(uuid, uuid, text, text, text, text, boolean, text),
  public.conference_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conference_allow_request(text, text, integer),
  public.conference_record_visit(uuid),
  public.conference_save_lead(uuid, uuid, text, text, text, text, boolean, text),
  public.conference_cleanup() TO service_role;

COMMENT ON TABLE public.conference_daily_metrics IS
  'Cookie-free page loads and durable submissions, grouped by Europe/London date; not unique people or QR scans.';
COMMENT ON TABLE public.conference_leads IS
  'Private enquiries; delete at 12 months. Follow-up email requires followup_consent. No user agent or referrer is collected.';
COMMIT;
