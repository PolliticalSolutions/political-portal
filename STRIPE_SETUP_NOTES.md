## Overview

This branch adds a public Stripe subscription flow, Lambda scaffolding for payment/webhook automation, a subscriptions table DDL script, and an admin subscriptions console inside the portal permissions page.

## Frontend environment variables

Add these to `.env.local` for development and to Amplify environment variables for the frontend build:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
VITE_STRIPE_API_URL=https://api.politicalsolutions.uk/stripe
```

The frontend still also needs the existing runtime values already used in this repo:

```env
VITE_API_BASE_URL=https://api.politicalsolutions.uk
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_COGNITO_DOMAIN=...
VITE_COGNITO_CLIENT_ID=...
VITE_COGNITO_REDIRECT_URI=...
VITE_COGNITO_LOGOUT_URI=...
```

## Lambda environment variables

Set these on the Stripe Lambda function, not in the frontend:

```env
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
COGNITO_USER_POOL_ID=eu-west-2_example
COGNITO_TEMP_PASSWORD=ChangeMe!123
SES_FROM_EMAIL=no-reply@politicalsolutions.uk
AWS_REGION=eu-west-2
```

## Supabase DDL

Run:

```sql
\i scripts/create_subscriptions_table.sql
```

This creates `public.subscriptions` with:

- Stripe identifiers
- billing period dates
- manual admin override flags
- RLS locked to `service_role`

## Webhook URL

Register this in the Stripe dashboard after the API Gateway/Lambda endpoint is deployed:

```text
https://api.politicalsolutions.uk/stripe/webhook
```

If you deploy to a different gateway hostname or stage, use:

```text
{YOUR_STRIPE_API_BASE_URL}/webhook
```

## Lambda deployment

Source files:

- `scripts/stripe_handler/index.js`
- `scripts/stripe_handler/package.json`

Suggested deployment steps:

1. Create a new Lambda function in `eu-west-2`, Node.js 20.x runtime.
2. Copy `scripts/stripe_handler/index.js` into the function package.
3. In `scripts/stripe_handler/`, run:

```bash
npm install --production
zip -r stripe-handler.zip index.js package.json node_modules
```

4. Upload `stripe-handler.zip` to Lambda.
5. Add environment variables listed above.
6. Create API Gateway routes:
   - `POST /create-payment-intent`
   - `POST /create-invoice`
   - `POST /webhook`
7. Expose the API behind a base path such as `/stripe`.
8. In Stripe dashboard test mode:
   - set the publishable/secret keys used above
   - register the webhook endpoint
   - subscribe to:
     - `payment_intent.succeeded`
     - `invoice.payment_failed`
     - `customer.subscription.deleted`
9. Create an EventBridge scheduled trigger for the Lambda to run daily and process past-due suspensions.

## Frontend routes

Public:

- `/subscribe` — new Stripe-backed subscription page
- `/subscriptions` — now redirects to `/subscribe`

Portal:

- `/portal/admin/permissions` — now includes a `Subscriptions` tab

## Current implementation notes

- The public subscribe page uses Stripe Elements and always shows VAT separately.
- Amounts are stored and transmitted to Stripe in pence, displayed in pounds in the UI.
- The admin subscriptions tab supports:
  - status visibility
  - Stripe IDs
  - renewal date display
  - CSV export
  - manual activate / suspend actions
- The Lambda handler includes:
  - payment-intent creation
  - invoice creation
  - webhook verification
  - Cognito provisioning scaffold
  - permission grant/revoke automation
  - SES welcome email scaffold
  - renewal suspension sweep scaffold

## Remaining deployment work

- Run the Supabase DDL in the target project.
- Deploy the Lambda package and API Gateway routes.
- Confirm `associations_with_pricing` exposes:
  - `id`
  - `name`
  - `region`
  - `constituency_count`
  - `constituency_names`
  - `amount_ex_vat_pence`
  - `vat_pence`
  - `amount_inc_vat_pence`
- Test Stripe webhook delivery end-to-end in test mode.
- Review Cognito onboarding email/password policy before production.
