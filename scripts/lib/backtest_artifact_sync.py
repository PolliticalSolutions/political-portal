"""Normalize local backtest artifacts for later database/runtime ingestion."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


ARTIFACT_DIR = Path("artifacts") / "backtests"
NORMALIZED_DIR = ARTIFACT_DIR / "normalized"
NORMALIZED_EXPORT_PATH = NORMALIZED_DIR / "model_backtest_runs.json"


@dataclass
class NormalizedBacktestRun:
    model_key: str
    model_version: str | None
    variant_key: str | None
    baseline_cycle: int | None
    target_cycle: int | None
    run_timestamp: str | None
    run_mode: str | None
    metrics: dict[str, Any]
    signal_coverage_summary: dict[str, Any]
    warnings: list[Any]
    artifact_path: str
    status: str | None
    notes: str | None
    source_filename: str

    def to_record(self) -> dict[str, Any]:
        return asdict(self)


def list_backtest_artifacts(artifact_dir: Path = ARTIFACT_DIR) -> list[Path]:
    if not artifact_dir.exists():
        return []
    paths = []
    for path in artifact_dir.glob("*.json"):
        if path.name.endswith("_comparison.json"):
            continue
        if path.name.startswith("summary"):
            continue
        paths.append(path)
    return sorted(paths)


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _normalize_notes(raw_notes: Any) -> str | None:
    if raw_notes is None:
        return None
    if isinstance(raw_notes, list):
        cleaned = [str(item).strip() for item in raw_notes if str(item).strip()]
        return " | ".join(cleaned) if cleaned else None
    text = str(raw_notes).strip()
    return text or None


def normalize_backtest_artifact(path: Path) -> NormalizedBacktestRun | None:
    payload = _read_json(path)
    model_key = payload.get("model_key")
    target_cycle = payload.get("target_cycle")
    if not model_key or target_cycle is None:
        return None

    model_version = None
    feature_summary = payload.get("feature_summary") or {}
    if isinstance(feature_summary, dict):
        baseline_type = feature_summary.get("baseline_election_type")
        if baseline_type:
            model_version = f"{model_key}:{baseline_type}"

    warnings = payload.get("warnings") or payload.get("leakage_warnings") or []
    if not isinstance(warnings, list):
        warnings = [warnings]

    signal_coverage_summary = payload.get("signal_coverage_summary") or {}
    if not isinstance(signal_coverage_summary, dict):
        signal_coverage_summary = {}

    return NormalizedBacktestRun(
        model_key=str(model_key),
        model_version=model_version,
        variant_key=payload.get("variant"),
        baseline_cycle=payload.get("baseline_cycle"),
        target_cycle=target_cycle,
        run_timestamp=payload.get("run_timestamp"),
        run_mode=payload.get("run_mode"),
        metrics=payload.get("metrics") or {},
        signal_coverage_summary=signal_coverage_summary,
        warnings=warnings,
        artifact_path=str(path).replace("\\", "/"),
        status=payload.get("status"),
        notes=_normalize_notes(payload.get("notes")),
        source_filename=path.name,
    )


def collect_normalized_backtest_runs(artifact_dir: Path = ARTIFACT_DIR) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for path in list_backtest_artifacts(artifact_dir):
        normalized = normalize_backtest_artifact(path)
        if normalized:
            records.append(normalized.to_record())
    return records


def write_normalized_export(records: list[dict[str, Any]], output_path: Path = NORMALIZED_EXPORT_PATH) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_from": str(ARTIFACT_DIR).replace("\\", "/"),
        "record_count": len(records),
        "records": records,
    }
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return output_path
