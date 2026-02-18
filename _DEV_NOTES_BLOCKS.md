# Block A (SEO/prerender cleanup) — COMPLETE
- Deployed commit: 0694c29
- Verified production (politicalsolutions.uk + www):
  - Single <title> per marketing route
  - Canonical correct
  - /subscriptions robots index,follow
  - CSP Report-Only present
  - Cache-Control: public, max-age=0, s-maxage=600, must-revalidate on key marketing routes

# Block B (NOT COMMITTED) — PARKED
- WIP branch pointer: wip/block-b-sentry (stash-like commit 2d73ba1)
- Contains:
  - src/sentry.js, src/sentry.test.js
  - _debug_seo_bundle.txt
  - package.json/package-lock.json (Sentry deps)
  - plus local edits: .env.example, README.md, src/main.jsx, vite.config.js
