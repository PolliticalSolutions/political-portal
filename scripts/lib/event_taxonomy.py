"""Structured taxonomy helpers for politically destabilising events."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


TAXONOMY_PATH = Path("scripts") / "seed_event_type_definitions.json"


@lru_cache(maxsize=1)
def load_event_taxonomy(path: Path = TAXONOMY_PATH) -> dict[str, dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {entry["key"]: entry for entry in payload}


def validate_event_type(event_type_key: str, path: Path = TAXONOMY_PATH) -> bool:
    return event_type_key in load_event_taxonomy(path)


def get_default_weights(event_type_key: str, path: Path = TAXONOMY_PATH) -> dict[str, float] | None:
    entry = load_event_taxonomy(path).get(event_type_key)
    if not entry:
        return None
    return {
        "by_election_risk": float(entry["default_weight_for_by_election_risk"]),
        "vulnerability": float(entry["default_weight_for_vulnerability"]),
    }


def validate_taxonomy_shape(path: Path = TAXONOMY_PATH) -> list[str]:
    required_fields = {
        "key",
        "label",
        "category",
        "suggested_severity_range",
        "default_weight_for_by_election_risk",
        "default_weight_for_vulnerability",
        "notes",
    }
    errors: list[str] = []
    taxonomy = json.loads(path.read_text(encoding="utf-8"))
    seen_keys: set[str] = set()
    for index, entry in enumerate(taxonomy, start=1):
        missing = sorted(required_fields.difference(entry))
        if missing:
            errors.append(f"row {index} missing fields: {', '.join(missing)}")
        key = entry.get("key")
        if key in seen_keys:
            errors.append(f"duplicate key: {key}")
        seen_keys.add(key)
        severity_range = entry.get("suggested_severity_range")
        if not isinstance(severity_range, list) or len(severity_range) != 2:
            errors.append(f"invalid severity range for: {key}")
    return errors
