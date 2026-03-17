# Backtesting Framework

## Purpose

This framework provides a controlled structure for testing intelligence models against historical election outcomes without future leakage. It is designed to support:

- `vulnerability`
- `reform_threat`
- `by_election_risk`

## Dry-run mode

`--dry-run` does not claim a successful historical validation. It produces a structured artifact describing:

- requested model and target cycle
- baseline cycle
- signals that appear historically usable
- signals that are missing
- signals excluded because of leakage or weak historical comparability
- metrics that would be calculated once real rows are available
- dependencies required for a full run

## Real vulnerability runs

The vulnerability model now supports a real historical backtest path for:

- `2017` using baseline `2015`
- `2019` using baseline `2017`
- `2024` using baseline `2019` notional results on 2024 boundaries

Real runs differ from dry-run mode in three ways:

- a cycle-aligned constituency feature dataset is built from Supabase election results
- only baseline-period features are scored
- target-cycle outcomes are attached for evaluation only and remain outside the feature set

## Controlled vulnerability enrichment testing

The vulnerability spine can now be tested as named variants:

- `baseline`
- `baseline_demographic`
- `baseline_local`
- `baseline_demographic_local`

This keeps enrichment testing disciplined:

- the core electoral spine remains the control
- one enrichment family is added at a time
- combined variants are only considered after the isolated families have been tested
- enrichments that cannot be supported credibly are reported as `not_ready`, not scored anyway

### What counts as improvement

Variant testing compares each enrichment run against the baseline spine on:

- top-decile capture rate
- precision at 20
- Spearman rank correlation

An enrichment should only be treated as a candidate improvement if it helps across more than one cycle without materially weakening the top of the ranking. Single-cycle gains are not enough.

### Current variant status

- Demographic enrichment is testable with cycle-appropriate census data:
  - `2017` and `2019` use `2011` census rows
  - `2024` prefers `2021` census rows and falls back to `2011` only where `2021` is missing
  - first-pass comparison currently reads as `neutral`: it helps `2024`, is flat-to-weaker on earlier cycles, and does not yet justify replacing the baseline by default
- Local-government enrichment is not yet ready for national vulnerability backtesting:
  - current lookup coverage is far too sparse
  - current council data is skewed to a small imported subset rather than a national historical panel

As a result, local variants are generated structurally but return `not_ready` until coverage improves.

## Leakage prevention

The scaffold treats the target cycle as the outcome period and uses the prior general election cycle as the baseline/reference period.

- target-cycle outcome data must never be used as an input feature
- event-driven signals with patchy history are excluded or marked missing
- Reform-era signals before 2024 are treated cautiously and may be excluded from historical runs

## Data needed for full backtests

Full runs require:

- historical constituency-level Westminster results
- model-aligned signal extracts for the baseline period only
- clear target outcomes for the target cycle
- richer event and local-government history for `reform_threat` and `by_election_risk`

For the real vulnerability run specifically, the dataset must include:

- baseline Conservative vote share
- baseline Conservative majority as a share of electorate
- baseline challenger vote share and challenger gap
- baseline-to-previous Conservative vote-share trend where a clean previous-cycle constituency match exists
- target-cycle held/lost outcome and target margin change for evaluation only

## Current limitations

- Real execution is currently implemented only for `vulnerability`.
- `2024` trend coverage is structurally weaker because the clean baseline uses 2019 notional results on 2024 boundaries, while the prior real cycle uses different constituency identifiers.
- Demographic enrichments are currently limited to the cleanest available tenure-style census fields rather than a full demographic engine.
- Local-government enrichments cannot yet be validated nationally because only a small subset of constituency-to-council mappings and council result rows are available.
- `vulnerability` is the strongest candidate for immediate historical backtesting.
- `reform_threat` is only partially comparable historically because party structure changes materially across cycles.
- `by_election_risk` remains structurally backtestable but is currently limited by event-history coverage.
