# Reform Threat Feature Readiness

## Purpose

This document prepares Reform Threat for future empirical work without altering the live model or page implementation. It classifies candidate feature families by readiness rather than pretending they are already validated.

## Classification buckets

- `historically_usable_analogue_safe`
  - feature has a plausible historical analogue and can be included in backtest planning without obvious future leakage
- `current_only_directional`
  - feature is politically useful in current conditions but not cleanly backtestable across older cycles
- `incomplete_not_ready`
  - data exists only partially, with coverage too weak for reliable historical or runtime use
- `high_leakage_risk`
  - feature is likely to contaminate historical evaluation or mix outcome-period information into inputs

## Candidate feature families

### Conservative majority fragility

- Likely classification: `historically_usable_analogue_safe`
- Rationale: stable electoral spine feature with strong cycle alignment

### Challenger structure

- Likely classification: `historically_usable_analogue_safe`
- Rationale: long-run electoral competition can be measured without relying on current Reform-specific conditions

### Right-fragmentation proxy

- Likely classification: `historically_usable_analogue_safe`
- Rationale: can use analogue-safe historical proxy logic such as UKIP-era fragmentation rather than literal Reform presence

### Historical UKIP-style proxy

- Likely classification: `historically_usable_analogue_safe`
- Rationale: useful as an analogue bridge, but must remain conceptually framed rather than treated as a perfect Reform substitute

### Local organisational strength proxy

- Likely classification: `incomplete_not_ready`
- Rationale: local coverage remains patchy and inconsistent

### Current Reform vote share

- Likely classification: `current_only_directional`
- Rationale: politically important now, but not cleanly comparable across earlier cycles

### Demographic receptivity proxy

- Likely classification: `current_only_directional`
- Rationale: may be useful directionally, but historical comparability depends on stable feature engineering and wider cycle coverage

## Key governance note

Reform Threat should remain framed as a directional/current-conditions model until analogue-safe feature sets and stronger coverage are available. Current political usefulness does not automatically imply historical validity.
