CREATE TABLE IF NOT EXISTS enquiries (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name                text        NOT NULL,
  email               text        NOT NULL,
  organisation        text,
  services_interested text[],
  role                text,
  message             text,
  submitted_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;

-- Allow unauthenticated users to submit enquiries via the public form
CREATE POLICY "public_insert" ON enquiries
  FOR INSERT TO anon
  WITH CHECK (true);
