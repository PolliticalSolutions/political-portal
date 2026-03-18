"""Validate and normalize event-history imports for future by-election intelligence."""

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any


ARTIFACT_DIR = Path("artifacts") / "event_history"
PREVIEW_PATH = ARTIFACT_DIR / "cleaned_preview.json"
REPORT_PATH = ARTIFACT_DIR / "validation_report.json"
REQUIRED_FIELDS = [
    "event_id",
    "constituency_identifier",
    "constituency_name",
    "event_date",
    "event_type",
    "event_severity",
    "subject_type",
    "summary",
    "source_confidence",
    "affects_by_election_risk",
    "affects_vulnerability",
]
ALLOWED_SUBJECT_TYPES = {"mp", "council", "association", "party", "legal"}
ALLOWED_SOURCE_CONFIDENCE = {"high", "medium", "low", "unverified"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate and normalize event-history CSV/JSON inputs.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--preview-output", type=Path, default=PREVIEW_PATH)
    parser.add_argument("--report-output", type=Path, default=REPORT_PATH)
    return parser.parse_args()


def load_rows(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        with path.open("r", newline="", encoding="utf-8") as handle:
            return list(csv.DictReader(handle))
    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict) and isinstance(payload.get("rows"), list):
            return payload["rows"]
    raise ValueError(f"Unsupported input format: {path}")


def parse_boolean(raw_value: Any) -> bool | None:
    if isinstance(raw_value, bool):
        return raw_value
    if raw_value is None:
        return None
    value = str(raw_value).strip().lower()
    if value in {"true", "1", "yes"}:
        return True
    if value in {"false", "0", "no"}:
        return False
    return None


def normalize_tags(raw_value: Any) -> list[str]:
    if raw_value is None or raw_value == "":
        return []
    if isinstance(raw_value, list):
        return [str(item).strip() for item in raw_value if str(item).strip()]
    value = str(raw_value).strip()
    if value.startswith("["):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except json.JSONDecodeError:
            pass
    return [part.strip() for part in value.replace("|", ",").split(",") if part.strip()]


def validate_row(row: dict[str, Any], seen_ids: set[str]) -> tuple[dict[str, Any] | None, list[str]]:
    errors: list[str] = []
    for field in REQUIRED_FIELDS:
        if row.get(field) in {None, ""}:
            errors.append(f"missing:{field}")

    event_id = str(row.get("event_id") or "").strip()
    if event_id:
        if event_id in seen_ids:
            errors.append("duplicate:event_id")
        seen_ids.add(event_id)

    try:
        datetime.fromisoformat(str(row.get("event_date")))
    except ValueError:
        errors.append("invalid:event_date")

    subject_type = str(row.get("subject_type") or "").strip().lower()
    if subject_type and subject_type not in ALLOWED_SUBJECT_TYPES:
        errors.append("invalid:subject_type")

    source_confidence = str(row.get("source_confidence") or "").strip().lower()
    if source_confidence and source_confidence not in ALLOWED_SOURCE_CONFIDENCE:
        errors.append("invalid:source_confidence")

    affects_by_election_risk = parse_boolean(row.get("affects_by_election_risk"))
    affects_vulnerability = parse_boolean(row.get("affects_vulnerability"))
    if affects_by_election_risk is None:
        errors.append("invalid:affects_by_election_risk")
    if affects_vulnerability is None:
        errors.append("invalid:affects_vulnerability")

    try:
        severity = int(row.get("event_severity"))
    except (TypeError, ValueError):
        errors.append("invalid:event_severity")
        severity = None

    if errors:
        return None, errors

    normalized = {
        "event_id": event_id,
        "constituency_identifier": str(row.get("constituency_identifier")).strip(),
        "constituency_name": str(row.get("constituency_name")).strip(),
        "event_date": str(row.get("event_date")).strip(),
        "event_type": str(row.get("event_type")).strip(),
        "event_severity": severity,
        "subject_type": subject_type,
        "subject_name": str(row.get("subject_name") or "").strip() or None,
        "summary": str(row.get("summary")).strip(),
        "source_url": str(row.get("source_url") or "").strip() or None,
        "source_confidence": source_confidence,
        "structured_tags": normalize_tags(row.get("structured_tags")),
        "affects_by_election_risk": affects_by_election_risk,
        "affects_vulnerability": affects_vulnerability,
        "notes": str(row.get("notes") or "").strip() or None,
    }
    return normalized, []


def write_outputs(cleaned_rows: list[dict[str, Any]], rejected_rows: list[dict[str, Any]], preview_output: Path, report_output: Path) -> None:
    preview_output.parent.mkdir(parents=True, exist_ok=True)
    preview_output.write_text(json.dumps({"rows": cleaned_rows}, indent=2), encoding="utf-8")
    report_output.write_text(
        json.dumps(
            {
                "clean_row_count": len(cleaned_rows),
                "rejected_row_count": len(rejected_rows),
                "rejected_rows": rejected_rows,
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    rows = load_rows(args.input)
    seen_ids: set[str] = set()
    cleaned_rows: list[dict[str, Any]] = []
    rejected_rows: list[dict[str, Any]] = []

    for index, row in enumerate(rows, start=1):
        normalized, errors = validate_row(row, seen_ids)
        if errors:
            rejected_rows.append({"row_number": index, "event_id": row.get("event_id"), "errors": errors})
            continue
        cleaned_rows.append(normalized)

    write_outputs(cleaned_rows, rejected_rows, args.preview_output, args.report_output)
    summary = {
        "input_path": str(args.input).replace("\\", "/"),
        "clean_row_count": len(cleaned_rows),
        "rejected_row_count": len(rejected_rows),
        "preview_output": str(args.preview_output).replace("\\", "/"),
        "report_output": str(args.report_output).replace("\\", "/"),
        "dry_run": args.dry_run,
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
