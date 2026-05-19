# Political Solutions — Project Context

Last updated: 19 May 2026

---

## What this is

A SaaS platform for UK Conservative campaign operations. It provides:

1. **Marked register upload tool** — MPs/agents upload marked registers (PDF/CSV) via a portal. Files are queued, processed by Lambda OCR workers (`ProcessRegisterFunction` → `CombineRegisterFunction`), and results emailed as a CSV download link.
2. **Constituency Intelligence** — analytics dashboard covering all 650 UK constituencies: election results, vulnerability scores, threat indices (Reform, Lib Dem, Green), demographics, swing analysis, target seats.
3. **Local Government tracker** — LGR (Local Government Reorganisation) data covering Surrey, DPP, Wave 2 areas; councillor attendance; council data.
4. **Parliamentary Communications Service** — AI-powered MP persona product at `/portal/mp-persona`. Permission-gated via the `feature_mp_persona` flag on `user_permissions` (toggled per-row from the admin Permissions page). The MP name is **locked to the user's permitted constituency** — resolved from `user_permissions → association_constituencies → constituencies.mp_name` and rendered as a read-only field. Tab 1 ("MP Style Guide") generates the system prompt from Hansard, Wikipedia, and press releases. Tab 2 ("Draft Communications") uses the saved prompt to draft emails, letters, social posts, speech notes, or press releases; saved drafts persist in `mp_persona_outputs`. The old hardcoded password gate (`"persona2026"`) is fully removed. `paul@politicalsolutions.uk` (admin) always has access regardless of the feature flag.
5. **By-Election Monitor** — automated daily alert system that detects recently departed Commons members and creates `political_alerts` rows.
6. **By-Election Early Warning (Section 85)** — alert system and dashboard identifying councillors at risk of automatic disqualification under Section 85, Local Government Act 1972 (6 months non-attendance). Alerts are seeded via `import_section85_flags.py` and rescored weekly by `AttendanceRiskRefreshFunction`. The dashboard at `/portal/alerts/by-election-risk` shows all national alerts (admin) or constituency-scoped alerts (standard user), with Status/Region/Party filters. Each council detail page (`LocalGovDetail`) shows an Early Warning panel listing flagged councillors for that authority.
6. **Quote/enquiry system** — service quote requests, Xero invoice integration (enquiry-api stack).
7. **Subscription management** — Stripe-backed subscriptions per association, with admin override capability.
8. **CRM** — contact relationship management at `/portal/admin/crm`, Supabase-backed, with persistent sessions.

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
| Styling | Pure CSS, no Tailwind, no CSS-in-JS. Design tokens in `:root {}` in `src/index.css` |
| Maps | react-simple-maps + `public/uk-constituencies.geojson` (ONS PCON 2024) |
| SSR/prerender | `vite build --ssr` + `scripts/prerender.mjs` (public routes only) |

---

## Design system

The full brand spec is documented in `POLITICAL_SOLUTIONS_DESIGN_SYSTEM.md` at the repo root. Applied May 2026.

**Typography:** Proxima Nova (self-hosted, licensed). Files expected at `/public/fonts/`:
- `Mark_Simonson_-_Proxima_Nova.woff2` (regular)
- `Mark_Simonson_-_Proxima_Nova_Semibold.woff2`
- `Mark_Simonson_-_Proxima_Nova_Bold.woff2`
- `Mark_Simonson_-_Proxima_Nova_Extrabold.woff2`

Preloaded in `index.html`. No Google Fonts. Fallback stack: Gill Sans → Calibri → Trebuchet MS → sans-serif.

**Colour tokens (`:root {}` in `src/index.css`):**
| Token | Value | Use |
|---|---|---|
| `--color-navy` | `#0F2744` | Primary brand, headings, nav |
| `--color-navy-mid` | `#2B4C7E` | Accent links, active states |
| `--color-slate` | `#4A5C6E` | Body text, muted copy |
| `--color-background` | `#F4F6F8` | Page background |
| `--color-cta` | `#1A6B3C` | Primary CTA buttons |
| `--color-cta-hover` | `#145530` | CTA button hover |

**Anti-patterns — never add:**
- Gold or amber accent (`#c89b4a` or similar) — was removed entirely
- Gradients on backgrounds, heroes, or cards
- `border-radius` above 6px on any component
- Google Fonts or any external font CDN
- Tailwind classes or CSS-in-JS

**Portal dark sidebar:** Scoped to `.portal-sidebar` with hardcoded dark palette (`#0D1117` background, `#2A3441` border, `#8A9BB0` nav text, accent on active via `inset 3px 0 0 #2ECC71`). Portal content area stays light.

**Backward compat:** All existing `var(--primary)`, `var(--surface)`, `var(--border)`, `var(--accent)` etc. are preserved as alias vars pointing to the new tokens. No component class names were changed.

---

## SEO

Managed via `react-helmet-async`. Key files:

| File | Purpose |
|---|---|
| `src/seo/seoRoutes.js` | Route-level title, description, changefreq, priority, noindex |
| `src/seo/RouteSeo.jsx` | Reads current route, renders `Seo` component. Title format: `Keyword phrase \| Political Solutions` |
| `src/seo/Seo.jsx` | Renders `<title>`, meta, OG, Twitter card, JSON-LD. Twitter card: `summary_large_image` |
| `src/seo/structuredData.js` | JSON-LD schema builders: `buildOrganisationSchema`, `buildWebsiteSchema`, `buildServicesSchema`, `buildElectionSupportSchema`, `buildFaqSchema` |
| `src/seo/seoConfig.js` | Site-level constants (SITE_URL, SITE_NAME, LOGO_PATH, CONTACT_EMAIL) |

**Title format:** `Keyword phrase | Political Solutions` (keyword-first, pipe-separated). Never `Political Solutions | X`.

`noindexPrefixes = ["/portal"]` in `seoRoutes.js` covers all portal subroutes automatically. Prerender only renders routes without noindex.

**FAQ schema:** `buildFaqSchema(faqs)` returns a `FAQPage` JSON-LD object. Currently wired into `Services.jsx` via a `<Helmet>` block alongside `buildServicesSchema()`.

---

## Repository layout

```
src/
  App.jsx                     # Root router
  pages/                      # All page-level components
    portal/                   # Auth-gated portal
      admin/                  # Admin-only pages (incl. CRM)
      alerts/                 # Political alerts
      analytics/              # Model analytics and monitoring
      constituency/           # Constituency intelligence
      local-government/       # LGR tracker and council data
  components/                 # Shared UI components
  lib/                        # API clients and business logic
  context/                    # React context providers
  config/runtimeConfig.js     # All env var reads go here
  auth/session.js             # Session validation helpers
  seo/                        # SEO layer (RouteSeo, Seo, seoRoutes, structuredData, seoConfig)
  blog/                       # Blog loader, date helpers
infra/
  upload-api/                 # SAM template + Lambda source
    src/                      # Lambda handlers and repos
    template.yaml             # SAM template (all resources defined here)
  enquiry-api/                # Enquiry/quote/Stripe stack
content/
  blog/                       # Markdown blog posts (frontmatter: title, description, date, author, tags, draft, canonical)
scripts/                      # Build, seed, blog, Python data scripts
supabase/
  migrations/                 # Supabase migration SQL
docs/                         # AWS infra reference, deploy guides
public/
  uk-constituencies.geojson   # ONS PCON 2024 boundary file (required for map)
  fonts/                      # Self-hosted Proxima Nova woff2 files
POLITICAL_SOLUTIONS_DESIGN_SYSTEM.md  # Full brand + design spec
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
| `WorkerFunction` | `worker.mjs` | SQS (`ProcessQueue`); **disabled** — legacy stub replaced by `ProcessRegisterFunction` | 300s |
| `ProcessRegisterFunction` | `src_python/process_register/handler.py` | SQS (`ProcessQueue`); Enabled; BatchSize 1. Requires `TesseractLayerArn` SAM parameter. | 900s |
| `CombineRegisterFunction` | `src_python/combine_register/handler.py` | Lambda invoke (async, from `ProcessRegisterFunction` when all files in a batch complete) | 300s |
| `UploadCompleteFunction` | `uploadCompleteHandler.mjs` | S3 ObjectCreated | 30s |
| `ScanResultHandlerFunction` | `scanResultHandler.mjs` | EventBridge (GuardDuty) | 30s |
| `PersonaFunction` | `personaHandler.mjs` | Lambda Function URL | 300s |
| `ByElectionMonitorFunction` | `byElectionMonitor.mjs` | EventBridge schedule (daily 06:00 UTC) | 120s |
| `AttendanceRiskRefreshFunction` | `attendanceRiskRefresh.mjs` | EventBridge schedule (Mon 07:00 UTC) | 120s |

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
| `user_permissions` | cognito_sub → association_id grants, `is_active` flag, `feature_mp_persona` flag (gates Parliamentary Communications Service) |
| `mp_personas` | One saved MP Style Guide per `(cognito_sub, constituency_ons_code)`; stores `system_prompt`, `mp_name`, `constituency_ons_code`, timestamps. RLS-scoped to the owning `cognito_sub`. |
| `mp_persona_outputs` | Saved drafts generated from an MP persona; FK to `mp_personas`; `output_type ∈ {email, letter, social_post, speech_notes, press_release}`, `context_provided`, `generated_text`. RLS-scoped to the owning `cognito_sub`. |
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
| `councillor_attendance` | Councillor attendance records — **12,163 rows across ~130 councils** (deduped May 2026; prior total was 59,388 due to committee membership rows with null eligible/attended counts being imported alongside real attendance rows). Dedup key: `(local_authority_id, councillor_name, ward)`. |
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
- Admin nav items (Manual Review, Users, Associations, Elections, CRM) shown only when `isAdmin` is true

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

`TesseractLayerArn` must be supplied at deploy time for `ProcessRegisterFunction` to have OCR capability. Production value: `arn:aws:lambda:eu-west-2:561375865143:layer:tesseract-layer:5`. Pass via `TESSERACT_LAYER_ARN` env var when running `deploy-upload-api.sh`.

`SesRecipientEmail` (default `markedregisters@politicalsolutions.uk`) controls where `CombineRegisterFunction` sends the batch-complete email. Override at deploy time via `SES_RECIPIENT_EMAIL` env var.

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
- **`WorkerFunction`/`WorkerProcessQueueMapping` are legacy stubs** — `WorkerProcessQueueMapping` remains `Enabled: false`. `WorkerFunction` (`worker.mjs`) is a no-op stub. The production SQS consumer is `ProcessRegisterFunction` (Python), which has its own `Events.SQSSource` mapping set `Enabled: true`. Do not enable `WorkerProcessQueueMapping` — it would compete with `ProcessRegisterFunction` and consume messages without processing them.
- **LGR milestone dates are hardcoded** — Wave 2 consultation close (26 March 2026) and Surrey shadow election (7 May 2026) are hardcoded in `lgrUrgency.js`. They will show as 0 days / past after those dates.
- **Lambda runtime deprecation** — all pre-existing Lambda functions in `ps-upload-api-prod` run on `nodejs20.x`, which AWS deprecates for new deployments before 1 July 2026. All functions must be migrated to `nodejs22.x` before that date. Only `AttendanceRiskRefreshFunction` (added May 2026) is affected by this as a newly-added function; the others were deployed before the deprecation notice.
- **`infra/upload-api/packaged-template.yaml` not in `.gitignore`** — this file is an ephemeral SAM build artifact and must not be committed. It was excluded manually from the May 2026 commit (435f2fb). Add it to `.gitignore` to prevent accidental future commits.
- **232 councils with placeholder GSS codes** — councils imported as `OCD-NNN` rather than real ONS GSS codes (`E0xxxxxxx`). These are valid internal IDs but cannot be cross-referenced against ONS datasets. Not yet addressed.
- **`ANTHROPIC_API_KEY` still requires manual Lambda console entry after each deploy** — `PersonaFunction` reads the key from `process.env.ANTHROPIC_API_KEY`, but the value is **not** managed by CloudFormation. Every SAM deploy to `ps-upload-api-prod` resets the variable, so after each deploy an operator must re-set it via the Lambda console. Both the persona pipeline and the draft pipeline fail with `ANTHROPIC_API_KEY environment variable is not set.` if the key is missing.
- **Prerender fails in worktrees** — `VITE_SUPABASE_URL` is not set in worktree build contexts; prerender step errors. The client + SSR JS builds succeed. Not a code issue.

---

## Commercial state (May 2026)

- Platform is live at `politicalsolutions.uk`
- Stripe subscriptions are integrated and working (card + invoice payment)
- Subscription pricing based on number of constituencies per association; computed from `associations_with_pricing` Supabase view
- Manual admin override (`admin_override_active`) available for provisional access
- Parliamentary Communications Service is live behind the `feature_mp_persona` flag on `user_permissions`; the old password gate has been removed
- By-Election Monitor is deployed and running daily
- No public signup — users register via the enquiry flow and are manually approved
- Blog is live with automation scripts for drafting and publishing posts
- Full design system applied (Proxima Nova, navy/slate/green tokens, no gradients, portal dark sidebar)
- SEO layer overhauled: keyword-first titles, optimised meta descriptions, FAQ + Service JSON-LD on Services page
- **By-Election Early Warning system live (May 2026):** Section 85 LGA 1972 risk alerts seeded for critical/vacant councillors via `import_section85_flags.py`; weekly Monday Lambda (`AttendanceRiskRefreshFunction`) rescores ongoing; dashboard at `/portal/alerts/by-election-risk`; Early Warning panel on every council detail page
- **Councillor attendance table deduped (May 2026):** reduced from 59,388 to 12,163 rows by removing committee membership rows (null eligible/attended); import script now skips these at source
- **Council composition import script ready** (`scripts/import_council_composition.py`) — requires migration `supabase/migrations/20260512_add_council_composition_columns.sql` to be applied in Supabase first; not yet run against OCD UK data
