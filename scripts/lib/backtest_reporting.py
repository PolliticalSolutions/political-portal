"""Structured reporting helpers for model backtest runs."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Iterable, Mapping


ARTIFACT_DIR = Path("artifacts") / "backtests"


def ensure_artifact_dir() -> Path:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    return ARTIFACT_DIR


def write_json_report(payload: Mapping[str, object], filename: str) -> Path:
    artifact_dir = ensure_artifact_dir()
    output_path = artifact_dir / filename
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return output_path


def append_summary_csv(rows: Iterable[Mapping[str, object]], filename: str = "summary.csv") -> Path:
    artifact_dir = ensure_artifact_dir()
    output_path = artifact_dir / filename
    row_list = list(rows)
    if not row_list:
        return output_path

    fieldnames = list(row_list[0].keys())
    write_header = not output_path.exists()
    with output_path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()
        writer.writerows(row_list)
    return output_path
