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

## Current limitations

- Dry-run mode is the default safe path when no live historical dataset is available.
- `vulnerability` is the strongest candidate for immediate historical backtesting.
- `reform_threat` is only partially comparable historically because party structure changes materially across cycles.
- `by_election_risk` remains structurally backtestable but is currently limited by event-history coverage.
