# Political Portal — Claude Code Context

## Key documentation

| File | What it covers |
|------|---------------|
| `CODEBASE_MAP.md` | Full file inventory, key patterns, critical rules |
| `POLITICAL_SOLUTIONS_CONTEXT.md` | Product context, users, business rules |
| `POLITICAL_SOLUTIONS_DESIGN_SYSTEM.md` | Design tokens, colour palette, typography |
| `UI_UX_AUDIT.md` | UX audit findings and improvement backlog |

## Tech stack

- **Frontend**: Vite + React, react-router-dom, react-helmet-async, react-query
- **Auth**: AWS Cognito PKCE (no Amplify SDK); tokens in `sessionStorage`
- **Database**: Supabase (Postgres); anon client in `src/lib/supabaseClient.js`
- **Hosting**: AWS Amplify; prerendered static HTML for public routes
- **Backend**: AWS SAM Lambdas (`infra/upload-api/`) + Supabase edge functions
- **Styling**: Pure CSS only — all tokens in `src/index.css`

## Critical rules (abridged — full list in `CODEBASE_MAP.md`)

- **Pure CSS only** — no Tailwind, no CSS-in-JS. Dynamic values only as inline styles.
- **Design tokens only** — `var(--color-navy)`, never raw hex. No gold (`#c89b4a`), no gradients, `border-radius` max 6px.
- **Supabase client** — always import from `src/lib/supabaseClient.js`; never create a new instance.
- **Permissions chain** — never modify `PermissionsContext.jsx` or `permissionsApi.js` without reading the full chain.
- **API target** — always `ps-upload-api-prod` (ID `77i4hpcez8`), never the legacy `upload-api` stack.
- **Lazy-load maps** — `ConstituencyMapClient.jsx` and `AnalyticsChoroplethMapClient.jsx` must use `React.lazy()`.
- **SEO titles** — keyword-first, no brand suffix; `RouteSeo.jsx` appends `| Political Solutions` automatically.
- **DynamoDB scans** — always paginate with `LastEvaluatedKey`.

## AI skills

Design and UI skills are in `.agents/skills/` (see `CODEBASE_MAP.md` for full list). Notable:

- **`impeccable`** — full UI/UX work including live browser iteration
- **`emil-design-eng`** — UI polish, animation, component design taste
- **`ui-ux-pro-max`** — stack-specific design patterns and guidance

## Running locally

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build → dist/
npm run test:run     # vitest unit tests
```

Required env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (see `.env.example`).
