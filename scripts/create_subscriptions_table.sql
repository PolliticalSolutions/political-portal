CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID REFERENCES associations(id),
  cognito_sub VARCHAR(200),
  user_email VARCHAR(200) NOT NULL,
  stripe_customer_id VARCHAR(200),
  stripe_subscription_id VARCHAR(200),
  stripe_invoice_id VARCHAR(200),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(50) DEFAULT 'stripe',
  amount_ex_vat DECIMAL(10,2),
  amount_inc_vat DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'gbp',
  billing_period_start DATE,
  billing_period_end DATE,
  admin_override_active BOOLEAN DEFAULT FALSE,
  admin_override_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.subscriptions;
CREATE POLICY "Service role only"
  ON public.subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS subscriptions_association_id_idx
  ON public.subscriptions (association_id);

CREATE INDEX IF NOT EXISTS subscriptions_cognito_sub_idx
  ON public.subscriptions (cognito_sub);

CREATE INDEX IF NOT EXISTS subscriptions_status_idx
  ON public.subscriptions (status);

