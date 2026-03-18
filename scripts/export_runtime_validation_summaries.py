"""Export runtime-safe validation summaries from local validation artifacts."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path


NORMALIZED_PATH = Path("artifacts") / "backtests" / "normalized" / "model_backtest_runs.json"
MANIFEST_PATH = Path("artifacts") / "validation_manifest.json"
VULNERABILITY_COMPARISON_PATH = Path("artifacts") / "backtests" / "vulnerability_variant_comparison.json"
RUNTIME_EXPORT_PATH = Path("artifacts") / "runtime" / "validation_summaries.json"
MODEL_KEYS = ["vulnerability", "reform_threat", "by_election_risk"]


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


def _determine_maturity_status(model_key: str, records: list[dict]) -> str:
    statuses = {record.get("status") for record in records if record.get("model_key") == model_key}
    if "completed" in statuses:
        return "empirical_backtest_available"
    if "dry_run_ready" in statuses:
        return "framework_ready"
    if statuses:
        return "artifact_only"
    return "no_runtime_artifacts"


def _major_warnings(model_key: str, records: list[dict]) -> list[str]:
    warnings: list[str] = []
    for record in records:
        if record.get("model_key") != model_key:
            continue
        for warning in record.get("warnings", []):
            warning_text = str(warning)
            if warning_text not in warnings:
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


def build_runtime_summaries() -> dict:
    records = _load_normalized_records()
    manifest_entries = _load_manifest_entries()
    generated_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    summaries = []
    for model_key in MODEL_KEYS:
        model_records = [record for record in records if record.get("model_key") == model_key]
        summaries.append(
            {
                "model_key": model_key,
                "model_version": max(
                    (record.get("model_version") for record in model_records if record.get("model_version")),
                    default=None,
                ),
                "maturity_status": _determine_maturity_status(model_key, records),
                "latest_available_cycles": _latest_cycles(model_key, records),
                "backtest_available": any(record.get("status") == "completed" for record in model_records),
                "strongest_variant": _strongest_variant(model_key),
                "seat_level_metadata_available": _seat_level_metadata_available(model_key, manifest_entries),
                "major_warnings": _major_warnings(model_key, records),
                "generated_at": generated_at,
            }
        )
    return {"generated_at": summaries[0]["generated_at"] if summaries else None, "models": summaries}


def main() -> int:
    payload = build_runtime_summaries()
    RUNTIME_EXPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME_EXPORT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({"output_path": str(RUNTIME_EXPORT_PATH).replace("\\", "/"), "model_count": len(payload["models"])}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
