# Political Solutions — Project Context

Last updated: 29 April 2026

---

## What this is

A SaaS platform for UK Conservative campaign operations. It provides:

1. **Marked register upload tool** — MPs/agents upload marked registers (PDF/CSV) via a portal. Files are queued, processed by a local listener, and results returned.
2. **Constituency Intelligence** — analytics dashboard covering all 650 UK constituencies: election results, vulnerability scores, threat indices (Reform, Lib Dem, Green), demographics, swing analysis, target seats.
3. **Local Government tracker** — LGR (Local Government Reorganisation) data covering Surrey, DPP, Wave 2 areas; councillor attendance; council data.
4. **MP Persona Generator** — AI-powered tool that generates an MP writing style guide and system prompt from Hansard, Wikipedia, and press releases.
5. **By-Election Monitor** — automated daily alert system that detects recently departed Commons members and creates `political_alerts` rows.
6. **Quote/enquiry system** — service quote requests, Xero invoice integration (enquiry-api stack).
7. **Subscription management** — Stripe-backed subscriptions per association, with admin override capability.

**Target users:** Conservative associations, campaign managers, MPs' offices.

---

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite, react-router-dom v7, react-helmet-async, @tanstack/react-query |
| Auth | AWS Cognito (PKCE flow, no Amplify SDK). Tokens in sessionStorage as `cognito_tokens` JSON |
| Data (constituency/permissions) | Supabase (PostgreSQL). Two clients: anon (`supabaseClient.js`) and service role (`supabaseServiceClient.js`) |
| Data (jobs/users/elections) | AWS DynamoDB via Lambda |
| Backend | AWS SAM, Lambda Node 20, HTTP API Gateway |
| Payments | Stripe (card + invoice) |
| Hosting | AWS Amplify (SPA, auto-deploys from `main` branch) |
| Styling | Pure CSS, no Tailwind, no CSS-in-JS |
| Maps | react-simple-maps + `public/uk-constituencies.geojson` (ONS PCON 2024) |
| SSR/prerender | `vite build --ssr` + `scripts/prerender.mjs` (public routes only) |

---

## Repository layout

```
src/
  App.jsx                     # Root router
  pages/                      # All page-level components
    portal/                   # Auth-gated portal
      admin/                  # Admin-only pages
      alerts/                 # Political alerts
      analytics/              # Model analytics and monitoring
      constituency/           # Constituency intelligence
      local-government/       # LGR tracker and council data
  components/                 # Shared UI components
  lib/                        # API clients and business logic
  context/                    # React context providers
  config/runtimeConfig.js     # All env var reads go here
  auth/session.js             # Session validation helpers
infra/
  upload-api/                 # SAM template + Lambda source
    src/                      # Lambda handlers and repos
    template.yaml             # SAM template (all resources defined here)
  enquiry-api/                # Enquiry/quote/Stripe stack
scripts/                      # Build, seed, blog, Python data scripts
supabase/
  migrations/                 # Supabase migration SQL
docs/                         # AWS infra reference, deploy guides
public/
  uk-constituencies.geojson   # ONS PCON 2024 boundary file (required for map)
```

---

## AWS infrastructure

### Two upload-api stacks — always use `ps-upload-api-prod`

| Stack | API ID | Purpose |
|---|---|---|
| `upload-api` | `ra5ljyj9b0` | Legacy dev stack — NOT used in production |
| `ps-upload-api-prod` | `77i4hpcez8` | **Production** — used by Amplify |
| `ps-enquiry-api-prod` | (see CloudFormation outputs) | Enquiry, quotes, Stripe, Xero |

### Lambda functions in `ps-upload-api-prod`

| Lambda | Handler | Trigger | Timeout |
|---|---|---|---|
| `UploadFunction` | `handler.mjs` | HTTP API Gateway | 29s |
| `WorkerFunction` | `worker.mjs` | SQS (`ProcessQueue`) | 300s |
| `UploadCompleteFunction` | `uploadCompleteHandler.mjs` | S3 ObjectCreated | 30s |
| `ScanResultHandlerFunction` | `scanResultHandler.mjs` | EventBridge (GuardDuty) | 30s |
| `PersonaFunction` | `personaHandler.mjs` | Lambda Function URL | 300s |
| `ByElectionMonitorFunction` | `byElectionMonitor.mjs` | EventBridge schedule (daily 06:00 UTC) | 120s |

**PersonaFunction** is exposed via a Lambda Function URL (not API Gateway) to bypass the 29s API Gateway integration timeout. `ANTHROPIC_API_KEY` must be set manually in the Lambda console after deploy — it is not set in the SAM template.

**ByElectionMonitorFunction** polls the Parliament Members API daily, cross-references Supabase `constituencies`, and inserts `political_alerts` rows for newly vacant seats.

### DynamoDB tables (`ps-upload-api-prod-` prefix)

| Table | Key | Purpose |
|---|---|---|
| `jobs` | `jobId` | Upload job records |
| `users` | `userId` | User approval records; `status` defaults to `APPROVED` on first API call |
| `elections` | `electionId` | Elections; contains both `ELECTION` and `ELECTION_PROJECTION` record types — always paginate fully |
| `organisations` | `orgId` | Association/federation records |
| `audit-log` | `auditId` | Audit trail |
| `submissions` | `submissionId` | Processed submission results |

### PCON code formats

2019 boundary: `E14000xxx` — 2024 boundary: `E14001xxx`. The system uses 2024 codes throughout. Setting `allowedPconCodes: []` means unrestricted access.

---

## Supabase data model

All constituency intelligence, permissions, subscriptions, and alerts live in Supabase. The project uses two clients:

- `supabaseClient.js` — anon key, for public/constituency queries
- `supabaseServiceClient.js` — service role key, for permissions/subscriptions (bypasses RLS). Key is in the client bundle; accepted trade-off.

### Core permissions tables

| Table | Purpose |
|---|---|
| `associations` | Conservative associations (name, region, country) |
| `association_constituencies` | Join: association → constituencies |
| `constituencies` | All 650 constituencies (id, name, ons_code) |
| `user_permissions` | cognito_sub → association_id grants, `is_active` flag |
| `permission_audit_log` | GRANT/REVOKE/SUBSCRIPTION_ACTIVATE/SUSPEND audit trail |
| `admin_users` | Cognito subs with admin access |
| `subscriptions` | Stripe subscription records per user; `admin_override_active` for manual activation |
| `associations_with_pricing` | View: associations with computed subscription pricing |

### Constituency intelligence tables

| Table | Purpose |
|---|---|
| `elections` | Election records (linked to constituencies via `constituency_elections`) |
| `constituency_elections` | Join: election → constituencies |
| `results` | Candidate-level election results |
| `swings` | Swing data per constituency per election pair |
| `demographics` | 2021 census data per constituency |
| `demographic_correlations` | Correlation between demographic variables and swing |
| `marginality_scores` | Majority/marginality calculations |
| `vulnerability_scores` | Composite vulnerability index per constituency |
| `reform_threat_index` | Reform UK threat score per constituency |
| `libdem_threat_index` | Lib Dem threat score per constituency |
| `green_threat_index` | Green Party threat score per constituency |
| `target_seats` | 2029 target seat classifications |
| `scoring_model_versions` | Model version metadata |
| `model_performance_backtests` | Backtesting results per model version |
| `dataset_provenance_links` | Links data entities to their source datasets |
| `local_authorities` | Local authority records |
| `lgr_authorities` | LGR (reorganisation) tracking records |
| `council_data` | Council-level political composition |
| `council_elections` | Council election records |
| `council_results` | Council ward-level results |
| `council_wards` | Ward definitions |
| `councillor_attendance` | Councillor attendance records |
| `constituency_council_lookup` | Maps constituencies to relevant councils |
| `political_alerts` | Active political alerts (by-election risks, other events); `is_active` flag |
| `alert_subscriptions` | User subscriptions to alert types |
| `enquiries` | Contact/enquiry form submissions |

---

## Authentication and permissions

### Auth flow

1. `/login` → generates PKCE verifier, redirects to Cognito Hosted UI
2. Cognito redirects to `/callback?code=...`
3. `Callback.jsx` POSTs to Cognito `/oauth2/token`, stores JWT in `sessionStorage["cognito_tokens"]`
4. `ProtectedRoute` reads session; expired tokens redirect to `/login`
5. `App.jsx` polls session every 30s and on window focus; idle timeout at 4 min warning + 1 min countdown

### Permissions chain

`PortalLayout` → `PermissionsProvider` (context) → `getUserConstituencies` + `isAdmin`

- `getUserConstituencies(cognitoSub)` queries `user_permissions` → `association_constituencies` → `constituencies` and returns a flat deduplicated list
- `isAdmin(cognitoSub)` queries `admin_users` via service role client
- Constituency pages use `usePermissions()` to gate access; `UpgradePrompt` component shown when access is denied
- Admin nav items (Manual Review, Users, Associations, Elections) shown only when `isAdmin` is true

### Subscription gating

`getUserSubscriptionStatus(cognitoSub)` queries `subscriptions` table:
- `admin_override_active = true` on any row → `"active"`
- Otherwise: status `"active"` or `"trialing"` → full access
- Portal shows "free demo" upgrade banner if status is not active/trialing

---

## Environment variables

### Frontend (VITE_* prefix, read via `src/config/runtimeConfig.js`)

| Variable | Purpose |
|---|---|
| `VITE_UPLOAD_API_URL` | Upload API base URL (`https://77i4hpcez8.execute-api.eu-west-2.amazonaws.com`) |
| `VITE_ENQUIRY_API_URL` | Enquiry API base URL |
| `VITE_API_BASE_URL` | Fallback API base URL |
| `VITE_PERSONA_API_URL` | Lambda Function URL for MP Persona Generator |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_SUPABASE_SERVICE_KEY` | Supabase service role key (in bundle — accepted risk) |
| `VITE_COGNITO_DOMAIN` | Cognito hosted UI domain |
| `VITE_COGNITO_CLIENT_ID` | Cognito app client ID |
| `VITE_COGNITO_REDIRECT_URI` | Post-auth redirect URI |
| `VITE_COGNITO_LOGOUT_URI` | Post-logout redirect URI |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `VITE_STRIPE_API_URL` | Stripe Lambda base URL |
| `VITE_GA4_MEASUREMENT_ID` | Google Analytics 4 measurement ID |
| `VITE_SITE_URL` | Canonical site URL (default: `https://politicalsolutions.uk`) |
| `VITE_GISCUS_ENABLED` | Enable blog comments |
| `VITE_GISCUS_REPO` | Giscus GitHub repo |
| `VITE_GISCUS_REPO_ID` | Giscus repo ID |
| `VITE_GISCUS_CATEGORY` | Giscus discussion category |
| `VITE_GISCUS_CATEGORY_ID` | Giscus category ID |
| `VITE_TWFY_API_KEY` | TheyWorkForYou API key (referenced in code, not yet wired) |

### Lambda environment variables (set via SAM parameters)

`ANTHROPIC_API_KEY` on `PersonaFunction` must be set **manually** in the Lambda console — it is left blank in the SAM template and excluded from CloudFormation parameters.

---

## Build system

```
npm run build
  → build:client   (vite build)
  → build:ssr      (vite build --ssr src/entry-server.jsx → dist-ssr/)
  → prerender      (scripts/prerender.mjs → dist/)
  → postbuild      (generate-sitemap.mjs + generate-rss.mjs)
```

SEO: `noindexPrefixes = ["/portal"]` in `seoRoutes.js` covers all portal subroutes automatically. Prerender only renders routes without noindex.

---

## Known issues

- **`verify:prerender` PowerShell script always fails** — it looks for `<title>` but react-helmet-async renders `<title data-rh="true">`. Not a build failure; test is unreliable.
- **`VITE_SUPABASE_SERVICE_KEY` in client bundle** — service role key is exposed in the compiled JS. Documented as an accepted architectural trade-off. The correct fix is a server-side proxy (Lambda or Edge Function) but is not yet implemented.
- **DynamoDB elections scan pagination** — the elections table holds both `ELECTION` and `ELECTION_PROJECTION` records. At 650+ constituencies, a single Scan page hits the 1MB limit before returning canonical records. Always paginate with `LastEvaluatedKey`.
- **`ANTHROPIC_API_KEY` on PersonaFunction** — must be set manually in the Lambda console after every SAM deploy; not managed by CloudFormation.
- **WAF disabled on both stacks** — can be re-enabled with `WafEnabled=true` at deploy time.
- **Two upload-api stacks** — `upload-api` (dev) and `ps-upload-api-prod` (production) are entirely separate. Always deploy to `ps-upload-api-prod`.
- **Cognito JWT `aud` vs `client_id`** — Cognito access tokens use `client_id` not `aud`. The handler verifies against `payload.aud || payload.client_id`.
- **Local listener not deployed to Lambda** — `WorkerProcessQueueMapping` is set `Enabled: false`. The sole SQS consumer is `scripts/listener/listener.py` running locally.
- **LGR milestone dates are hardcoded** — Wave 2 consultation close (26 March 2026) and Surrey shadow election (7 May 2026) are hardcoded in `lgrUrgency.js`. They will show as 0 days / past after those dates.
- **MPPersona password gate** — the MP Persona Generator is gated by a hardcoded password (`"persona2026"`) stored in `localStorage`. This is a simple friction gate, not real auth.

---

## Commercial state (late April 2026)

- Platform is live at `politicalsolutions.uk`
- Stripe subscriptions are integrated and working (card + invoice payment)
- Subscription pricing based on number of constituencies per association; computed from `associations_with_pricing` Supabase view
- Manual admin override (`admin_override_active`) available for provisional access
- MP Persona Generator is in early access (password-gated)
- By-Election Monitor is deployed and running daily
- No public signup — users register via the enquiry flow and are manually approved
- Blog is live with automation scripts for drafting and publishing posts
