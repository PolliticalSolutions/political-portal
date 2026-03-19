"""Export runtime-safe validation summaries from local validation artifacts."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


NORMALIZED_PATH = Path("artifacts") / "backtests" / "normalized" / "model_backtest_runs.json"
MANIFEST_PATH = Path("artifacts") / "validation_manifest.json"
VULNERABILITY_COMPARISON_PATH = Path("artifacts") / "backtests" / "vulnerability_variant_comparison.json"
RUNTIME_EXPORT_PATH = Path("artifacts") / "runtime" / "validation_summaries.json"
MODEL_KEYS = ["vulnerability", "reform_threat", "by_election_risk", "scenario_simulator"]
CONTRACT_VERSION = 2
MODEL_METADATA = {
    "vulnerability": {
        "model_name": "Conservative Seat Vulnerability",
        "model_category": "validated",
        "model_status": "empirical_ranking_available",
        "summary_interpretation": "Strongest evidence-backed model in the suite. Use it as a ranking model for exposed Conservative-held seats, not as a binary defeat prophecy.",
        "confidence_treatment": "Confidence is strongest on the core electoral spine. Optional enrichments should not outrank the baseline unless repeated cycle evidence improves.",
        "caveats": [
            "2024 still carries known boundary-change and trend-continuity caveats.",
            "The baseline spine remains the control even where a candidate enrichment performs slightly better on one metric.",
        ],
        "evidence_completeness": "empirical_strongest_available",
        "recommended_variant": "baseline",
    },
    "reform_threat": {
        "model_name": "Reform UK Threat Index",
        "model_category": "directional",
        "model_status": "directional_evidence_partial",
        "summary_interpretation": "Directional prioritisation model for Reform-related right-fragmentation risk. Useful for current conditions, not yet a strong historical validation target.",
        "confidence_treatment": "Treat as directional assessment only. Current-condition relevance is higher than historical comparability.",
        "caveats": [
            "Direct Reform-era analogues are structurally weaker before 2024.",
            "Current Reform vote share is politically important but not cleanly backtestable across older cycles.",
        ],
        "evidence_completeness": "partial_directional_only",
        "recommended_variant": None,
    },
    "by_election_risk": {
        "model_name": "By-Election Risk Watch",
        "model_category": "watchlist_event",
        "model_status": "event_history_incomplete",
        "summary_interpretation": "Watchlist-style model for destabilising seat conditions. Operationally useful, but currently constrained by incomplete event-history coverage.",
        "confidence_treatment": "Treat as an event-driven watchlist rather than a vacancy prediction model.",
        "caveats": [
            "Historical event coverage is still incomplete.",
            "This should not be read as a prediction of resignation timing or certainty of a by-election.",
        ],
        "evidence_completeness": "limited_event_evidence",
        "recommended_variant": None,
    },
    "scenario_simulator": {
        "model_name": "Constituency Scenario Simulator",
        "model_category": "planning_tool",
        "model_status": "planning_tool_only",
        "summary_interpretation": "Structured planning aid for exploring simplified what-if scenarios. It is not a validated predictive model.",
        "confidence_treatment": "Use for disciplined scenario planning only. It should never be presented as a forecast or probability estimate.",
        "caveats": [
            "Does not incorporate tactical voting, incumbency, candidate quality, or local campaign execution effects.",
            "Outputs reflect governed assumptions, not historical validation.",
        ],
        "evidence_completeness": "governed_planning_only",
        "recommended_variant": None,
    },
}


def _read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _load_normalized_records() -> list[dict]:
    payload = _read_json(NORMALIZED_PATH)
    return payload.get("records", []) if isinstance(payload, dict) else []


def _load_manifest_entries() -> list[dict]:
    payload = _read_json(MANIFEST_PATH)
    return payload.get("entries", []) if isinstance(payload, dict) else []


def _major_warnings(model_key: str, records: list[dict]) -> list[str]:
    warnings: list[str] = []
    warning_markers = (
        "partial",
        "not ready",
        "not yet",
        "too sparse",
        "weak",
        "boundary",
        "leakage",
        "incomplete",
        "not directly comparable",
    )
    for record in records:
        if record.get("model_key") != model_key:
            continue
        for warning in record.get("warnings", []):
            warning_text = str(warning)
            if warning_text not in warnings and any(marker in warning_text.lower() for marker in warning_markers):
                warnings.append(warning_text)
    return warnings[:5]


def _latest_cycles(model_key: str, records: list[dict]) -> list[int]:
    cycles = {record.get("target_cycle") for record in records if record.get("model_key") == model_key}
    return sorted(cycle for cycle in cycles if isinstance(cycle, int))


def _strongest_variant(model_key: str) -> str | None:
    if model_key != "vulnerability" or not VULNERABILITY_COMPARISON_PATH.exists():
        return None
    payload = _read_json(VULNERABILITY_COMPARISON_PATH)
    strongest = payload.get("strongest_completed_variant") or {}
    return strongest.get("variant")


def _seat_level_metadata_available(model_key: str, manifest_entries: list[dict]) -> bool:
    return any(
        entry.get("model_key") == model_key and entry.get("artifact_type") == "feature_dataset"
        for entry in manifest_entries
    )


def _last_updated(model_key: str, manifest_entries: list[dict]) -> str | None:
    model_entries = [entry for entry in manifest_entries if entry.get("model_key") == model_key]
    if not model_entries:
        return None
    latest = max(float(entry.get("modified_at") or 0) for entry in model_entries)
    return datetime.fromtimestamp(latest, tz=UTC).isoformat().replace("+00:00", "Z")


def _source_artifacts(model_key: str, manifest_entries: list[dict]) -> list[str]:
    return [
        entry["artifact_path"]
        for entry in manifest_entries
        if entry.get("model_key") == model_key and entry.get("runtime_safe")
    ][:6]


def _completed_records(model_key: str, records: list[dict], variant: str | None = None) -> list[dict]:
    model_records = [
        record for record in records
        if record.get("model_key") == model_key and record.get("status") == "completed"
    ]
    if variant is not None:
        model_records = [record for record in model_records if record.get("variant_key") == variant]
    return model_records


def _metric_snapshot(model_key: str, records: list[dict], recommended_variant: str | None) -> dict[str, Any]:
    completed = _completed_records(model_key, records, recommended_variant)
    if not completed:
        return {}

    latest_record = max(completed, key=lambda record: int(record.get("target_cycle") or 0))

    def metric_values(metric_key: str) -> list[float]:
        values = []
        for record in completed:
            metric_value = record.get("metrics", {}).get(metric_key)
            if metric_value is not None:
                values.append(float(metric_value))
        return values

    snapshots = {}
    for metric_key in ["top_decile_capture_rate", "precision_at_20", "ranking_quality_spearman"]:
        values = metric_values(metric_key)
        if not values:
            continue
        snapshots[metric_key] = {
            "latest": float(latest_record["metrics"][metric_key]),
            "average": round(sum(values) / len(values), 4),
        }
    return snapshots


def _contract_model_summary(model_key: str, records: list[dict], manifest_entries: list[dict], generated_at: str) -> dict[str, Any]:
    metadata = MODEL_METADATA[model_key]
    completed_records = _completed_records(model_key, records, metadata.get("recommended_variant"))
    backtest_available = len(completed_records) > 0
    strongest_variant = _strongest_variant(model_key)
    major_warnings = _major_warnings(model_key, records)
    source_artifacts = _source_artifacts(model_key, manifest_entries)

    return {
        "model_key": model_key,
        "model_name": metadata["model_name"],
        "model_category": metadata["model_category"],
        "model_status": metadata["model_status"] if model_key != "vulnerability" or backtest_available else "framework_ready_only",
        "summary_interpretation": metadata["summary_interpretation"],
        "confidence_treatment": metadata["confidence_treatment"],
        "caveats": metadata["caveats"] + major_warnings[:2],
        "key_validation_metrics": _metric_snapshot(model_key, records, metadata.get("recommended_variant")),
        "evidence_completeness": metadata["evidence_completeness"],
        "backtest_available": backtest_available,
        "latest_available_cycles": _latest_cycles(model_key, records),
        "strongest_variant": strongest_variant,
        "recommended_variant": metadata.get("recommended_variant"),
        "seat_level_metadata_available": _seat_level_metadata_available(model_key, manifest_entries),
        "artifact_provenance": {
            "generated_at": generated_at,
            "last_updated": _last_updated(model_key, manifest_entries),
            "source_artifacts": source_artifacts,
        },
        "major_warnings": major_warnings,
    }


def build_runtime_summaries() -> dict:
    records = _load_normalized_records()
    manifest_entries = _load_manifest_entries()
    generated_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    summaries = [
        _contract_model_summary(model_key, records, manifest_entries, generated_at)
        for model_key in MODEL_KEYS
    ]
    return {
        "contract_version": CONTRACT_VERSION,
        "generated_at": generated_at,
        "models": summaries,
    }


def main() -> int:
    payload = build_runtime_summaries()
    RUNTIME_EXPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME_EXPORT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({"output_path": str(RUNTIME_EXPORT_PATH).replace("\\", "/"), "model_count": len(payload["models"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
