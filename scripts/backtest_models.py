"""Historical backtesting scaffold for intelligence models.

Dry-run mode always produces a structured artifact describing what a full run would require.
"""

from __future__ import annotations

import argparse
from datetime import datetime, UTC
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.lib.backtest_data_loader import (  # noqa: E402
    GENERAL_ELECTION_CYCLES,
    MODEL_BACKTEST_SPECS,
    load_backtest_dataset,
)
from scripts.lib.backtest_metrics import build_metric_pack  # noqa: E402
from scripts.lib.backtest_reporting import append_summary_csv, write_json_report  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run or plan intelligence model backtests.")
    parser.add_argument("--model", choices=sorted(MODEL_BACKTEST_SPECS.keys()))
    parser.add_argument("--target-cycle", type=int, choices=GENERAL_ELECTION_CYCLES)
    parser.add_argument("--all", action="store_true", dest="run_all")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def resolve_runs(args: argparse.Namespace) -> list[tuple[str, int]]:
    if args.run_all:
        return [
            (model_key, cycle)
            for model_key in MODEL_BACKTEST_SPECS
            for cycle in GENERAL_ELECTION_CYCLES
            if cycle != GENERAL_ELECTION_CYCLES[0]
        ]

    if not args.model or not args.target_cycle:
        raise SystemExit("Specify --model and --target-cycle, or use --all.")

    return [(args.model, args.target_cycle)]


def run_backtest(model_key: str, target_cycle: int, dry_run: bool) -> dict[str, object]:
    dataset = load_backtest_dataset(model_key, target_cycle, dry_run=dry_run)
    plan = dataset["plan"]
    timestamp = datetime.now(UTC).isoformat()

    if dry_run or not dataset["rows"]:
        metrics = {}
        status = "data_required" if not dry_run else "dry_run_ready"
        notes = list(plan.notes) + [
            "No live historical rows were loaded; metrics are listed but not executed.",
            "Use this artifact to confirm leakage exclusions, signal availability, and data requirements before enabling full runs.",
        ]
    else:
        metrics = build_metric_pack(dataset["rows"])
        status = "completed"
        notes = list(plan.notes)

    payload = {
        "model_key": model_key,
        "target_cycle": target_cycle,
        "baseline_cycle": plan.baseline_cycle,
        "run_timestamp": timestamp,
        "run_mode": plan.run_mode,
        "status": status,
        "signal_coverage_summary": {
            "available_signals": plan.available_signals,
            "missing_signals": plan.missing_signals,
            "excluded_signals": plan.excluded_signals,
        },
        "excluded_signals": plan.excluded_signals,
        "metrics": metrics,
        "planned_metrics": list(build_metric_pack([]).keys()),
        "leakage_warnings": plan.leakage_warnings,
        "data_limitations": [
            "No future-cycle or post-target signals should be included in a full run.",
            "Signals flagged as missing or excluded must remain out of the scored feature set unless a historically valid source is added.",
        ],
        "data_dependencies": plan.data_dependencies,
        "notes": notes,
    }

    filename = f"{model_key}_{target_cycle}_backtest.json"
    report_path = write_json_report(payload, filename)
    append_summary_csv(
        [
            {
                "model_key": model_key,
                "target_cycle": target_cycle,
                "run_mode": plan.run_mode,
                "status": status,
                "baseline_cycle": plan.baseline_cycle or "",
                "available_signal_count": len(plan.available_signals),
                "missing_signal_count": len(plan.missing_signals),
                "excluded_signal_count": len(plan.excluded_signals),
            }
        ]
    )
    payload["artifact_path"] = str(report_path)
    return payload


def main() -> int:
    args = parse_args()
    runs = resolve_runs(args)
    for model_key, target_cycle in runs:
        report = run_backtest(model_key, target_cycle, dry_run=args.dry_run)
        print(
            f"[{report['status']}] {model_key} -> {target_cycle} "
            f"(baseline {report['baseline_cycle'] or 'n/a'}) :: {report['artifact_path']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
