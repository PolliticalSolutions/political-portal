"""Run intelligence model backtests.

Vulnerability now supports a real historical run based on cycle-aligned feature extraction.
Other models remain scaffolded and produce structured dry-run planning artifacts.
"""

from __future__ import annotations

import argparse
import csv
from datetime import UTC, datetime
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.lib.backtest_data_loader import (  # noqa: E402
    GENERAL_ELECTION_CYCLES,
    MODEL_BACKTEST_SPECS,
    SUPPORTED_VULNERABILITY_TARGET_CYCLES,
    load_backtest_dataset,
)
from scripts.lib.backtest_metrics import build_metric_pack  # noqa: E402
from scripts.lib.backtest_reporting import append_summary_csv, write_json_report, write_summary_csv  # noqa: E402
from scripts.lib.vulnerability_enrichment_assessment import assess_variant_against_baseline  # noqa: E402
from scripts.lib.vulnerability_model import (  # noqa: E402
    SUPPORTED_VULNERABILITY_VARIANTS,
    score_vulnerability_rows,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run or plan intelligence model backtests.")
    parser.add_argument("--model", choices=sorted(MODEL_BACKTEST_SPECS.keys()))
    parser.add_argument("--target-cycle", type=int, choices=GENERAL_ELECTION_CYCLES)
    parser.add_argument("--variant", choices=SUPPORTED_VULNERABILITY_VARIANTS, default="baseline")
    parser.add_argument("--all-variants", action="store_true")
    parser.add_argument("--all", action="store_true", dest="run_all")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def resolve_runs(args: argparse.Namespace) -> list[tuple[str, int, str]]:
    if args.run_all:
        return [
            (model_key, cycle, "baseline")
            for model_key in MODEL_BACKTEST_SPECS
            for cycle in GENERAL_ELECTION_CYCLES
            if cycle != GENERAL_ELECTION_CYCLES[0]
        ]

    if not args.model or not args.target_cycle:
        raise SystemExit("Specify --model and --target-cycle, or use --all.")

    if args.model == "vulnerability" and args.all_variants:
        return [(args.model, args.target_cycle, variant) for variant in SUPPORTED_VULNERABILITY_VARIANTS]

    return [(args.model, args.target_cycle, args.variant)]


def _looks_suspicious(metrics: dict[str, float]) -> list[str]:
    warnings = []
    if metrics.get("ranking_quality_spearman", 0) > 0.98:
        warnings.append("Ranking correlation is unusually high and should be checked for leakage.")
    if metrics.get("precision_at_20", 0) > 0.9:
        warnings.append("Precision at 20 is unusually high and should be checked for leakage or label contamination.")
    return warnings


def _merge_vulnerability_summary_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    summary_path = Path("artifacts") / "backtests" / "vulnerability_variant_summary.csv"
    existing_by_key: dict[tuple[int, str], dict[str, object]] = {}

    if summary_path.exists():
        with summary_path.open("r", newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                key = (int(row["target_cycle"]), row["variant"])
                existing_by_key[key] = {
                    key: (
                        float(value)
                        if key
                        not in {"target_cycle", "baseline_cycle", "number_of_seats", "variant", "status"}
                        and value != ""
                        else int(value)
                        if key in {"target_cycle", "baseline_cycle", "number_of_seats"} and value != ""
                        else value
                    )
                    for key, value in row.items()
                }

    for row in rows:
        existing_by_key[(int(row["target_cycle"]), str(row["variant"]))] = row

    return [
        existing_by_key[key]
        for key in sorted(existing_by_key, key=lambda item: (item[0], item[1]))
    ]


def _load_existing_vulnerability_reports_by_cycle() -> dict[int, dict[str, dict[str, object]]]:
    reports_by_cycle: dict[int, dict[str, dict[str, object]]] = {}
    artifact_dir = Path("artifacts") / "backtests"
    for cycle in SUPPORTED_VULNERABILITY_TARGET_CYCLES:
        for variant in SUPPORTED_VULNERABILITY_VARIANTS:
            path = artifact_dir / f"vulnerability_{cycle}_{variant}.json"
            if not path.exists():
                continue
            payload = json.loads(path.read_text(encoding="utf-8"))
            reports_by_cycle.setdefault(cycle, {})[variant] = payload
    return reports_by_cycle


def _summarise_vulnerability_report_for_comparison(report: dict[str, object]) -> dict[str, object]:
    feature_summary = dict(report.get("feature_summary", {}))
    return {
        "variant": report.get("variant"),
        "status": report.get("status"),
        "baseline_cycle": report.get("baseline_cycle"),
        "target_cycle": report.get("target_cycle"),
        "number_of_seats": report.get("number_of_seats"),
        "metrics": report.get("metrics", {}),
        "warnings": report.get("warnings", []),
        "artifact_path": report.get("artifact_path"),
        "feature_summary": {
            "variant_ready": feature_summary.get("variant_ready"),
            "feature_columns": feature_summary.get("feature_columns", []),
            "demographic_feature_coverage": feature_summary.get("demographic_feature_coverage"),
            "local_feature_coverage": feature_summary.get("local_feature_coverage"),
            "not_ready_reasons": feature_summary.get("not_ready_reasons", []),
        },
    }


def _determine_strongest_variant(reports_by_cycle: dict[int, dict[str, dict[str, object]]]) -> dict[str, object]:
    candidates = ["baseline", "baseline_demographic"]
    scored: dict[str, list[float]] = {variant: [] for variant in candidates}
    for cycle_reports in reports_by_cycle.values():
        for variant in candidates:
            report = cycle_reports.get(variant)
            if not report or report.get("status") != "completed":
                continue
            metrics = report.get("metrics", {})
            composite = (
                float(metrics.get("top_decile_capture_rate", 0.0))
                + float(metrics.get("precision_at_20", 0.0))
                + float(metrics.get("ranking_quality_spearman", 0.0))
            ) / 3
            scored[variant].append(composite)

    averages = {variant: (sum(values) / len(values) if values else None) for variant, values in scored.items()}
    strongest_variant = max(
        candidates,
        key=lambda variant: averages[variant] if averages[variant] is not None else float("-inf"),
    )
    return {
        "variant": strongest_variant,
        "average_composite_score": round(averages[strongest_variant] or 0.0, 6),
        "comparison_basis": "Mean of top-decile capture, precision@20, and Spearman rank correlation across completed cycles.",
    }


def run_vulnerability_backtest(target_cycle: int, dry_run: bool, variant: str = "baseline") -> dict[str, object]:
    dataset = load_backtest_dataset("vulnerability", target_cycle, dry_run=dry_run, variant=variant)
    plan = dataset["plan"]
    feature_summary = dataset["feature_summary"]
    timestamp = datetime.now(UTC).isoformat()

    if dry_run:
        metrics = {}
        status = "dry_run_ready"
        scored_rows = []
        warnings = list(dataset.get("warnings", []))
        notes = list(plan.notes) + [
            "Dry-run selected. Real vulnerability feature loading is available when --dry-run is omitted.",
        ]
    elif dataset.get("execution_status") == "not_ready":
        metrics = {}
        status = "not_ready"
        scored_rows = []
        warnings = list(dataset.get("warnings", []))
        notes = list(plan.notes) + [
            "Variant was not executed because enrichment coverage is too incomplete for credible comparison.",
        ]
    else:
        scored_rows = sorted(
            score_vulnerability_rows(dataset["rows"], variant=variant),
            key=lambda row: float(row["score"]),
            reverse=True,
        )
        metrics = build_metric_pack(scored_rows)
        warnings = list(dataset.get("warnings", [])) + _looks_suspicious(metrics)
        status = "completed"
        notes = list(plan.notes) + [
            "Target outcome fields are included for evaluation only and are excluded from the scored feature set.",
        ]

    payload = {
        "model_name": "Conservative Seat Vulnerability",
        "model_key": "vulnerability",
        "variant": variant,
        "target_cycle": target_cycle,
        "baseline_cycle": plan.baseline_cycle,
        "run_timestamp": timestamp,
        "run_mode": plan.run_mode,
        "status": status,
        "number_of_seats": len(scored_rows) if scored_rows else len(dataset.get("rows", [])),
        "signal_coverage_summary": {
            "available_signals": plan.available_signals,
            "missing_signals": plan.missing_signals,
            "excluded_signals": plan.excluded_signals,
        },
        "feature_summary": feature_summary,
        "metrics": metrics,
        "ranking_output": [
            {
                "rank": index + 1,
                "constituency_name": row["constituency_name"],
                "ons_code": row["ons_code"],
                "baseline_conservative_majority_pct": row["baseline_conservative_majority_pct"],
                "baseline_challenger_gap_pct": row["baseline_challenger_gap_pct"],
                "baseline_conservative_vote_share_change_pct": row["baseline_conservative_vote_share_change_pct"],
                "score": row["score"],
                "score_bucket": row["score_bucket"],
                "observed_loss": row["observed_loss"],
                "target_seat_held_by_conservative": row["target_seat_held_by_conservative"],
                "target_majority_change_pct": row["target_majority_change_pct"],
            }
            for index, row in enumerate(scored_rows)
        ],
        "notes": notes,
        "warnings": warnings,
        "data_limitations": [
            "All variants keep the core vulnerability spine: majority exposure, challenger gap, and baseline vote-share trend.",
            "2024 uses the 2019 notional baseline on 2024 boundaries to avoid boundary-change leakage.",
            "Enrichment families are tested in isolation before any combined adoption decision.",
        ],
    }

    report_path = write_json_report(payload, f"vulnerability_{target_cycle}_{variant}.json")
    payload["artifact_path"] = str(report_path)
    return payload


def run_backtest(model_key: str, target_cycle: int, dry_run: bool, variant: str = "baseline") -> dict[str, object]:
    if model_key == "vulnerability" and target_cycle in SUPPORTED_VULNERABILITY_TARGET_CYCLES:
        return run_vulnerability_backtest(target_cycle, dry_run, variant=variant)

    dataset = load_backtest_dataset(model_key, target_cycle, dry_run=dry_run)
    plan = dataset["plan"]
    timestamp = datetime.now(UTC).isoformat()

    metrics = {}
    status = "data_required" if not dry_run else "dry_run_ready"
    notes = list(plan.notes) + [
        "No live historical rows were loaded; metrics are listed but not executed.",
        "Use this artifact to confirm leakage exclusions, signal availability, and data requirements before enabling full runs.",
    ]

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
    vulnerability_summary_rows = []
    for model_key, target_cycle, variant in runs:
        report = run_backtest(model_key, target_cycle, dry_run=args.dry_run, variant=variant)
        print(
            f"[{report['status']}] {model_key} -> {target_cycle} [{variant}] "
            f"(baseline {report['baseline_cycle'] or 'n/a'}) :: {report['artifact_path']}"
        )
        if model_key == "vulnerability":
            vulnerability_summary_rows.append(
                {
                    "target_cycle": target_cycle,
                    "variant": variant,
                    "status": report["status"],
                    "baseline_cycle": report["baseline_cycle"],
                    "number_of_seats": report["number_of_seats"],
                    **report["metrics"],
                }
            )

    if vulnerability_summary_rows:
        write_summary_csv(
            _merge_vulnerability_summary_rows(vulnerability_summary_rows),
            "vulnerability_variant_summary.csv",
        )
        vulnerability_reports_by_cycle = _load_existing_vulnerability_reports_by_cycle()
        comparison_payload = {
            "model_key": "vulnerability",
            "variants": list(SUPPORTED_VULNERABILITY_VARIANTS),
            "cycles": sorted(vulnerability_reports_by_cycle),
            "strongest_completed_variant": _determine_strongest_variant(vulnerability_reports_by_cycle),
            "cycle_reports": {
                cycle: {
                    variant: _summarise_vulnerability_report_for_comparison(report)
                    for variant, report in cycle_reports.items()
                }
                for cycle, cycle_reports in vulnerability_reports_by_cycle.items()
            },
            "enrichment_assessments": {
                "demographic": assess_variant_against_baseline("baseline_demographic", vulnerability_reports_by_cycle),
                "local": assess_variant_against_baseline("baseline_local", vulnerability_reports_by_cycle),
                "demographic_local": assess_variant_against_baseline(
                    "baseline_demographic_local",
                    vulnerability_reports_by_cycle,
                ),
            },
        }
        write_json_report(comparison_payload, "vulnerability_variant_comparison.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
