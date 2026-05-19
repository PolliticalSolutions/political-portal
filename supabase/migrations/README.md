# Supabase migrations

This directory holds every schema change applied to the production Supabase
project. Files are SQL, ordered by their timestamp prefix.

Migrations are applied automatically. A GitHub Actions workflow
([`.github/workflows/supabase-migrate.yml`](../../.github/workflows/supabase-migrate.yml))
watches this folder and runs `supabase db push` against production
whenever a `.sql` file lands on `main`. No more pasting SQL into the
dashboard.

---

## Creating a new migration

### Filename convention

```
YYYYMMDDHHMMSS_short_description.sql
```

- Use UTC timestamp at the moment of creation, in PowerShell:
  ```powershell
  Get-Date -Format "yyyyMMddHHmmss"
  ```
- `short_description` is lowercase, words separated by underscores
  (`add_volunteer_roles`, not `addVolunteerRoles`).
- One concern per migration — easier to roll back mentally, easier to
  review in a PR.

### Pre-existing migrations use an 8-digit prefix

The earliest files in this folder (`20260329_*`, `20260511_*`, etc.) use
`YYYYMMDD` only. That predates the automated workflow and they were
applied manually via the Supabase dashboard. **All new migrations must
use the full `YYYYMMDDHHMMSS` 14-digit format** so the Supabase CLI can
order them deterministically against existing tracked migrations.

### Style

```sql
-- ===========================================================================
-- <one-line summary of what this migration changes>
--
-- <Why — link to a PR / issue / decision when useful.>
-- ===========================================================================

BEGIN;

-- 1. <Step description>
ALTER TABLE foo ADD COLUMN IF NOT EXISTS ...;

-- 2. ...

COMMIT;
```

Always wrap in `BEGIN; ... COMMIT;` so a failure mid-migration rolls
back cleanly. Use `IF NOT EXISTS` / `IF EXISTS` where possible so the
migration is idempotent and safe to re-run.

---

## What happens when you commit one

1. Open a PR with the new `.sql` file under `supabase/migrations/`.
2. PR is reviewed and approved like any other change.
3. PR is squash-merged to `main`.
4. **GitHub Actions automatically runs the migration workflow.** It:
   - Installs the Supabase CLI.
   - Extracts the project ref from `VITE_SUPABASE_URL`.
   - Links to production with `supabase link --project-ref <ref>`.
   - Applies any unapplied migrations with `supabase db push`.
5. If the workflow fails, the run goes red. Fix forward in a new PR.

The workflow only triggers when files under `supabase/migrations/**.sql`
change — pushes that don't touch this folder skip the workflow entirely.

---

## Verifying a migration applied

Three ways:

### 1. GitHub Actions tab

Repository → Actions → "Apply Supabase migrations" → most recent run.
Green check = migration applied. Click into the run to see the SQL the
CLI executed.

### 2. Supabase dashboard

Supabase Dashboard → your project → Database → **Migrations** in the
left sidebar. Lists every migration the CLI has tracked, with the
timestamp it was applied. Your new file's timestamp prefix should
appear here within seconds of the workflow finishing.

### 3. Direct query in the SQL editor

```sql
SELECT version, name, statements
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 10;
```

The migration's timestamp prefix is the `version`. If it's present, the
CLI marked it applied. If it's missing, the workflow didn't run or
failed.

---

## If a migration fails

A failure means the SQL errored when the CLI tried to apply it. The
workflow exits non-zero and the run goes red. **The database is left in
whatever state the failing transaction reached** — typically the
explicit `BEGIN; ... COMMIT;` block in the migration file rolls back,
but anything outside that block (e.g. earlier statements in the same
file) may have committed.

### What to do

1. **Read the workflow log** — Actions tab → failed run → expand the
   "Apply migrations (live)" step. The Postgres error is verbatim from
   `supabase db push`.
2. **Inspect the database** — Supabase SQL editor → check whether the
   table / column / policy from the failing migration is partially
   present. If it is, you'll need a corrective migration that handles
   the partial state (use `IF NOT EXISTS` / `IF EXISTS` defensively).
3. **Write a follow-up migration** with a new `YYYYMMDDHHMMSS` prefix
   that fixes the underlying problem. Do not edit or delete the failing
   migration file — once it's in `main`, the workflow's already seen it.
4. **Re-trigger the workflow** by either:
   - Merging the corrective PR (it'll fire on the new file landing), or
   - Manually re-running the failed workflow once the corrective change
     is on `main`: Actions → failed run → "Re-run all jobs". The CLI
     will skip migrations already in `schema_migrations` and only apply
     the new corrective one.

### Common failure modes

| Symptom | Likely cause |
|---|---|
| `column "X" does not exist` | Migration references a column dropped by an earlier migration that ran in the same file. Wrap the reference in `DO $$ BEGIN IF EXISTS (...) THEN ... END $$` to guard against re-runs. |
| `permission denied for table X` | The CLI is using the `postgres` user via the connection string. Permissions are inherited. Don't try to `GRANT` to `postgres` itself. |
| `relation X already exists` | A previous migration created it but wasn't tracked by `schema_migrations` (e.g. applied manually before this workflow existed). Either repair the migrations table, or use `CREATE TABLE IF NOT EXISTS`. |
| Workflow runs but nothing happens | The `paths:` filter on the workflow only triggers on `.sql` changes under `supabase/migrations/`. If you committed via Git LFS or with an unusual extension, it won't fire. |

---

## Manual / local commands (PowerShell)

For local experimentation against the production database (use sparingly):

```powershell
# Install the CLI once
scoop install supabase
# or: npm install -g supabase

# Authenticate
supabase login

# Link to the production project (one-time per machine)
$ref = ((Get-Content "C:\Users\pauls\Documents\political-portal\.env" `
        | Select-String '^VITE_SUPABASE_URL=').Line -split '=', 2)[1].Trim() `
        -replace 'https://', '' -split '\.' | Select-Object -First 1
supabase link --project-ref $ref

# See what would be applied without applying
supabase db push --dry-run

# List the migration history known to the remote
supabase migration list
```

You can also trigger the **GitHub Actions** workflow manually:

- Repository → Actions → "Apply Supabase migrations" → "Run workflow"
- Tick "Dry run" to print the SQL without applying it. Useful before a
  big migration to confirm the CLI sees what you expect.

---

## What this workflow does **not** do

- It does not run `supabase db reset`. That would wipe and rebuild the
  database from scratch — never appropriate against production.
- It does not seed data. Seed scripts under `scripts/seed_*.mjs` are
  run separately, on demand, against the service-role REST API.
- It does not roll back. Migrations are forward-only. If you need to
  undo, write a corrective migration.
