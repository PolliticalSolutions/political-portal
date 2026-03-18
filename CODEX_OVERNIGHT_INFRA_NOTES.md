# Codex Overnight Infra Notes

## Completed priorities

1. Model backtest run schema and sync tooling
2. Validation artifact manifest and index
3. By-Election Risk event-history data spec and ingestion scaffold
4. Event-type taxonomy and weighting registry
5. Runtime-safe validation summary export
6. Reform Threat feature-readiness scaffold
7. Artifact and Python cache hygiene

## Files changed

### SQL / schema
- `scripts/create_model_backtest_runs.sql`
- `scripts/create_event_history_tables.sql`

### Python tooling
- `scripts/sync_backtest_artifacts.py`
- `scripts/build_validation_manifest.py`
- `scripts/load_event_history.py`
- `scripts/export_runtime_validation_summaries.py`
- `scripts/build_reform_threat_feature_readiness.py`
- `scripts/lib/backtest_artifact_sync.py`
- `scripts/lib/validation_manifest.py`
- `scripts/lib/event_taxonomy.py`

### Docs
- `docs/by_election_event_data_spec.md`
- `docs/reform_threat_feature_readiness.md`
- `docs/artifact_handling.md`
- `CODEX_OVERNIGHT_INFRA_NOTES.md`

### Seed / template data
- `scripts/seed_event_type_definitions.json`
- `scripts/templates/event_history_template.csv`

### Generated artifacts
- `artifacts/backtests/normalized/model_backtest_runs.json`
- `artifacts/validation_manifest.json`
- `artifacts/event_history/cleaned_preview.json`
- `artifacts/event_history/validation_report.json`
- `artifacts/runtime/validation_summaries.json`
- `artifacts/backtests/reform_threat_feature_readiness.json`

## Commands run

- `git fetch origin`
- `git worktree add ../political-solutions-codex <commit>`
- `git checkout -b intelligence-validation-codex-overnight`
- `python -m py_compile scripts/sync_backtest_artifacts.py scripts/lib/backtest_artifact_sync.py`
- `python scripts/sync_backtest_artifacts.py --dry-run`
- `python -m py_compile scripts/build_validation_manifest.py scripts/lib/validation_manifest.py`
- `python scripts/build_validation_manifest.py`
- `python -m py_compile scripts/load_event_history.py`
- `python scripts/load_event_history.py --input scripts/templates/event_history_template.csv --dry-run`
- `python -m py_compile scripts/lib/event_taxonomy.py`
- inline Python validation of `event_taxonomy`
- `python -m py_compile scripts/export_runtime_validation_summaries.py`
- `python scripts/export_runtime_validation_summaries.py`
- `python -m py_compile scripts/build_reform_threat_feature_readiness.py`
- `python scripts/build_reform_threat_feature_readiness.py`
- final multi-script compile:
  - `python -m py_compile scripts/sync_backtest_artifacts.py scripts/lib/backtest_artifact_sync.py scripts/build_validation_manifest.py scripts/lib/validation_manifest.py scripts/load_event_history.py scripts/lib/event_taxonomy.py scripts/export_runtime_validation_summaries.py scripts/build_reform_threat_feature_readiness.py`
- `npm run test:run`

## Verification results

- Python compilation passed for all new and modified overnight scripts.
- Dry-run / export tooling passed:
  - normalized backtest export: `24` records
  - validation manifest: `60` artifacts indexed
  - event-history loader: `1` clean row, `0` rejected rows
  - runtime validation summary export: `3` model summaries
  - Reform Threat readiness export: `8` feature buckets
- `npm run test:run` could not run successfully in this worktree because `vitest` is not installed locally here.

## Artifacts generated

- `artifacts/backtests/normalized/model_backtest_runs.json`
- `artifacts/validation_manifest.json`
- `artifacts/event_history/cleaned_preview.json`
- `artifacts/event_history/validation_report.json`
- `artifacts/runtime/validation_summaries.json`
- `artifacts/backtests/reform_threat_feature_readiness.json`

## Blockers

- Frontend test execution is blocked in this separate overnight worktree because the local Node toolchain is incomplete here:
  - `npm run test:run` fails with `vitest is not recognized`
- I did not work around this by touching shared runtime files or trying to reinstall dependencies, because the overnight brief was to avoid crossing wires with the active parallel agent.

## What can now be integrated later

- A Supabase-ready schema and normalized export path for model run artifacts
- A reusable validation manifest for future ingestion and runtime tooling
- Event-history schema/spec/loader scaffolding for By-Election Risk readiness
- A structured event taxonomy with explicit weight defaults
- A runtime-safe validation summary export for future app ingestion
- A Reform Threat readiness artifact that can guide later empirical work without altering the live model
- Cleaner repo hygiene for Python cache noise and artifact expectations

## What should be cherry-picked first into the main validation branch

1. `feat: add model backtest run schema and artifact sync tooling`
2. `feat: add validation artifact manifest generator`
3. `feat: add runtime-safe validation summary export tooling`
4. `feat: add by-election event-history ingestion scaffold`
5. `feat: add political event taxonomy and weighting registry`
6. `feat: add reform threat feature readiness analysis scaffold`
7. `chore: improve artifact and python cache hygiene`

## Notes

- This workstream deliberately avoided the overlapping Claude task files and live model/page implementations listed in the brief.
- No changes were made to:
  - `scripts/build_historical_features.py`
  - `scripts/lib/vulnerability_model.py`
  - `scripts/backtest_models.py`
  - live Reform Threat or By-Election page components
- Branch remains:
  - `intelligence-validation-codex-overnight`
