# Model Validation Framework

## Purpose

This framework defines what each intelligence model is trying to do, what it is not trying to do, and what type of validation is appropriate.

It covers:

- `vulnerability`
- `reformThreat`
- `byElectionRisk`
- `scenarioSimulator`

## Model-by-model framing

### Vulnerability

- Purpose: rank exposed Conservative-held seats.
- Correct validation standard: ranking quality and top-ranked seat capture.
- Not a claim: it does not guarantee defeat.

### Reform Threat

- Purpose: prioritise seats under current Reform-driven right-fragmentation pressure.
- Correct validation standard: partial historical testing plus conceptual signal scrutiny.
- Not a claim: it does not forecast exact Reform vote share or provide a fully clean historical analogue across all cycles.

### By-Election Risk

- Purpose: support current-intelligence watchlisting for disruptive by-election scenarios.
- Correct validation standard: bounded validation with explicit acknowledgement of weak event-history coverage.
- Not a claim: it does not predict a resignation date or guarantee a by-election.

### Scenario Simulator

- Purpose: provide a planning aid for testing directional swings and turnout assumptions.
- Correct validation standard: deterministic behaviour, explicit assumptions, and governance discipline.
- Not a claim: it is not a probabilistic seat forecast.

## What success looks like

- The model’s use case is explicit.
- The eligible universe is bounded.
- Required and optional signals are named.
- Signals that cannot be cleanly tested historically are excluded explicitly.
- Backtesting, where appropriate, evaluates the right question rather than a made-up accuracy headline.

## Data constraints

- Vulnerability has the strongest current basis for historical validation.
- Reform Threat remains only partially backtestable because current party structure is not cleanly comparable across long historical windows.
- By-Election Risk is structurally useful but historically constrained by incomplete event and alert coverage.
- Scenario Simulator should be governed as a planning tool, not validated like a predictive rank model.

## Relationship to backtesting

Backtesting is one part of the wider validation programme, not the whole thing.

- Stronger historical models should be judged on ranking capture and ordering quality.
- Partial models should combine backtest evidence with signal-quality and limitation reporting.
- Planning tools should be judged on transparency, determinism, and sensible operational framing.
