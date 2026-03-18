"""Normalize local backtest artifacts for later Supabase ingestion."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.lib.backtest_artifact_sync import (  # noqa: E402
    NORMALIZED_EXPORT_PATH,
    collect_normalized_backtest_runs,
    write_normalized_export,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize local backtest artifacts for later database sync.")
    parser.add_argument("--dry-run", action="store_true", help="Print summary only and still emit normalized export.")
    parser.add_argument(
        "--output",
        type=Path,
        default=NORMALIZED_EXPORT_PATH,
        help="Where to write the normalized export payload.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    records = collect_normalized_backtest_runs()
    output_path = write_normalized_export(records, args.output)
    summary = {
        "record_count": len(records),
        "output_path": str(output_path).replace("\\", "/"),
        "models": sorted({record["model_key"] for record in records}),
        "variants": sorted({record["variant_key"] for record in records if record["variant_key"]}),
        "statuses": sorted({record["status"] for record in records if record["status"]}),
        "dry_run": args.dry_run,
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
