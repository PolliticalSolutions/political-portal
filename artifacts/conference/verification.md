# Conference page verification

Checked 2 October 2026 against the isolated branch and production build.

| Check | Result |
|---|---|
| Frontend suite | 96 files, 417 tests passed |
| API suite | 10 files, 121 tests passed |
| Production client + SSR build and prerender | Passed |
| SAM template validation | Passed |
| Lighthouse mobile performance | 97 |
| Lighthouse mobile accessibility | 100 |
| First contentful paint | 1.7 s |
| Largest contentful paint / interactive | 2.5 s |
| Total blocking time | 0 ms |
| Cumulative layout shift | 0 |

Audit: Lighthouse 13.5.0, 390×844 CSS pixels, simulated 4G (1.6 Mbps, 150 ms RTT),
4x CPU slowdown, cold local production build. No portal, auth, GA or browser Supabase
requests appeared in the audit. First content is inside the two-second target;
Lighthouse's estimated interactive time is 2.5 seconds. Actual venue connections may differ.
See `audit-summary.json` and the full-page, 390-pixel-wide `mobile-390.webp` capture.
Raw HTML and JSON reports remain in the local worktree.

Real disposable PostgreSQL + PostgREST integration verified:

- Anonymous AND authenticated JWTs refused SELECT and valid INSERT on all four conference tables.
- Anonymous and authenticated clients could not execute privileged conference RPCs.
- One page-instance visit counts once across retries; five concurrent copies of one submission
  create one row, one completion and one notification attempt.
- Immediate submission rejected; a submission made after three seconds accepted.
- Honeypot submissions rejected without a lead; empty optional fields accepted.
- Database failure returns a real error. Browser check confirmed inputs and consent are retained,
  an announced error appears, and phone/email fallback links are present.
- Email failure and email timeout both leave the saved row and completion intact and return success.
- Shared rate limiting refuses requests over the configured limit.
- Retention cleanup deletes an expired personal record while retaining aggregate counts.

Browser checks at 390px: the form starts on the first screen, native labels and inputs work,
keyboard Tab passes from consent through its privacy link and optional follow-up choice to Send,
Enter submits, and success replaces the form in place and receives focus. A form exception leaves
the page and contacts available (component test). No navigation or footer menus are shown.

Raw generated HTML contains the exact title, description, canonical, OG/Twitter image and
noindex/nofollow. `/conference` is prerendered and absent from the sitemap. The dedicated entry
keeps the public page independent of authentication configuration. The unchanged homepage is
still prerendered. Hosting must apply the new rewrite before raw live HTML has these properties.

The only build warning observed is the pre-existing duplicate `session_types` key in
`src/components/campaigns/SessionForm.jsx`; that unrelated file was not changed.

Not yet claimed: production migration/endpoint/hosting deployment, a real SES notification to Paul,
production anonymous-key checks, or a post-deployment live URL check. These are release gates after
Paul's review. SES configuration was read-only verified in AWS: DKIM and custom MAIL FROM are successful.
