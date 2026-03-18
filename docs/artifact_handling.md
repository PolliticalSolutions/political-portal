# Artifact Handling

## Purpose

This document separates generated artifacts that should be committed from local-only noise that should stay out of Git.

## Commit these artifacts

Commit generated artifacts when they are:

- stable enough to review in pull requests
- part of model validation evidence
- required for later runtime ingestion or analyst inspection
- useful for merge/cherry-pick review across workstreams

Examples in this repo:

- `artifacts/backtests/*.json`
- `artifacts/backtests/*.csv`
- `artifacts/backtests/features/*.json`
- `artifacts/backtests/features/*.csv`
- `artifacts/backtests/normalized/model_backtest_runs.json`
- `artifacts/validation_manifest.json`
- `artifacts/runtime/validation_summaries.json`
- `artifacts/event_history/cleaned_preview.json`
- `artifacts/event_history/validation_report.json`

## Do not commit these files

Do not commit files that are:

- interpreter cache
- transient scratch output
- editor-specific noise
- incomplete temporary exports

Examples:

- `__pycache__/`
- `*.pyc`
- `.pytest_cache/`
- `artifacts/**/tmp/`

## Review guidance

- Empirical validation artifacts should be preferred over raw temporary logs.
- If a generated artifact is large but analytically important, keep the stable summary artifact and avoid committing redundant intermediate scratch files.
- If a file would need to be regenerated every local run without adding review value, it should usually stay out of Git.
