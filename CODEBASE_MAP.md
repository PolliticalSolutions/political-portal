# Codebase Map

Last updated: 13 May 2026

---

## Frontend Pages (`src/pages/`)

### Public pages

| File | Route | What it does |
|------|-------|--------------|
| `Home.jsx` | `/` | Marketing homepage |
| `Login.jsx` | `/login` | Initiates Cognito PKCE auth flow; redirects to Cognito Hosted UI |
| `Callback.jsx` | `/callback` | Receives auth code from Cognito, exchanges for JWT, stores in sessionStorage |
| `SignUp.jsx` | `/signup` | Self-signup form; creates account via enquiry flow |
| `Verify.jsx` | `/verify` | Email verification landing page |
| `EnquirePage.jsx` | `/enquire` | Contact/enquiry form; H1: "Enquire About Campaign Data Services"; inserts into Supabase `enquiries` table |
| `BlogIndexPage.jsx` | `/blog` | Lists all blog posts from `content/blog/` markdown files; H1: "UK Campaign Operations Blog" |
| `BlogPostPage.jsx` | `/blog/:slug` | Individual blog post rendered from markdown |
| `Services.jsx` | `/services` | Services overview page; renders Service + FAQPage JSON-LD via `<Helmet>` |
| `ServiceSupport.jsx` | `/services/election-support` | Election support service detail |
| `ConstituencyIntelligence.jsx` | `/constituency-intelligence` | Public marketing page for the constituency intelligence product |
| `Subscribe.jsx` | `/subscribe` | Stripe subscription checkout (card + invoice options) |
| `Pricing.jsx` | — | Pricing calculator component (not directly routed; used by Subscribe) |
| `Cart.jsx` / `CartEntry.jsx` | `/cart` | Shopping cart |
| `Checkout.jsx` / `CheckoutEntry.jsx` | `/checkout` | Checkout flow |
| `CheckoutConfirmation.jsx` / `CheckoutConfirmationEntry.jsx` | `/checkout/confirmation` | Post-checkout confirmation |
| `Session.jsx` | `/portal/session` | Debug view of current session tokens |
| `legal/PrivacyPage.jsx` | `/privacy` | Privacy policy |
| `legal/TermsPage.jsx` | `/terms` | Terms of service |
| `legal/CookiesPage.jsx` | `/cookies` | Cookie policy |

### Portal pages (all under `/portal`, auth-gated via `ProtectedRoute`)

| File | Route | What it does |
|------|-------|--------------|
| `portal/PortalLayout.jsx` | `/portal` (shell) | Portal shell: loads user status, sidebar nav, subscription banner, wraps `PermissionsProvider` |
| `portal/Dashboard.jsx` | `/portal` | Home dashboard with product cards and subscription status |
| `portal/Uploads.jsx` | `/portal/uploads` | Marked register upload tool; polls job status every 30s |
| `portal/PricingRules.jsx` | `/portal/pricing-rules` | Pricing rules reference page |
| `portal/Quotes.jsx` | `/portal/ops/quotes` | Quote request list |
| `portal/QuoteDetail.jsx` | `/portal/ops/quotes/:ref` | Individual quote detail |
| `portal/Integrations.jsx` | `/portal/settings/integrations` | Xero integration status and test invoice |
| `portal/DataSourcesPage.jsx` | `/portal/data-sources` | Lists all data sources used by the intelligence models |
| `portal/MPPersona.jsx` | `/portal/mp-persona` | AI MP Persona Generator; password-gated (`"persona2026"`); caches results in localStorage |
| `portal/PortalNotFound.jsx` | `/portal/*` | 404 fallback for unmatched portal routes |

### Portal / admin (admin-only, shown in nav only when `isAdmin` is true)

| File | Route | What it does |
|------|-------|--------------|
| `portal/admin/ManualReviewPage.jsx` | `/portal/admin/manual-review` | Review upload jobs flagged for manual inspection |
| `portal/admin/PermissionsPage.jsx` | `/portal/admin/users` | Manage user permissions: grant/revoke association access, set subscription status |
| `portal/admin/AssociationsPage.jsx` | `/portal/admin/associations` | CRUD for associations and their linked constituencies |
| `portal/admin/ElectionsPage.jsx` | `/portal/admin/elections` | Manage elections; trigger Democracy Club sync |
| `portal/admin/CrmPage.jsx` | `/portal/admin/crm` | CRM: contact management backed by Supabase, persistent sessions |

### Portal / alerts

| File | Route | What it does |
|------|-------|--------------|
| `portal/alerts/AlertsPage.jsx` | `/portal/alerts` | Lists all active rows from Supabase `political_alerts` table |
| `portal/alerts/ByElectionRiskDashboard.jsx` | `/portal/alerts/by-election-risk` | Section 85 early warning dashboard. Admin sees all national `by_election_risk` alerts; standard user sees constituency-scoped alerts (resolved via `constituency_council_lookup`). Three filter dropdowns: Status (Elevated/Critical/Vacant), Region, Party. Table sorted by months elapsed descending. Status badges: vacant → dark red `#7f1d1d`, critical → `error` class, elevated → `warning` class. |
| `portal/alerts/byElectionRiskApi.js` | — | `getAllByElectionAlerts()` (admin), `getByElectionAlertsForConstituencies(ids)` (standard user), `parseAlerts()` (parses `detail` JSON, enriches with `local_authorities` join). |

### Portal / analytics

| File | Route | What it does |
|------|-------|--------------|
| `portal/analytics/ByElectionWatchPage.jsx` | `/portal/analytics/by-election-watch` | Watchlist of marginal seats with multi-criterion risk scoring |
| `portal/analytics/CorrelationsPage.jsx` | `/portal/analytics/correlations` | Demographic correlations with swing, by region |
| `portal/analytics/ModelPerformancePage.jsx` | `/portal/analytics/model-performance` | Model validation summaries from `runtimeValidationSummaries.js` |
| `portal/analytics/ScenarioPage.jsx` | `/portal/analytics/scenario` | National swing scenario modeller |

### Portal / constituency

| File | Route | What it does |
|------|-------|--------------|
| `portal/constituency/ConstituencyIndex.jsx` | `/portal/constituency` | Browse/search all constituencies; choropleth map |
| `portal/constituency/ConstituencyDetail.jsx` | `/portal/constituency/:onsCode` | Constituency detail: election history, demographics, candidates, councils |
| `portal/constituency/VulnerabilityDashboard.jsx` | `/portal/constituency/vulnerability` | Table of constituencies ranked by vulnerability score |
| `portal/constituency/ReformThreatIndex.jsx` | `/portal/constituency/reform-threat` | Reform UK threat index table |
| `portal/constituency/TargetSeatsPage.jsx` | `/portal/constituency/target-seats` | 2029 target seats by classification (Top Target / Key Target / Longer Shot) |
| `portal/constituency/LibDemThreatPage.jsx` | `/portal/constituency/libdem-threat` | Lib Dem threat index table |
| `portal/constituency/GreenThreatPage.jsx` | `/portal/constituency/green-threat` | Green Party threat index table |
| `portal/constituency/ConstituencyMapClient.jsx` | — | Browser-only react-simple-maps choropleth for ConstituencyIndex; lazy-loaded |
| `portal/constituency/AnalyticsChoroplethMapClient.jsx` | — | Browser-only choropleth variant for analytics views; lazy-loaded |
| `portal/constituency/constituencyApi.js` | — | All Supabase query functions for constituency/analytics data |
| `portal/constituency/constituencyPresentation.js` | — | Display formatting helpers for constituency data |

### Portal / local-government

| File | Route | What it does |
|------|-------|--------------|
| `portal/local-government/LocalGovIndex.jsx` | `/portal/local-government` | Browse local authorities; council political composition |
| `portal/local-government/LocalGovDetail.jsx` | `/portal/local-government/:gssCode` | Council detail: composition, wards, election results, councillors. Contains `ByElectionEarlyWarningSection` component (rendered below the tabs Card, above `DataProvenancePanel`) — shows a table of flagged councillors from `political_alerts` for this authority, or "No current early warning flags" empty state. |
| `portal/local-government/LGRTrackerPage.jsx` | `/portal/local-government/lgr` | LGR tracker: countdown to key dates, status by wave (Surrey/DPP/Wave 2) |
| `portal/local-government/localGovApi.js` | — | Supabase query functions for local government data. Includes `getByElectionAttendanceAlerts(authorityId)` — fetches active `by_election_risk` alerts for a given authority, filters to rows where `detail.councillorName` is truthy. |
| `portal/local-government/localGovQuality.js` | — | Data quality helpers for local government records |

---

## Frontend Components (`src/components/`)

| File | What it does |
|------|--------------|
| `AssociationSelector.jsx` | Dropdown to select a Conservative association from the JSON data file |
| `Badge.jsx` | Small inline status badge. Tones: default, active, warning, danger, info, accent. Class applied directly as tone name (e.g. `className="badge active"`) |
| `Button.jsx` | Polymorphic button (`as` prop); variants: primary, secondary, cta, ghost |
| `Card.jsx` | White card container with optional title and action slot |
| `CartSummary.jsx` | Cart line-item summary shown on checkout pages |
| `ConfigErrorScreen.jsx` | Full-screen error when required env vars are missing |
| `CookieNotice.jsx` | Cookie consent banner (persists dismissal in localStorage) |
| `DataProvenancePanel.jsx` | Expandable panel showing data source provenance for an entity |
| `ErrorBoundary.jsx` | React error boundary; shows fallback UI on uncaught render errors |
| `Footer.jsx` | Site footer with legal links |
| `IdleWarning.jsx` | Modal countdown shown 4 minutes after last activity; auto-logs out after 1 more minute |
| `LgrUrgencyBanner.jsx` | Countdown strip showing days until Wave 2 close and Surrey shadow elections |
| `ModelConfidenceBadge.jsx` | Badge showing model confidence level (High / Medium / Low / Insufficient data) |
| `PageLayout.jsx` | Standard page wrapper with title, description, and action slot |
| `ProtectedRoute.jsx` | Route guard; redirects to `/login` if session is missing or expired |
| `ScoringMethodologyPanel.jsx` | Expandable panel showing how a model's score is calculated and weighted |
| `SignalAuditPanel.jsx` | Expandable panel listing signals used by a model with coverage and status |
| `SignupForm.jsx` | Reusable signup/onboarding form |
| `ThreatMethodologyDisclosure.jsx` | Collapsible methodology note shown on threat index pages |
| `UpgradePrompt.jsx` | Shown when a feature requires a subscription; links to `/subscribe` |

---

## SEO Layer (`src/seo/`)

| File | What it does |
|------|--------------|
| `seoConfig.js` | Site-level constants: `SITE_URL`, `SITE_NAME`, `SITE_LEGAL_NAME`, `LOGO_PATH`, `CONTACT_EMAIL` |
| `seoRoutes.js` | All public route SEO entries (title, description, changefreq, priority, noindex). Title format: keyword-first. `noindexPrefixes = ["/portal"]` auto-noindexes all portal routes. Blog slugs resolved dynamically from frontmatter. |
| `RouteSeo.jsx` | Reads current pathname, looks up route in `seoRoutes.js`, renders `Seo`. Title format: `` `${title} \| Political Solutions` `` |
| `Seo.jsx` | Renders `<title>`, meta description, canonical, OG tags, `twitter:card summary_large_image`, and JSON-LD scripts via `react-helmet-async` |
| `structuredData.js` | JSON-LD schema builders: `buildOrganisationSchema()`, `buildWebsiteSchema()`, `buildServicesSchema()`, `buildElectionSupportSchema()`, `buildFaqSchema(faqs)` |

**`buildFaqSchema(faqs)`** — takes an array of `{ question, answer }` objects, returns a `FAQPage` JSON-LD object. Used in `Services.jsx`.

---

## Frontend Libraries (`src/lib/`)

| File | What it does |
|------|--------------|
| `adminElectionsApi.js` | Admin CRUD for Supabase `elections` table; maps DynamoDB-style row shapes |
| `analytics.js` | GA4 page tracking via `usePageTracking()` hook; dev badge helper |
| `calibrationRecommendations.js` | Generates human-readable calibration recommendations from model specs |
| `cognito.js` | PKCE helpers: `startLogout`, `clearStoredSession` |
| `enquiriesApi.js` | `insertEnquiry()` — inserts a row into Supabase `enquiries` table |
| `enquiryApi.js` | HTTP client for the enquiry/quote API (enquiry-api stack) |
| `intelligenceMetadataApi.js` | Reads `data_confidence_level`, `data_last_reviewed_at`, `dataset_provenance_links` from Supabase |
| `lgrUrgency.js` | LGR key dates, countdown logic, Surrey structure, `groupLgrRecords()` |
| `modelBacktestApi.js` | `getModelBacktestAvailability()` — wraps `modelPerformanceApi` with grouping |
| `modelCalibrationSummary.js` | Builds a calibration summary object for display |
| `modelConfidence.js` | `getModelConfidence()` — derives confidence level from available signals |
| `modelPerformanceApi.js` | Queries `model_performance_backtests` from Supabase |
| `modelPerformanceSummary.js` | Presentation-layer summary of performance data |
| `modelPresentationState.js` | Derives UI presentation state (badge colour, label) from model status |
| `modelValidation.js` | Validation spec helpers; wraps `modelValidationSpecs.js` config |
| `permissionsApi.js` | Full permissions CRUD: `getUserConstituencies`, `getUserPermissions`, `grantPermission`, `revokePermission`, `listAssociations`, `listSubscriptions`, `setSubscriptionStatus` |
| `personaApi.js` | `buildPersona(mpName)` — POSTs to `VITE_PERSONA_API_URL` (Lambda Function URL) |
| `quoteApi.js` | HTTP client for enquiry/quote/Xero endpoints on the enquiry-api stack |
| `runtimeValidationSummaries.js` | Builds structured validation delivery summaries for ModelPerformancePage |
| `scenarioModeller.js` | `projectNationalScenario()` — applies swing inputs to 2024 GE baseline to project seat outcomes |
| `signalAudit.js` | `getSignalAuditForModel()` — returns signal-level audit rows for a model |
| `subscriptionApi.js` | Stripe API calls + Supabase subscription reads; `getUserSubscriptionStatus`, `isAdmin`, `listAssociationsWithPricing` |
| `subscriptionPricing.js` | `calculateAssociationSubscriptionPricing()` — tiered pricing by constituency count |
| `supabase.js` | Re-exports `supabase` from `supabaseClient.js` (legacy shim, prefer direct import) |
| `supabaseClient.js` | Anon Supabase client — use for public/constituency queries |
| `supabaseServiceClient.js` | Service role Supabase client — use for permissions/subscriptions (bypasses RLS) |
| `uploadApi.js` | HTTP client for the upload API: `createJob`, `listJobs`, `listElections`, `getMe`, `getAdminMe`, `listOrganisations`, `applyForApproval` |

---

## React Context (`src/context/`)

| File | What it does |
|------|--------------|
| `PermissionsContext.jsx` | `PermissionsProvider` wraps the portal and loads `allowedConstituencies` (flat list) and `isAdmin` flag from Supabase on mount. `usePermissions()` hook consumes it. Do not modify without understanding the full permissions chain. |

---

## Lambda Functions (`infra/upload-api/src/`)

| File | AWS function name (logical) | Trigger | What it does |
|------|---------------------------|---------|--------------|
| `handler.mjs` | `UploadFunction` | HTTP API Gateway | Routes all HTTP events: POST /jobs (create upload), GET /jobs (list), GET /jobs/{id}, GET /jobs/{id}/download, GET /elections, GET /organisations, GET /me, POST /apply, POST /onboarding/signup, and all /admin/* endpoints |
| `worker.mjs` | `WorkerFunction` | SQS (`ProcessQueue`) | Processes queued upload jobs: reads file from S3, runs against elections data, writes output back to S3 |
| `uploadCompleteHandler.mjs` | `UploadCompleteFunction` | S3 ObjectCreated on `uploads/` prefix | Looks up job by S3 key, enqueues message on ProcessQueue |
| `scanResultHandler.mjs` | `ScanResultHandlerFunction` | EventBridge (GuardDuty malware scan results) | Processes scan results; enqueues clean files on ProcessQueue |
| `personaHandler.mjs` | `PersonaFunction` | Lambda Function URL | MP Persona Generator: fetches Parliament Members API, Hansard (10 pages), Wikipedia, press releases → Anthropic Claude → returns `{ systemPrompt, mpName }`. Requires `ANTHROPIC_API_KEY` set manually. |
| `byElectionMonitor.mjs` | `ByElectionMonitorFunction` | EventBridge schedule (daily 06:00 UTC) | Polls Parliament Members API for recently departed Commons members; inserts `political_alerts` rows; resolves alerts where seat is now filled |
| `attendanceRiskRefresh.mjs` | `AttendanceRiskRefreshFunction` | EventBridge schedule (Mon 07:00 UTC) | Re-scores all councillor attendance against Section 85 LGA 1972 thresholds (critical ≥5 months, vacant ≥6 months); inserts `political_alerts` rows; deduplicates by `title + local_authority_id + is_active`. Skips authorities with no attendance data or data older than 365 days. |
| `electionsRepo.mjs` | — | — | DynamoDB access for elections table; always uses full `LastEvaluatedKey` pagination |
| `usersRepo.mjs` | — | — | DynamoDB user records; `putUserIfAbsent` defaults `status: "APPROVED"` |
| `submissionsRepo.mjs` | — | — | DynamoDB upload job records |
| `orgsRepo.mjs` | — | — | DynamoDB organisation records |
| `geoLookupRepo.mjs` | — | — | Ward→PCON lookup from DynamoDB geo table |
| `auditRepo.mjs` | — | — | Writes to DynamoDB audit-log table |
| `manualReviewRepo.mjs` | — | — | DynamoDB access for jobs flagged for manual review |
| `supabaseElectionsRepo.mjs` | — | — | Supabase-backed elections queries (used when Supabase is configured) |
| `democracyClubSync.mjs` | — | — | Syncs elections from Democracy Club API into elections table |
| `dynamoClient.mjs` | — | — | DynamoDB DocumentClient factory |

---

## Infrastructure (`infra/upload-api/template.yaml`)

Every resource in the SAM template:

| Resource | Type | Description |
|----------|------|-------------|
| `UploadsBucket` | S3 Bucket | Receives uploaded files (`uploads/` prefix) and processed outputs (`outputs/` prefix); 90-day lifecycle on both; private |
| `JobsTable` | DynamoDB | Upload job records; GSIs: `UserSubIndex`, `S3KeyIndex`, `ManualReviewIndex`; TTL on `expiresAt` |
| `UsersTable` | DynamoDB | User approval records; GSI: `StatusCreatedAtIndex` |
| `ElectionsTable` | DynamoDB | Elections; GSI: `StatusPconDateIndex` |
| `OrganisationsTable` | DynamoDB | Association/federation records; GSI: `ActiveOrgTypeIndex` |
| `AuditLogTable` | DynamoDB | Audit trail; GSIs: `ActorCreatedAtIndex`, `TargetCreatedAtIndex` |
| `SubmissionsTable` | DynamoDB | Processed submission results; GSI: `UserIdCreatedAtIndex` |
| `ProcessDLQ` | SQS Queue | Dead-letter queue for ProcessQueue (14-day retention) |
| `ProcessQueue` | SQS Queue | Work queue for upload processing; max receive 3 before DLQ |
| `UploadApi` | HTTP API Gateway | HTTP API with CORS and throttling |
| `UploadWebAcl` | WAF WebACL | Rate limit + AWS managed rules (currently disabled — `WafEnabled=false`) |
| `UploadWebAclAssociation` | WAF Association | Associates WAF with UploadApi |
| `UploadWafLogGroup` | CloudWatch Logs | WAF access logs |
| `UploadWafLogging` | WAF Logging Config | Routes WAF logs to CloudWatch |
| `UploadFunction` | Lambda | Main HTTP API handler |
| `WorkerFunction` | Lambda | SQS consumer; `Enabled: false` on EventSourceMapping (local listener is sole consumer) |
| `WorkerProcessQueueMapping` | Lambda Event Source | Wires SQS → WorkerFunction; **disabled** |
| `UploadCompleteFunction` | Lambda | S3 trigger → DynamoDB lookup → SQS enqueue |
| `UploadCompleteFunctionS3Permission` | Lambda Permission | Allows S3 to invoke UploadCompleteFunction |
| `ScanResultHandlerFunction` | Lambda | GuardDuty scan result handler |
| `ScanResultsRule` | EventBridge Rule | Routes GuardDuty scan events (conditional on `EnableGuardDutyScan=true`) |
| `ScanResultHandlerInvokePermission` | Lambda Permission | Allows EventBridge to invoke ScanResultHandlerFunction |
| `MalwareProtectionRole` | IAM Role | GuardDuty service role for S3 malware protection plan |
| `UploadsMalwareProtectionPlan` | GuardDuty Plan | Malware scanning for `uploads/` prefix (conditional) |
| `PersonaFunction` | Lambda | MP Persona Generator; 300s timeout; exposed via Function URL |
| `PersonaFunctionUrl` | Lambda Function URL | Public HTTPS endpoint for PersonaFunction (bypasses 29s API Gateway limit) |
| `PersonaFunctionUrlPermission` | Lambda Permission | Allows public invocation of PersonaFunctionUrl |
| `ByElectionMonitorFunction` | Lambda | Daily Parliament API poller; writes `political_alerts` rows |
| `AttendanceRiskRefreshFunction` | Lambda | Weekly Monday Section 85 attendance scorer; inserts/deduplicates `political_alerts` for critical/vacant councillors |
| `UploadFunctionErrorsAlarm` | CloudWatch Alarm | Alerts on any Lambda error for UploadFunction |
| `WorkerFunctionErrorsAlarm` | CloudWatch Alarm | Alerts on any Lambda error for WorkerFunction |
| `UploadCompleteFunctionErrorsAlarm` | CloudWatch Alarm | Alerts on any Lambda error for UploadCompleteFunction |
| `ScanResultHandlerErrorsAlarm` | CloudWatch Alarm | Alerts on any Lambda error for ScanResultHandlerFunction |

---

## Scripts (`scripts/`)

| File | What it does | Still needed? |
|------|--------------|---------------|
| `prerender.mjs` | Renders public routes to static HTML for Amplify (`npm run build` calls this) | Yes — core build step |
| `generate-sitemap.mjs` | Generates `dist/sitemap.xml` from public routes | Yes — postbuild |
| `generate-rss.mjs` | Generates `dist/rss.xml` from blog posts | Yes — postbuild |
| `blog-automation.mjs` | Drafts blog posts using AI from a topic prompt | Yes — blog workflow |
| `blog-content.mjs` | Blog content helpers for automation | Yes — blog workflow |
| `blog-routes.mjs` | Resolves blog routes from markdown files | Yes — blog workflow |
| `run-blog-automation.mjs` | Entry point for `npm run blog:automate` | Yes |
| `approve-blog-post.mjs` | Moves a draft blog post to approved state | Yes |
| `publish-blog-post.mjs` | Publishes an approved blog post | Yes |
| `generateAssociationsJson.mjs` | Generates `src/data/associations.json` from source data | Yes — run when associations change |
| `prerender-routes.mjs` | Defines which routes to prerender | Yes — consumed by prerender.mjs |
| `seed-elections.mjs` | Seeds elections into DynamoDB from `elections.seed.json` | Occasional |
| `seed-organisations.mjs` | Seeds organisations into DynamoDB from `organisations.seed.json` | Occasional |
| `verify-prerender-output.ps1` | Checks prerender output for `<title>` tags — **always fails** (looks for `<title>`, gets `<title data-rh="true">`) | Unreliable — do not rely on |
| `verify-prod-headers.ps1` | Checks security headers on the production site | Yes — pre-deploy check |
| `verify-prod-seo-html.ps1` | Checks SEO HTML on production | Yes — pre-deploy check |
| `deploy-upload-api.sh` | SAM build + deploy to `ps-upload-api-prod` | Yes |
| `deploy-enquiry-api.sh` | SAM build + deploy to `ps-enquiry-api-prod` | Yes |
| `listener/` | Local Python listener that consumes SQS and runs the worker locally | Yes — required for processing |
| `sync_elections_from_democracy_club.py` | Syncs elections from Democracy Club into Supabase | Occasional |
| `calculate_*.py` | Python scripts for computing threat indices, swings, targets, vulnerability scores | Yes — run when recomputing model data |
| `import_*.py` | Python scripts for importing data from external sources | Yes — run when importing fresh data |
| `constituency_data_audit.py` | Audits completeness of all 21 Supabase tables; writes UTF-8-BOM CSV to `scripts/constituency_data_audit_YYYY-MM-DD.csv` | Occasional — run before major import cycles |
| `import_council_composition.py` | Imports council political composition from OCD UK CSV into `council_data`; pre-flight checks: schema columns present, LGR new councils, dataset freshness vs May 2025 elections | Requires migration `20260512_add_council_composition_columns.sql` first |
| `import_section85_flags.py` | Imports manually-curated Section 85 priority flags into `political_alerts` as `by_election_risk` alerts. Risk thresholds: ≥6 months (or 99=never) → vacant/critical; ≥5 → critical/critical; ≥4 → elevated/high; <4 → skip. Deduplicates on `title + local_authority_id + is_active`. | Run with `--file <path_to_csv>` |
| `extend_by_election_risk_attendance.py` | One-shot script: scores `councillor_attendance` table against Section 85 thresholds and inserts `political_alerts`; safe to re-run (same dedup as above) | Superseded by weekly Lambda `attendanceRiskRefresh.mjs` for ongoing rescoring |
| `dedup_councillor_attendance.py` | Removes duplicate rows from `councillor_attendance` — groups by `(local_authority_id, councillor_name, ward)`, keeps row with highest `meetings_eligible` (tiebreak: latest `period_end`), deletes the rest via batched REST DELETE. Includes post-delete verification pass. Supports `--dry-run`. | Run when data sources are re-concatenated; applied May 2026 (59,388 → 12,163 rows) |
| `backtest_*.py` | Python model backtesting scripts | Yes — model validation |
| `export_runtime_validation_summaries.py` | Exports validation data to Supabase for ModelPerformancePage | Yes |
| `add_intelligence_quality_fields.sql` | SQL to add quality metadata columns to Supabase tables | Applied — may not need re-running |
| `create_subscriptions_table.sql` | DDL for subscriptions table | Applied |
| `create_scoring_model_versions.sql` | DDL for model version tracking | Applied |

---

## AI Skills (`.agents/skills/`)

Shared AI assistant skills tracked in version control. Installed via `npx skills` (lock file: `skills-lock.json`) or `uipro-cli`. Available to all agents that read `.agents/skills/`.

| Skill | Source | Purpose |
|-------|--------|---------|
| `emil-design-eng` | `emilkowalski/skill` | Emil Kowalski's UI polish philosophy: animation, component design, invisible details |
| `impeccable` | `pbakaus/impeccable` | Full-spectrum UI/UX work: audit, polish, animate, redesign, live browser iteration |
| `ui-ux-pro-max` | `uipro-cli` | UI/UX Pro Max: design patterns, colour, typography, stack-specific guidance (React, Next.js, etc.) |
| `brandkit` | `Leonxlnx/taste-skill` | Brand identity and kit guidance |
| `design-taste-frontend` | `Leonxlnx/taste-skill` | General frontend design taste |
| `full-output-enforcement` | `Leonxlnx/taste-skill` | Enforces complete, untruncated code output |
| `gpt-taste` | `Leonxlnx/taste-skill` | GPT-style aesthetic taste layer |
| `high-end-visual-design` | `Leonxlnx/taste-skill` | Elevated visual design standards |
| `image-to-code` | `Leonxlnx/taste-skill` | Convert design images/screenshots to code |
| `imagegen-frontend-mobile` | `Leonxlnx/taste-skill` | Mobile UI image generation guidance |
| `imagegen-frontend-web` | `Leonxlnx/taste-skill` | Web UI image generation guidance |
| `industrial-brutalist-ui` | `Leonxlnx/taste-skill` | Industrial/brutalist UI aesthetic |
| `minimalist-ui` | `Leonxlnx/taste-skill` | Minimalist UI aesthetic |
| `redesign-existing-projects` | `Leonxlnx/taste-skill` | Approach for redesigning existing UIs |
| `stitch-design-taste` | `Leonxlnx/taste-skill` | Stitch-style design taste |

---

## Key Patterns

### How to add a new Lambda function

1. Add the handler file to `infra/upload-api/src/` (e.g. `myHandler.mjs`)
2. Add a `Type: AWS::Serverless::Function` resource in `template.yaml` pointing to the handler
3. Add any required environment variables under `Environment.Variables`
4. Add IAM policies under `Policies`
5. Add an `Events` block for the trigger (HttpApi, Schedule, etc.)
6. Add a CloudWatch alarm resource for the function
7. Run `scripts/deploy-upload-api.sh` targeting `ps-upload-api-prod`
8. If using a Lambda Function URL (to bypass API Gateway timeout), add `Type: AWS::Lambda::Url` and `Type: AWS::Lambda::Permission` resources

### How to add a new portal page with permissions gating

1. Create the page component in `src/pages/portal/`
2. Add a `Route` in `App.jsx` under the `PortalLayout` parent route, wrapped in `<Suspense>`
3. Add a `NavLink` in `PortalLayout.jsx` under the appropriate nav group
4. To gate by constituency access: use `const { allowedConstituencies, isAdmin } = usePermissions()` and show `<UpgradePrompt />` when access should be blocked
5. To gate by admin: check `isAdmin` from `usePermissions()` and return `null` or a 403 card

### How to add structured data to a page

For pages that need JSON-LD beyond the default Organisation + Website schemas:

```jsx
import { Helmet } from "react-helmet-async";
import { buildFaqSchema, buildServicesSchema } from "../seo/structuredData.js";

// Inside the component return:
<Helmet>
  {[buildServicesSchema(), buildFaqSchema(faqs)].map((schema) => (
    <script key={schema["@type"]} type="application/ld+json">
      {JSON.stringify(schema)}
    </script>
  ))}
</Helmet>
```

`RouteSeo` (rendered globally in `App.jsx`) handles title, description, canonical, and the default Organisation + Website schemas. Add page-specific schemas via a local `<Helmet>` — react-helmet-async accumulates `<script>` tags from multiple Helmets without conflict.

### How to add a new public route to SEO

Add an entry to `seoRoutes` in `src/seo/seoRoutes.js`:

```js
{
  path: "/my-page",
  title: "Keyword-first title for the page",   // under 60 chars, no "Political Solutions |" prefix
  description: "Benefit-focused description.",  // 150–160 chars
  changefreq: "monthly",
  priority: 0.7,
}
```

`RouteSeo.jsx` wraps every title as `` `${title} | Political Solutions` `` — never include the brand suffix in the `title` field.

### How to query Supabase from the frontend

```js
// Anon client — for public/constituency data
import { supabase } from "../../lib/supabaseClient.js";
const { data, error } = await supabase.from("constituencies").select("*").eq("ons_code", onsCode).single();

// Service role client — for permissions/subscriptions
import { getSupabaseServiceClient } from "../../lib/supabaseServiceClient.js";
const db = getSupabaseServiceClient();
if (!db) return; // not configured
const { data } = await db.from("user_permissions").select("*").eq("cognito_sub", sub);
```

All constituency intelligence queries go through `src/pages/portal/constituency/constituencyApi.js`. Add new query functions there rather than querying Supabase inline in page components.

### How to query Supabase from a Lambda function

`byElectionMonitor.mjs` is the reference implementation. It uses raw `fetch` against the Supabase REST API:

```js
async function supabaseRequest(path, { method = "GET", params = {}, body, extraHeaders = {} } = {}) {
  const url = new URL(`/rest/v1/${path}`, SUPABASE_URL + "/");
  // append params as query string
  const res = await fetch(url.toString(), {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // ...
}
```

Pass `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` as Lambda environment variables via SAM parameters.

---

## Critical Rules

- **Always target `ps-upload-api-prod` (API ID `77i4hpcez8`), never `upload-api` (API ID `ra5ljyj9b0`)** — they are completely separate stacks with separate DynamoDB tables and S3 buckets. The legacy stack is not connected to Amplify.
- **Always use `supabase` from `src/lib/supabaseClient.js` or `src/lib/supabase.js`** (they are equivalent). Import from either; do not create a new Supabase client instance anywhere else.
- **Never modify `src/context/PermissionsContext.jsx` or `src/lib/permissionsApi.js` without understanding the full permissions chain** — these files control whether a user can access constituency data. The chain is: `PortalLayout` → `PermissionsProvider` → `getUserConstituencies` → `user_permissions` → `association_constituencies` → `constituencies`.
- **Pure CSS only** — no Tailwind, no CSS-in-JS, no inline style objects except for dynamic values (colours, widths). All layout and design tokens are in `src/index.css`.
- **Design tokens only — no raw hex values in components** — use `var(--color-navy)`, `var(--color-cta)`, etc. Never paste `#0F2744` or `#1A6B3C` into a component file. See `POLITICAL_SOLUTIONS_DESIGN_SYSTEM.md` for the full token list.
- **No gold, no gradients, no large radii** — `#c89b4a` and similar amber/gold values are banned. No `background: linear-gradient(...)` on any surface. `border-radius` max 6px (`var(--radius-lg)`).
- **Title format in `seoRoutes.js`: keyword-first, no brand suffix** — `RouteSeo.jsx` appends `| Political Solutions` automatically. Never write `Political Solutions | X` in the title field.
- **PowerShell for all terminal commands** — never use `&&` operator or `\` line continuation in Bash. Chain commands with `;` or separate PowerShell statements. AWS CLI path arguments starting with `/aws/` must be run in PowerShell, not git bash (git bash mangles them).
- **`ANTHROPIC_API_KEY` is not in CloudFormation** — it must be set manually in the Lambda console on `PersonaFunction` after every SAM deploy. It is intentionally left blank in `template.yaml`.
- **Never import `ConstituencyMapClient.jsx` or `AnalyticsChoroplethMapClient.jsx` statically** — they use browser-only SVG/ResizeObserver APIs and will crash SSR/prerender. Always load via `React.lazy()`.
- **DynamoDB elections table: always paginate** — use `LastEvaluatedKey` loop; a single Scan page may not return all record types when the table is large.
