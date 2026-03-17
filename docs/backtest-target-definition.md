# Backtest Target Variable Definition

**Status: Authoritative — do not modify without updating `calculated_at` and version field**
**Version: 1.0 — 2026-03-17**

---

## The definition

> A seat is classified as **HIGH RISK** if, in the next general election held after the observation date, the Conservative candidate finishes **outside first place** (i.e., loses the seat) OR retains it with a majority of **less than 2,000 votes** — based solely on data available at the **model run date** (see cutoffs below).

This is the single binary outcome the backtests must predict. Every model score, every threshold, every precision/recall calculation refers to this definition and nothing else.

---

## Operationalisation by backtest period

| Backtest | Observation date (data cutoff) | Outcome measured | Election used |
|---|---|---|---|
| 2017 backtest | 2017-05-01 (one week before polling) | Did Con lose the seat or hold with majority < 2,000? | 2017 General Election (Jun 2017) |
| 2019 backtest | 2019-11-25 (one week before polling) | Did Con lose the seat or hold with majority < 2,000? | 2019 General Election (Dec 2019) |
| 2024 backtest | 2024-06-27 (one week before polling) | Did Con lose the seat or hold with majority < 2,000? | 2024 General Election (Jul 2024) |

**Data cutoff rule:** Any signal that would not have been observable on the observation date must be excluded from the model inputs for that backtest. Example: 2024 by-election results are excluded from the 2019 backtest.

---

## What counts as a correct prediction (true positive)

The model predicts a seat as HIGH RISK if its model score meets or exceeds the classification threshold (currently: score ≥ 7.0). A correct prediction (true positive) is:

- Model predicted HIGH RISK **and** the seat was lost or retained with majority < 2,000

A false positive is:
- Model predicted HIGH RISK **but** Con won with majority ≥ 2,000

A false negative is:
- Model did NOT predict HIGH RISK **but** the seat was lost or retained with majority < 2,000

---

## What this definition deliberately excludes

1. **Seats that became vulnerable due to post-election events** — MP defections, deaths, by-elections. These are test-set contamination if used to validate the pre-election model.
2. **Notional seat status** — a seat "becoming" marginal purely because of boundary changes is not an outcome the pre-election model could have predicted. Only real results count.
3. **Vote share movements without seat change** — a seat where Con's majority fell from 10,000 to 3,000 is NOT a true positive under this definition. The threshold is 2,000 votes or a loss, not directional movement.
4. **Soft signals** — media speculation, MP retirement announcements, candidate selection — do not modify the target variable. They may be model inputs but not outcome labels.

---

## Threshold sensitivity note

The 2,000-vote majority threshold for "retained but still HIGH RISK" was chosen because:
- It represents roughly a 3% swing away from a seat change in an average English constituency
- It captures seats that are structurally at risk even when retained once
- It avoids penalising the model for seats that flip parties in unusual circumstances (by-elections caused by deaths)

If a different threshold is used for analysis, it must be stated explicitly. **2,000 votes is the canonical threshold until this document is updated.**

---

## Models this definition applies to

| Model | Notes |
|---|---|
| `vulnerability_scores` | Score ≥ 7.0 = HIGH RISK prediction |
| `by_election_risk` | Does NOT use this definition — see By-Election Watch reframe (separate product) |
| `reform_threat_index` | Score ≥ 8.5 = Extreme, ≥ 7.0 = High — maps to HIGH RISK prediction |

---

## Version history

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-03-17 | Initial definition established |
