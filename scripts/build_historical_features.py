"""Generate cycle-aligned historical vulnerability features for real backtests."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.lib.backtest_data_loader import (  # noqa: E402
    SUPPORTED_VULNERABILITY_TARGET_CYCLES,
    SUPPORTED_VULNERABILITY_VARIANTS,
    build_vulnerability_feature_dataset,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build historical feature datasets for vulnerability backtests.")
    parser.add_argument("--target-cycle", type=int, choices=SUPPORTED_VULNERABILITY_TARGET_CYCLES)
    parser.add_argument("--variant", choices=SUPPORTED_VULNERABILITY_VARIANTS, default="baseline")
    parser.add_argument("--all-variants", action="store_true")
    parser.add_argument("--all", action="store_true", dest="run_all")
    return parser.parse_args()


def resolve_cycles(args: argparse.Namespace) -> list[int]:
    if args.run_all:
        return list(SUPPORTED_VULNERABILITY_TARGET_CYCLES)
    if not args.target_cycle:
        raise SystemExit("Specify --target-cycle or use --all.")
    return [args.target_cycle]


def main() -> int:
    args = parse_args()
    cycles = resolve_cycles(args)
    variants = list(SUPPORTED_VULNERABILITY_VARIANTS) if args.all_variants else [args.variant]
    for target_cycle in cycles:
        for variant in variants:
            dataset = build_vulnerability_feature_dataset(target_cycle, variant=variant, write_artifacts=True)
            summary = dataset["summary"]
            status = "built" if summary["variant_ready"] else "not_ready"
            print(
                f"[{status}] vulnerability {target_cycle} {variant} :: "
                f"{summary['row_count']} seats :: "
                f"{summary['artifact_csv_path']}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
