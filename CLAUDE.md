# Political Portal — Claude Code Reference

UK political intelligence portal built for campaign teams, party organisations, and political consultancies. Data on constituencies, elections, local government, and candidates; subscription access via Stripe; hosted on AWS Amplify.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, React Router 7 |
| Data fetching | TanStack Query v5 |
| Database / auth | Supabase (PostgreSQL + Row Level Security) |
| Auth (SSO) | AWS Cognito Hosted UI + PKCE |
| Payments | Stripe (subscriptions + one-off invoices) |
| Hosting | AWS Amplify (SPA rewrite: `/<*>` → `/index.html`) |
| Maps | react-simple-maps (choropleth, lazy-loaded) |
| Blog | Markdown files in `content/blog/`; prerendered at build |
| Tests | Vitest + Testing Library |
| Elections data | Democracy Club sync (`scripts/sync_elections_from_democracy_club.py`) |

---

## Project structure

```
src/
  pages/           # Route-level components (public + portal + admin)
  components/      # Shared UI components
  hooks/           # Custom React hooks
  utils/           # Pure helpers
  cognitoConfig.js # Cognito PKCE config
content/
  blog/            # Markdown blog posts
scripts/           # Build, seed, and sync scripts
infra/             # AWS / Supabase infrastructure config
supabase/          # Supabase migrations and seed SQL
```

Key files:
- `src/pages/portal/` — auth-gated portal pages
- `src/pages/portal/constituency/constituencyApi.js` — all Supabase constituency queries
- `src/pages/portal/admin/` — admin-only pages (shown when `isAdmin` is true)
- `CODEBASE_MAP.md` — full route-by-route map of every page
- `POLITICAL_SOLUTIONS_CONTEXT.md` — product and business context

---

## Dev commands

```bash
npm install           # Install dependencies
npm run dev           # Dev server at http://localhost:5173
npm run build         # Full production build (client + SSR + prerender)
npm run test          # Vitest unit tests
npm run test:run      # Tests without watch mode
npm run test:api      # API integration tests
```

---

## Auth flow

1. `/login` — generates PKCE verifier/challenge, redirects to Cognito Hosted UI
2. `/callback` — receives auth code, exchanges for JWT, stores in `sessionStorage`
3. `ProtectedRoute` — wraps all `/portal/*` routes; reads session from `sessionStorage`
4. `isAdmin` flag — controls visibility of `/portal/admin/*` nav items

---

## Environment variables

See `.env.example`. Key variables:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_COGNITO_*` | Cognito Hosted UI config |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe public key |
| `VITE_GISCUS_*` | Blog comment config (Giscus / GitHub Discussions) |

---

## Available legal skills

151 skills from [anthropics/claude-for-legal](https://github.com/anthropics/claude-for-legal) are installed under `.claude/skills/`. Skills require per-plugin setup via each plugin's `cold-start-interview` skill before use. Run setup once; it writes a practice profile that every other skill in the plugin reads.

Each skill is invoked as `/<plugin-name>:<skill-name>` — for example `/privacy-legal:use-case-triage`.

### privacy-legal
GDPR, UK GDPR, and global privacy. Relevant for this project given voter/contact data handling.

| Skill | Purpose |
|---|---|
| `cold-start-interview` | Setup — run this first |
| `use-case-triage` | Triage a new data processing activity |
| `pia-generation` | Generate a Privacy Impact Assessment |
| `dpa-review` | Review a Data Processing Agreement (controller or processor) |
| `dsar-response` | Draft a DSAR response within statutory timelines |
| `reg-gap-analysis` | Gap analysis against applicable privacy regulations |
| `policy-monitor` | Monitor privacy policy drift against practice |
| `customize` | Update the practice profile |

### commercial-legal
Vendor agreements, NDAs, SaaS subscriptions, and contract renewals.

| Skill | Purpose |
|---|---|
| `cold-start-interview` | Setup — run this first |
| `review` | Review any inbound agreement; auto-routes to the right sub-skill |
| `nda-review` | NDA review against your playbook |
| `vendor-agreement-review` | MSA / PSA / SOW review |
| `saas-msa-review` | SaaS / cloud subscription review |
| `renewal-tracker` | Track contract renewals and cancel-by deadlines |
| `escalation-flagger` | Route issues that exceed your sign-off authority |
| `stakeholder-summary` | Business-readable summary of a contract review |
| `amendment-history` | Track and compare contract amendments |
| `customize` | Update the practice profile |

### product-legal
Product launches, feature risk, and marketing claims.

| Skill | Purpose |
|---|---|
| `cold-start-interview` | Setup — run this first |
| `is-this-a-problem` | Fast same-minute triage for "can we do X?" Slack questions |
| `launch-review` | Full legal review of a product launch or feature |
| `feature-risk-assessment` | Risk assessment for a specific feature |
| `marketing-claims-review` | Review marketing copy for claims needing substantiation |
| `customize` | Update the practice profile |

### ip-legal
Trademark clearance, FTO, patent intake, open-source compliance, and enforcement.

| Skill | Purpose |
|---|---|
| `cold-start-interview` | Setup — run this first |
| `clearance` | First-pass trademark clearance |
| `fto-triage` | Freedom-to-operate triage |
| `invention-intake` | Intake an invention disclosure |
| `oss-review` | Open-source licence compliance review |
| `ip-clause-review` | Review IP clauses in contracts |
| `portfolio` | Track registrations and renewal deadlines |
| `cease-desist` | Draft or triage cease-and-desist letters |
| `takedown` | DMCA takedown (send and respond) |
| `infringement-triage` | Triage an inbound infringement claim |
| `customize` | Update the practice profile |

### employment-legal
UK and international employment: hiring, terminations, leave, investigations, and policy.

| Skill | Purpose |
|---|---|
| `cold-start-interview` | Setup — run this first |
| `hiring-review` | Jurisdiction-specific risk flags on a hire |
| `termination-review` | Termination risk review |
| `worker-classification` | Classify workers against the controlling test |
| `leave-tracker` | Track leave deadlines |
| `log-leave` | Log a leave event |
| `internal-investigation` | Run an internal investigation |
| `investigation-open` / `investigation-add` / `investigation-query` / `investigation-summary` / `investigation-memo` | Investigation lifecycle |
| `wage-hour-qa` | Wage and hour Q&A |
| `policy-drafting` | Draft employment policies with state/jurisdiction supplements |
| `handbook-updates` | Update the employee handbook |
| `international-expansion` / `expansion-kickoff` / `expansion-update` | International hiring |
| `customize` | Update the practice profile |

### ai-governance-legal
AI use-case registry, impact assessments, vendor AI terms, and policy monitoring.

| Skill | Purpose |
|---|---|
| `cold-start-interview` | Setup — run this first |
| `use-case-triage` | Triage a proposed AI use case against the registry |
| `ai-inventory` | Build or update the AI use-case inventory |
| `aia-generation` | Generate an AI Impact Assessment |
| `vendor-ai-review` | Review vendor AI terms for training-on-data and liability gaps |
| `reg-gap-analysis` | Gap analysis against AI regulations in scope |
| `policy-monitor` | Monitor AI policy drift against practice |
| `policy-starter` | Draft an AI governance policy |
| `customize` | Update the practice profile |

### regulatory-legal
Regulatory change monitoring, gap analysis, policy drafting, and comment letters.

| Skill | Purpose |
|---|---|
| `cold-start-interview` | Setup — run this first |
| `reg-feed-watcher` | Watch regulatory feeds for relevant changes |
| `policy-diff` | Diff a new regulation against your policy library |
| `gaps` / `gap-surfacer` | Surface compliance gaps |
| `policy-redraft` | Redraft a policy against a new regulation |
| `comments` | Draft a regulatory comment letter |
| `customize` | Update the practice profile |

### litigation-legal
Matter management, demands, holds, discovery, and brief drafting.

| Skill | Purpose |
|---|---|
| `cold-start-interview` | Setup — run this first |
| `matter-intake` | Intake a new matter (uniform questionnaire + conflicts check) |
| `matter-update` | Update a matter record |
| `matter-briefing` | Brief a matter for a new reader |
| `matter-close` | Close a matter |
| `portfolio-status` | Roll-up status across the full litigation portfolio |
| `demand-intake` | Intake an inbound demand letter |
| `demand-received` | Triage a received demand |
| `demand-draft` | Draft an outbound demand letter |
| `legal-hold` | Issue, refresh, or release a legal hold |
| `subpoena-triage` | Triage an inbound subpoena |
| `chronology` | Build a fact chronology from documents |
| `claim-chart` | Build a claim chart (patent or civil) |
| `privilege-log-review` | Review a privilege log |
| `brief-section-drafter` | Draft a brief section |
| `deposition-prep` | Prepare for a deposition |
| `oc-status` | Draft outside-counsel status requests |
| `customize` | Update the practice profile |

### corporate-legal
M&A diligence, board minutes, entity compliance, and closing checklists.

| Skill | Purpose |
|---|---|
| `cold-start-interview` | Setup — run this first |
| `diligence-issue-extraction` | Extract issues from diligence documents |
| `tabular-review` | Tabular contract review at scale |
| `closing-checklist` | Build and track a closing checklist |
| `material-contract-schedule` | Build a material contracts schedule |
| `board-minutes` | Draft board minutes |
| `written-consent` | Draft a written consent |
| `deal-team-summary` | Business-readable deal summary |
| `entity-compliance` | Track entity compliance deadlines |
| `integration-management` | Post-acquisition integration tracking |
| `ai-tool-handoff` | Hand off work between AI sessions |
| `customize` | Update the practice profile |

### legal-builder-hub
Find, install, and manage community legal skills.

| Skill | Purpose |
|---|---|
| `cold-start-interview` | Setup — run this first |
| `registry-browser` | Browse available skills in the registry |
| `skill-installer` | Install a skill with a security review gate |
| `skill-manager` | Manage installed skills |
| `related-skills-surfacer` | Find skills related to your current task |
| `auto-updater` | Auto-update installed skills |
| `skills-qa` | QA a skill before installing |
| `disable` / `uninstall` | Disable or remove skills |

### law-student
Socratic drilling, case briefs, bar prep, and study planning.

| Skill | Purpose |
|---|---|
| `cold-start-interview` | Setup — run this first |
| `socratic-drill` | Socratic drilling on a topic |
| `case-brief` | Brief a case |
| `outline-builder` | Build a course outline |
| `study-plan` | Build a study schedule |
| `bar-prep-questions` | Bar prep Q&A for your jurisdiction |
| `irac-practice` | IRAC practice with grading |
| `flashcards` | Generate flashcards |
| `legal-writing` | Legal writing feedback |
| `exam-forecast` | Exam issue-spotting forecast |
| `cold-call-prep` | Cold-call preparation |
| `session` | Structured study session |

### legal-clinic
Law school clinic management: intake, deadlines, drafting, and semester handoff.

| Skill | Purpose |
|---|---|
| `cold-start-interview` | Setup — run this first |
| `client-intake` | Structured client intake |
| `client-letter` | Draft a client letter |
| `client-comms-log` | Log client communications |
| `deadlines` | Track deadlines with malpractice-aware caution |
| `draft` | Draft a legal document |
| `memo` | Draft a legal memo |
| `form-generation` | Generate a court form |
| `plain-language-letters` | Plain-language client letters |
| `research-start` | Start a research task |
| `supervisor-review-queue` | Supervisor review queue |
| `ramp` | Onboard a new student |
| `status` | Case status summary |
| `semester-handoff` | Semester-end case handoff |
| `build-guide` | Build a clinic guide |

### cocounsel-legal (Thomson Reuters)
Westlaw Deep Research with linked citations.

| Skill | Purpose |
|---|---|
| `deep-research` | Comprehensive Westlaw Deep Research reports with inline Westlaw and Practical Law citations |

---

## Getting started with a legal plugin

Every plugin requires a one-time setup interview before any other skill will work:

```
/privacy-legal:cold-start-interview
/commercial-legal:cold-start-interview
/product-legal:cold-start-interview
```

The interview writes a practice profile to `~/.claude/plugins/config/claude-for-legal/<plugin>/CLAUDE.md`. Every skill in that plugin reads from it. Without setup, skills will stop and prompt you to run the interview first.

**Every output is a draft for attorney review — not legal advice.**

---

## Notes

- Skill files live in `.claude/skills/<plugin>/<skill>/SKILL.md`.
- Plugin source: [anthropics/claude-for-legal](https://github.com/anthropics/claude-for-legal).
- To add a research connector (Lexis+, Westlaw, CourtListener), follow the MCP instructions in each plugin's `.mcp.json`.
