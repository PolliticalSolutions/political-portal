# Enrichment Testing Notes

## Summary of changes

- Extended the Vulnerability feature builder to support four named variants:
  - `baseline`
  - `baseline_demographic`
  - `baseline_local`
  - `baseline_demographic_local`
- Kept the original electoral spine as the control and tested enrichments in isolation rather than blending everything into one model.
- Added variant-aware Vulnerability scoring with modest, explicit demographic and local-government contributions.
- Added variant-aware backtest execution and comparison artifacts:
  - `artifacts/backtests/vulnerability_variant_summary.csv`
  - `artifacts/backtests/vulnerability_variant_comparison.json`
- Added deterministic enrichment assessment logic so each family is classified as:
  - `improves`
  - `neutral`
  - `mixed`
  - `degrades`
  - `not_ready`
- Updated the backtesting docs with the enrichment-testing methodology, improvement criteria, and readiness caveats.

## Files changed

- `docs/backtesting-framework.md`
- `scripts/backtest_models.py`
- `scripts/build_historical_features.py`
- `scripts/lib/backtest_data_loader.py`
- `scripts/lib/vulnerability_model.py`
- `scripts/lib/vulnerability_enrichment_assessment.py`
- `artifacts/backtests/features/vulnerability_*`
- `artifacts/backtests/vulnerability_*`

## Commands run

- `python -m py_compile scripts/build_historical_features.py scripts/backtest_models.py scripts/lib/backtest_data_loader.py scripts/lib/backtest_metrics.py scripts/lib/backtest_reporting.py scripts/lib/vulnerability_model.py`
- `python scripts/build_historical_features.py --all`
- `python scripts/build_historical_features.py --all --all-variants`
- `python scripts/backtest_models.py --model vulnerability --target-cycle 2017 --all-variants`
- `python scripts/backtest_models.py --model vulnerability --target-cycle 2019 --all-variants`
- `python scripts/backtest_models.py --model vulnerability --target-cycle 2024 --all-variants`
- `python scripts/backtest_models.py --model vulnerability --all-variants`
- `npm run test:run`

## Test results

- Python module compilation passed for the requested backtesting modules.
- Feature generation succeeded for all three cycles.
- Completed real scored runs:
  - `2017 baseline`
  - `2017 baseline_demographic`
  - `2019 baseline`
  - `2019 baseline_demographic`
  - `2024 baseline`
  - `2024 baseline_demographic`
- Structured `not_ready` runs were generated for:
  - `baseline_local`
  - `baseline_demographic_local`
- `npm run test:run` passed:
  - `72` test files
  - `266` tests

## Notes / unresolved dependencies

- Which enrichment families were testable:
  - `baseline_demographic` was fully testable across `2017`, `2019`, and `2024`.
  - `baseline` remained the control and completed across all three cycles.

- Which were not ready and why:
  - `baseline_local` was `not_ready` across all cycles because local-government coverage is too sparse for credible national backtesting.
  - `baseline_demographic_local` was also `not_ready` because it inherits the same local-data limitation.
  - Current local inventory is only:
    - `7` constituency-to-council lookup rows
    - `21` local authorities
    - `7` council result rows

- Whether demographics improved the baseline:
  - Not enough to justify default adoption.
  - The demographic variant is currently assessed `neutral`.
  - It helped `2024` modestly:
    - `precision@20` improved from `0.85` to `0.90`
    - Spearman improved from `0.4825` to `0.5146`
  - It was weaker in `2017` and flat-to-weaker in `2019`.

- Whether local government enrichments improved the baseline:
  - No defensible claim can be made yet.
  - They were not scored because the data is not nationally ready.
  - The correct classification is `not_ready`, not `improves` or `degrades`.

- Whether the combined variant outperformed or muddied the model:
  - The combined variant did not complete as a scored run because local coverage failed readiness.
  - There is therefore no valid performance claim for the combined model yet.

- Which variant now looks strongest and why:
  - The strongest completed variant on the simple cross-cycle composite is `baseline_demographic`.
  - That edge is narrow and does not overturn the main conclusion.
  - Operationally, the safest position remains:
    - keep `baseline` as the default spine
    - keep `baseline_demographic` as a monitored candidate enrichment
    - do not promote local-government enrichment until the historical local dataset is materially broader

- Additional caveats:
  - `2024` still carries the known trend limitation from the first real backtest:
    - `2019` notional results on `2024` boundaries are used as the leakage-safe baseline
    - previous-cycle trend continuity is weak on that boundary regime and remains warned in the artifacts
  - Untracked `__pycache__` folders under `scripts/` and `scripts/lib/` were not committed.
