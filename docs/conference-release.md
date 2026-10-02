# Conference page release and operation

## Scope

Public URL: `https://politicalsolutions.uk/conference`. Paul Startin, 07525 167 856,
paul@politicalsolutions.uk. Controller: Startin Sales Solutions Ltd T/A Political Solutions.
The page invites enquiries about any project, without a biography or list of services.
Existing Archivo artwork/typeface are retained.
The only conference label to edit annually is `CONFERENCE_KICKER` in `src/pages/ConferencePage.jsx`;
an empty string hides it.

No portal/auth/upload handler is changed. A separate Lambda handler serves two new paths on the
existing enquiry API. Supabase remains server-only. Direct QR visits use a dedicated, prerendered
React entry without the portal, auth, Supabase browser SDK or GA4. Existing CSS is reused inline
on this one page to avoid a blocking request. The three Archivo WOFF2 files are full-glyph
conversions of the existing TTF masters, made with FontTools 4.60.1, not new fonts.

## Confirmed infrastructure, 2 October 2026

- AWS account: 561375865143; region: eu-west-2.
- Enquiry stack: `enquiry-api`; API: `https://rn06rrhtfe.execute-api.eu-west-2.amazonaws.com`.
- Amplify: `d3m00d54dqkkxk`, production branch `main`, automatic builds enabled.
- The frontend's existing `VITE_ENQUIRY_API_URL` already points to that API.
- Live AllowedOrigins includes both apex and www, plus localhost:5173. Preserve these values.
- Existing WafEnabled is false. Preserve existing stack parameters; do not blindly apply defaults.
- SES identity `politicalsolutions.uk`: verified, DKIM SUCCESS with signing enabled,
  custom MAIL FROM `mail.politicalsolutions.uk` SUCCESS. Existing sender is paul@politicalsolutions.uk.
  No DNS changes are required based on these checks. Check a delivered launch-test message's
  authentication headers as the final confirmation; Microsoft 365 records alone were not used as proof.

## Release after Paul's review

1. Apply `supabase/migrations/20261002130248_add_conference_leads.sql` using the existing
   Supabase migration workflow, dispatched on this branch. Do not paste SQL into the dashboard.
   The normal main-merge workflow safely skips the already-applied migration later.
2. Build/package the enquiry SAM template and prepare a CloudFormation change set against
   `enquiry-api`. Preserve every existing parameter, including the service-role secret, origins,
   and WafEnabled=false. Set ConferenceEmailEnabled=true. Inspect the change set before execution:
   only conference resources/routes and packaging updates are expected; no deletions or replacements
   of existing resources. Do not use a new default stack name or overwrite secrets with empty defaults.
3. Verify the new backend paths and hourly retention schedule. Check DB/SES connectivity and
   CloudWatch for errors. The new function has a 12-second timeout; DB calls are bounded at 3.5 seconds,
   notification at 1.5 seconds with no SDK retry. Failed notifications log the lead ID, never form contents.
4. Merge the reviewed PR and wait for the Amplify production build and migration workflow to succeed.
5. Read the LIVE Amplify rewrite list, prepend only the conference 200 rewrite to
   `/conference/index.html`, and preserve every existing rule. The repository's `amplify.yml` and
   `scripts/amplify-customRules.next.json` contain the proposed rule, but do not assume changing
   these files alone updates app-level rewrites. Do not replace live rules wholesale with a stale file.
6. Request the apex URL and trailing-slash form directly. Confirm 200, the exact title, canonical,
   OG/Twitter image and noindex in raw HTML, correct UI after hydration, and no redirect to home/www.
   Confirm the page is absent from the sitemap. Its metadata is prerendered, so link crawlers can read it.
7. Submit one clearly labelled synthetic launch enquiry and check the saved row and Paul's notification.
   Check notification headers for SPF/DKIM/DMARC. Try SELECT and a valid INSERT with an anonymous key;
   both must be refused, as must authenticated-client access. This must be rechecked on production:
   local integration evidence does not prove production deployment.
8. Record the launch-test date when reporting figures; use 4–7 October for the conference itself.
   If anything fails, keep the contact-only page as the fallback and disable/hide the form until fixed.
   Never deploy an active form without the privacy update or claim that an unsuccessful insert succeeded.

## Visits and completions

The backend counts one visit when a fresh page instance calls `/conference/visit`. Retries and
React StrictMode reuse an in-memory ID and count once. Reloads and new tabs count again. There are
no tracking cookies, localStorage identifiers, fingerprinting, GA requests, or third-party tracking.
Counts require JavaScript/network access and are not unique people, verified humans or QR scans.
Previews do not count unless a crawler executes JavaScript. Ordinary bot traffic can affect counts.

Completed means a durable database insert. The completion counter increments in the SAME transaction
as the row, once per request ID, irrespective of notification delivery. Different completed enquiries
by one visitor count separately. Daily ratios are not a unique-user/cohort conversion rate.
Counts use Europe/London dates and remain after personal records expire.

Read the restricted `conference_daily_metrics` table through an administrator's Supabase session:

```sql
SELECT day, views, submissions,
       round(100.0 * submissions / nullif(views, 0), 1) AS completion_percent
FROM public.conference_daily_metrics
WHERE day BETWEEN DATE '2026-10-04' AND DATE '2026-10-07'
ORDER BY day;
```

For a whole conference, divide total submissions by total views, rather than averaging daily percentages.
Only administrators/service-role tools can retrieve metrics or export leads. There is no public reporting
endpoint. If email fails, use `conference_leads` in the restricted admin dashboard/export, and inspect
the `conference_notification_failed` CloudWatch events. Notifications are best-effort, not queued for retry.

## Consent, retention and withdrawals

- Required unticked consent covers handling the enquiry and any political affiliation voluntarily shared.
- A separate OPTIONAL unticked box covers future Political Solutions service/conference email for up to 12 months.
  Do not use an enquiry-only record for those follow-up emails. Both choices and consent wording version
  `2026-10-02-v1` are saved server-side with the submission timestamp. Bump the version when wording changes.
- All enquiry records expire 12 calendar months after submission, not after last contact. An hourly
  scheduled job deletes expired rows, normally within an hour of expiry. Aggregate daily counts remain.
- Rate limiting uses HMAC-derived IP identifiers in minute buckets: 120 visits/minute/IP and 30
  submission attempts/minute/IP, shared across Lambda instances. IP hashes are cleaned up within
  24 hours when the schedule is healthy. These are deliberately more generous than the old limiter
  for venue Wi-Fi. Temporary random visit IDs are cleaned up after one day.
- No user-agent or referrer data is saved. The nullable columns exist for schema compatibility only.
- Paul must apply the same deletion/withdrawal rules to notification emails and exported copies;
  the database schedule cannot delete mailbox or spreadsheet copies. Handle requests received at
  paul@politicalsolutions.uk, stop the relevant emails, and delete/update the corresponding record.
  Do not turn withdrawn consent back on during export or import. Check the hourly job's CloudWatch
  errors and last successful invocation as part of routine operations.

The privacy notice identifies legitimate interests for the temporary abuse-control identifier.
Purpose: keep the form available and prevent repeated automated submissions. Necessity: shared
server-side limits need a short-lived network identifier; client-only limits can be bypassed.
Balance: keyed hashes, no form-content linkage, no cross-site use, 24-hour cleanup, generous venue
Wi-Fi thresholds and direct contact alternatives limit the impact. This design assessment follows
the [ICO's legitimate-interests guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/when-can-we-rely-on-legitimate-interests/).

## Reproducible checks

`npm run test:run`, `npm run test:api`, `npm run build`,
`node scripts/verify-conference-build.mjs`, and `sam validate --template-file infra/enquiry-api/template.yaml`.

Local integration uses disposable Supabase Postgres and PostgREST containers on loopback ports 55432
and 55433, with synthetic data and local-only keys. Start Postgres from
`public.ecr.aws/supabase/postgres:17.6.1.159`, password `conference-local-test-only`, on the
`conference-test` network; apply the migration; start `public.ecr.aws/supabase/postgrest:v16.1` with
DB URI `postgres://postgres:conference-local-test-only@conference-test-db:5432/postgres`, schema public,
anon role anon, and JWT secret `conference-local-jwt-secret-at-least-32-characters`.
Run `node scripts/verify-conference-local.mjs`. It exercises REAL database transactions and PostgREST
role enforcement, concurrent duplicate requests, honeypot/timing, shared rate limiting and retention.
Notifications are mocked, including failures and timeouts; these tests send no email.

For browser checks set the ignored local `.env.local` API base to `http://localhost:5181`, rebuild,
run `node scripts/conference-local-harness.mjs` and `node scripts/conference-preview.mjs`.
The latter serves the same route-specific HTML as Amplify; Vite's generic preview fallback otherwise
serves homepage HTML at `/conference`. The test harness binds to loopback and must never be deployed.

The recorded Lighthouse audit uses simulated mobile 4G (1.6 Mbps, 150ms RTT, 4x CPU slowdown),
390×844 CSS pixels, a cold load of the local production build and Lighthouse 13.5.0. It is lab evidence,
not a promise of identical conference-network results. See `artifacts/conference/verification.md`.
