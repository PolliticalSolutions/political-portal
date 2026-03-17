"""Deterministic ranking and classification metrics for model backtests."""

from __future__ import annotations

from collections import defaultdict
from math import sqrt
from typing import Iterable, List, Mapping, Sequence


def _normalise_flags(values: Iterable[object]) -> List[int]:
    return [1 if bool(value) else 0 for value in values]


def top_decile_capture_rate(outcomes: Sequence[object]) -> float:
    """Share of all positive outcomes captured in the top decile of ranked rows."""
    total_positive = sum(_normalise_flags(outcomes))
    if total_positive == 0:
        return 0.0

    cutoff = max(1, int(len(outcomes) * 0.1))
    captured = sum(_normalise_flags(outcomes[:cutoff]))
    return captured / total_positive


def precision_at_k(outcomes: Sequence[object], k: int) -> float:
    if k <= 0:
        return 0.0
    selected = _normalise_flags(outcomes[: min(k, len(outcomes))])
    if not selected:
        return 0.0
    return sum(selected) / len(selected)


def recall_at_k(outcomes: Sequence[object], k: int) -> float:
    total_positive = sum(_normalise_flags(outcomes))
    if total_positive == 0:
        return 0.0
    selected = _normalise_flags(outcomes[: min(k, len(outcomes))])
    return sum(selected) / total_positive


def false_positive_count(outcomes: Sequence[object], k: int) -> int:
    selected = _normalise_flags(outcomes[: min(k, len(outcomes))])
    return len(selected) - sum(selected)


def false_positive_rate(outcomes: Sequence[object], k: int) -> float:
    total_negative = len(outcomes) - sum(_normalise_flags(outcomes))
    if total_negative <= 0:
        return 0.0
    return false_positive_count(outcomes, k) / total_negative


def false_negative_count(outcomes: Sequence[object], k: int) -> int:
    total_positive = sum(_normalise_flags(outcomes))
    return total_positive - sum(_normalise_flags(outcomes[: min(k, len(outcomes))]))


def bucket_hit_rates(rows: Sequence[Mapping[str, object]], score_key: str, outcome_key: str) -> Mapping[str, float]:
    """Outcome rate by named bucket when rows include a precomputed bucket label."""
    buckets: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        bucket = str(row.get("score_bucket") or "unbucketed")
        buckets[bucket].append(1 if bool(row.get(outcome_key)) else 0)

    return {
        bucket: (sum(values) / len(values) if values else 0.0)
        for bucket, values in buckets.items()
    }


def spearman_rank_correlation(scores: Sequence[float], outcomes: Sequence[float]) -> float:
    """Simple Spearman rank correlation implementation without scipy."""
    if len(scores) != len(outcomes) or len(scores) < 2:
        return 0.0

    def rank(values: Sequence[float]) -> list[float]:
        indexed = sorted(enumerate(values), key=lambda item: item[1])
        ranks = [0.0] * len(values)
        current = 1
        cursor = 0
        while cursor < len(indexed):
            start = cursor
            value = indexed[cursor][1]
            while cursor < len(indexed) and indexed[cursor][1] == value:
                cursor += 1
            avg_rank = (current + (current + (cursor - start) - 1)) / 2
            for offset in range(start, cursor):
                ranks[indexed[offset][0]] = avg_rank
            current += cursor - start
        return ranks

    ranked_scores = rank(scores)
    ranked_outcomes = rank(outcomes)
    mean_scores = sum(ranked_scores) / len(ranked_scores)
    mean_outcomes = sum(ranked_outcomes) / len(ranked_outcomes)

    covariance = sum(
        (score - mean_scores) * (outcome - mean_outcomes)
        for score, outcome in zip(ranked_scores, ranked_outcomes)
    )
    score_variance = sum((score - mean_scores) ** 2 for score in ranked_scores)
    outcome_variance = sum((outcome - mean_outcomes) ** 2 for outcome in ranked_outcomes)

    if score_variance == 0 or outcome_variance == 0:
        return 0.0

    return covariance / sqrt(score_variance * outcome_variance)


def build_metric_pack(rows: Sequence[Mapping[str, object]], score_key: str = "score", outcome_key: str = "observed_loss") -> Mapping[str, float]:
    ordered = sorted(rows, key=lambda row: float(row.get(score_key, 0)), reverse=True)
    outcomes = [bool(row.get(outcome_key)) for row in ordered]
    scores = [float(row.get(score_key, 0)) for row in ordered]
    observed = [1.0 if row.get(outcome_key) else 0.0 for row in ordered]

    return {
        "top_decile_capture_rate": top_decile_capture_rate(outcomes),
        "precision_at_10": precision_at_k(outcomes, 10),
        "precision_at_20": precision_at_k(outcomes, 20),
        "precision_at_50": precision_at_k(outcomes, 50),
        "recall_at_10": recall_at_k(outcomes, 10),
        "recall_at_20": recall_at_k(outcomes, 20),
        "recall_at_50": recall_at_k(outcomes, 50),
        "false_positive_count_at_20": false_positive_count(outcomes, 20),
        "false_positive_rate_at_20": false_positive_rate(outcomes, 20),
        "false_negative_count_at_20": false_negative_count(outcomes, 20),
        "ranking_quality_spearman": spearman_rank_correlation(scores, observed),
    }
