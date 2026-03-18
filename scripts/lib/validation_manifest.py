"""Helpers for building a coherent manifest of validation artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


BACKTEST_DIR = Path("artifacts") / "backtests"
FEATURE_DIR = BACKTEST_DIR / "features"
NORMALIZED_DIR = BACKTEST_DIR / "normalized"
MANIFEST_PATH = Path("artifacts") / "validation_manifest.json"


def _artifact_kind(path: Path) -> str:
    if path.parent == FEATURE_DIR:
        return "feature_dataset"
    if path.parent == NORMALIZED_DIR:
        return "normalized_export"
    if path.suffix == ".csv":
        return "summary_table"
    return "backtest_report"


def _artifact_classification(path: Path, payload: dict[str, Any] | None) -> str:
    if path.name.endswith("_comparison.json"):
        return "recommendation"
    if payload and payload.get("run_mode") == "dry-run":
        return "dry-run"
    if payload and payload.get("status") == "completed":
        return "empirical"
    if payload and payload.get("status") == "not_ready":
        return "scaffold"
    return "scaffold"


def _runtime_safe(path: Path) -> bool:
    return path.parent == NORMALIZED_DIR or path.name.endswith("_comparison.json") or path.name.endswith("_summary.csv")


def _parse_metadata_from_name(path: Path) -> dict[str, Any]:
    stem = path.stem
    parts = stem.split("_")
    model_key = None
    variant = None
    cycle = None

    if parts and parts[0] in {"vulnerability", "reform", "by"}:
        if stem.startswith("vulnerability"):
            model_key = "vulnerability"
            tail = stem.removeprefix("vulnerability_")
        elif stem.startswith("reform_threat"):
            model_key = "reform_threat"
            tail = stem.removeprefix("reform_threat_")
        elif stem.startswith("by_election_risk"):
            model_key = "by_election_risk"
            tail = stem.removeprefix("by_election_risk_")
        else:
            tail = ""
        tail_parts = [part for part in tail.split("_") if part]
        for part in tail_parts:
            if part.isdigit():
                cycle = int(part)
                break
        if cycle is not None:
            cycle_index = tail_parts.index(str(cycle))
            variant_parts = tail_parts[cycle_index + 1 :]
            if variant_parts and variant_parts[-1] in {"backtest", "features"}:
                variant_parts = variant_parts[:-1]
            variant = "_".join(variant_parts) or None

    return {"model_key": model_key, "variant": variant, "cycle": cycle}


def _read_json_if_possible(path: Path) -> dict[str, Any] | None:
    if path.suffix != ".json":
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def build_manifest_entries() -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for path in sorted(BACKTEST_DIR.rglob("*")):
        if not path.is_file():
            continue
        payload = _read_json_if_possible(path)
        parsed = _parse_metadata_from_name(path)
        warnings = []
        if payload:
            warnings = payload.get("warnings") or payload.get("leakage_warnings") or []
            if not isinstance(warnings, list):
                warnings = [warnings]

        entry = {
            "artifact_path": str(path).replace("\\", "/"),
            "artifact_type": _artifact_kind(path),
            "model_key": payload.get("model_key") if payload else parsed["model_key"],
            "variant": payload.get("variant") if payload else parsed["variant"],
            "cycle": payload.get("target_cycle") if payload else parsed["cycle"],
            "modified_at": path.stat().st_mtime,
            "runtime_safe": _runtime_safe(path),
            "classification": _artifact_classification(path, payload),
            "status": payload.get("status") if payload else None,
            "notes": payload.get("notes") if payload else None,
            "warnings": warnings[:5],
        }
        entries.append(entry)
    return entries


def write_validation_manifest(entries: list[dict[str, Any]], output_path: Path = MANIFEST_PATH) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "artifact_count": len(entries),
        "entries": entries,
    }
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return output_path
