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
- `vulnerability` is the strongest candidate for immediate historical backtesting.
- `reform_threat` is only partially comparable historically because party structure changes materially across cycles.
- `by_election_risk` remains structurally backtestable but is currently limited by event-history coverage.
