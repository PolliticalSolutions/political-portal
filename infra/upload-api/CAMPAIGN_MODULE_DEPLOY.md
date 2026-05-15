# Campaign Module — Deploy Notes

The Campaign Sessions & Volunteer Coordination module adds two Lambdas
to the `ps-upload-api-prod` stack:

- **`VolunteerOpsFunction`** — 4 public HTTP routes
  (`POST /volunteer/signup`, `POST /volunteer/membership-check`,
  `POST /volunteer/rsvp`, `GET /volunteer/unsubscribe`)
- **`VolunteerEmailFunction`** — EventBridge schedule `cron(0 8 ? * MON *)`
  (every Monday at 08:00 UTC)

Both run on Node.js 20.x and use the existing Supabase env vars
(`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`).

## New SAM parameters

Three new template parameters were added in this change. Set them at
deploy time using `--parameter-overrides` or via the SAM/Amplify
deployment config:

| Parameter | Required | Purpose |
|---|---|---|
| `VolunteerTokenSecret` | **yes — must be set in prod** | HMAC-SHA256 secret used to sign RSVP and unsubscribe JWTs. Use `openssl rand -hex 32` to generate. `NoEcho: true`. |
| `PlatformBaseUrl` | optional | Base URL for tokenised links in volunteer emails. Defaults to `https://politicalsolutions.uk`. |
| `CampaignsFromEmail` | optional | SES sender address for the weekly volunteer digest. Defaults to `campaigns@politicalsolutions.uk`. Must be SES-verified in `eu-west-2`. |

The remaining parameters (`SupabaseUrl`, `SupabaseServiceKey`, etc.) are
already in use by other functions in the stack and remain unchanged.

## Deploy

```powershell
# from infra/upload-api/
sam build
sam deploy --parameter-overrides `
    "VolunteerTokenSecret=<32-byte-hex>" `
    "CampaignsFromEmail=campaigns@politicalsolutions.uk"
```

The Supabase migration must be applied **before** the Lambdas are
invoked. See `supabase/migrations/20260515_campaign_sessions_module.sql`.

## SES production-access prerequisite

`VolunteerEmailFunction` sends to volunteer addresses that are not
SES-verified. Confirm production access for SES in `eu-west-2` before
the first scheduled run (Monday 08:00 UTC); otherwise sends will fail
silently and be logged to `volunteer_email_log.success = false`.

To check: AWS Console → SES → Account dashboard → "Sending statistics".
If the account shows "Sandbox", request production access.

## Smoke test the public endpoints

After deploy, replace `<base>` with the API base URL
(`https://77i4hpcez8.execute-api.eu-west-2.amazonaws.com`).

```powershell
# Signup — should return { ok: true, id: ..., status: "pending", ... }
Invoke-RestMethod -Uri "<base>/volunteer/signup" -Method POST `
    -ContentType "application/json" `
    -Body (@{
        firstName="Smoke"; lastName="Test"
        email="smoke+1@example.org"; postcode="SW1A 1AA"; consent=$true
    } | ConvertTo-Json)

# Membership check — should return { ok: true, match: true } for seeded
# CON-100000, { match: false } otherwise.
Invoke-RestMethod -Uri "<base>/volunteer/membership-check" -Method POST `
    -ContentType "application/json" `
    -Body '{"membershipNumber":"CON-100000"}'
```

## Manual trigger of the weekly email

```powershell
aws lambda invoke `
  --function-name ps-upload-api-prod-VolunteerEmailFunction-XXXX `
  --payload '{}' `
  out.json
type out.json
```

The Lambda returns `{ sent: N, skipped: M }` and writes a row to
`volunteer_email_log` for each volunteer.

## Local listener / `__AWS_SDK_MOCK__`

Both new handlers follow the existing AWS SDK v2 pattern with the
`globalThis.__AWS_SDK_MOCK__` test override, so the existing
`vitest.api.config.js` test setup will work as-is. New tests live in
`infra/upload-api/test/jwt.test.mjs` (already added).

## Rollback

The two new Lambdas can be removed by deleting the
`VolunteerOpsFunction` and `VolunteerEmailFunction` blocks from
`template.yaml` and redeploying. The Supabase tables are not removed
automatically — drop them manually if a full rollback is needed:

```sql
DROP TABLE IF EXISTS volunteer_email_log;
DROP TABLE IF EXISTS volunteer_rsvps;
DROP TABLE IF EXISTS volunteers;
DROP TABLE IF EXISTS session_rsvps;
DROP TABLE IF EXISTS campaign_sessions;
DROP TABLE IF EXISTS campaign_roles;
DROP TABLE IF EXISTS party_membership;
```
