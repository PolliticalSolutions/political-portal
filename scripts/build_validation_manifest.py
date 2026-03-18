"""Generate a manifest for validation and backtest artifacts."""

from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.lib.validation_manifest import build_manifest_entries, write_validation_manifest  # noqa: E402


def main() -> int:
    entries = build_manifest_entries()
    output_path = write_validation_manifest(entries)
    summary = {
        "artifact_count": len(entries),
        "output_path": str(output_path).replace("\\", "/"),
        "models": sorted({entry["model_key"] for entry in entries if entry.get("model_key")}),
        "classifications": sorted({entry["classification"] for entry in entries}),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
