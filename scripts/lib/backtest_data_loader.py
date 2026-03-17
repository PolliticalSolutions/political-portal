"""Model-aware backtesting data loading and dry-run planning."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Mapping


GENERAL_ELECTION_CYCLES = [2015, 2017, 2019, 2024]
RESULTS_DATA_PATH = Path("scripts") / "elections.seed.json"

PYTHON_SIGNAL_INVENTORY: Dict[str, Mapping[str, object]] = {
    "conservative_majority_pct": {
        "data_source_key": "general_election_results",
        "historical_coverage": "high",
        "audit_status": "robust",
    },
    "conservative_vote_share_change": {
        "data_source_key": "general_election_results",
        "historical_coverage": "high",
        "audit_status": "robust",
    },
    "challenger_gap": {
        "data_source_key": "general_election_results",
        "historical_coverage": "high",
        "audit_status": "robust",
    },
    "reform_vote_share": {
        "data_source_key": "general_election_results",
        "historical_coverage": "medium",
        "audit_status": "robust",
    },
    "con_reform_swing": {
        "data_source_key": "notional_results",
        "historical_coverage": "medium",
        "audit_status": "noisy",
    },
    "local_reform_presence": {
        "data_source_key": "local_government_results",
        "historical_coverage": "low",
        "audit_status": "noisy",
    },
    "turnout_volatility": {
        "data_source_key": "general_election_results",
        "historical_coverage": "medium",
        "audit_status": "noisy",
    },
    "demographic_headwinds": {
        "data_source_key": "constituency_demographics",
        "historical_coverage": "medium",
        "audit_status": "noisy",
    },
    "alert_pressure": {
        "data_source_key": "political_alerts",
        "historical_coverage": "low",
        "audit_status": "insufficient_data",
    },
    "mp_instability": {
        "data_source_key": "mp_events",
        "historical_coverage": "low",
        "audit_status": "insufficient_data",
    },
    "local_government_instability": {
        "data_source_key": "local_government_results",
        "historical_coverage": "low",
        "audit_status": "noisy",
    },
    "anti_incumbent_pressure": {
        "data_source_key": "polling_and_trends",
        "historical_coverage": "medium",
        "audit_status": "noisy",
    },
    "fragmentation_pressure": {
        "data_source_key": "general_election_results",
        "historical_coverage": "medium",
        "audit_status": "noisy",
    },
}

MODEL_BACKTEST_SPECS: Dict[str, Mapping[str, object]] = {
    "vulnerability": {
        "label": "Conservative Seat Vulnerability",
        "signal_keys": [
            "conservative_majority_pct",
            "challenger_gap",
            "conservative_vote_share_change",
            "demographic_headwinds",
            "anti_incumbent_pressure",
            "reform_vote_share",
            "fragmentation_pressure",
        ],
        "historically_backtestable": True,
        "baseline_universe": "Conservative-held seats in the prior election cycle",
    },
    "reform_threat": {
        "label": "Reform UK Threat Index",
        "signal_keys": [
            "reform_vote_share",
            "con_reform_swing",
            "conservative_majority_pct",
            "local_reform_presence",
            "local_government_instability",
            "demographic_headwinds",
            "fragmentation_pressure",
        ],
        "historically_backtestable": "partial",
        "baseline_universe": "Conservative-held seats with a defensible Reform/right-fragmentation analogue",
    },
    "by_election_risk": {
        "label": "By-Election Risk Model",
        "signal_keys": [
            "conservative_majority_pct",
            "challenger_gap",
            "local_government_instability",
            "mp_instability",
            "alert_pressure",
            "anti_incumbent_pressure",
            "turnout_volatility",
            "fragmentation_pressure",
        ],
        "historically_backtestable": "limited",
        "baseline_universe": "Seats with usable event history prior to the target cycle",
    },
}


@dataclass
class BacktestPlan:
    model_key: str
    target_cycle: int
    baseline_cycle: int | None
    run_mode: str
    available_signals: List[str]
    missing_signals: List[str]
    excluded_signals: List[Mapping[str, str]]
    data_dependencies: List[str]
    leakage_warnings: List[str]
    notes: List[str]


def get_baseline_cycle(target_cycle: int) -> int | None:
    candidates = [cycle for cycle in GENERAL_ELECTION_CYCLES if cycle < target_cycle]
    return candidates[-1] if candidates else None


def _signal_availability(model_key: str, target_cycle: int, signal_key: str) -> tuple[str, str]:
    signal = PYTHON_SIGNAL_INVENTORY[signal_key]
    coverage = signal["historical_coverage"]

    if model_key == "reform_threat" and signal_key in {"reform_vote_share", "con_reform_swing"} and target_cycle < 2024:
        return "excluded", "Direct Reform-era historical analogue is not defensible before 2024."

    if signal["audit_status"] == "insufficient_data":
        return "missing", "Historical signal coverage is too weak for clean backtesting."

    if coverage == "low":
        return "missing", "Historical coverage is currently too patchy."

    return "available", ""


def build_backtest_plan(model_key: str, target_cycle: int, dry_run: bool = False) -> BacktestPlan:
    if model_key not in MODEL_BACKTEST_SPECS:
        raise ValueError(f"Unsupported model: {model_key}")
    if target_cycle not in GENERAL_ELECTION_CYCLES:
        raise ValueError(f"Unsupported target cycle: {target_cycle}")

    baseline_cycle = get_baseline_cycle(target_cycle)
    signal_keys = MODEL_BACKTEST_SPECS[model_key]["signal_keys"]
    available_signals: list[str] = []
    missing_signals: list[str] = []
    excluded_signals: list[dict[str, str]] = []

    for signal_key in signal_keys:
        status, reason = _signal_availability(model_key, target_cycle, signal_key)
        if status == "available":
            available_signals.append(signal_key)
        elif status == "missing":
            missing_signals.append(signal_key)
        else:
            excluded_signals.append({"signal_key": signal_key, "reason": reason})

    leakage_warnings = []
    if baseline_cycle is None:
        leakage_warnings.append(
            "No prior general election cycle is available as a clean baseline, so the run cannot proceed without leakage risk."
        )
    if model_key == "by_election_risk":
        leakage_warnings.append(
            "By-election risk relies on event-driven signals that are not yet historically complete; treat any backtest as partial."
        )
    if model_key == "reform_threat" and target_cycle < 2024:
        leakage_warnings.append(
            "Reform-era signal structure is not directly comparable before 2024, so historical runs are conceptually partial."
        )

    data_dependencies = [
        "Historical Westminster election results by constituency",
        "Named signal extracts aligned to baseline cycle only",
        "Outcome labelling for target cycle without post-target leakage",
    ]
    if model_key in {"reform_threat", "by_election_risk"}:
        data_dependencies.append("Structured local government and event-history extracts where available")

    notes = [
        f"Baseline cycle: {baseline_cycle if baseline_cycle else 'unavailable'}",
        f"Run mode: {'dry-run' if dry_run else 'live'}",
        f"Universe: {MODEL_BACKTEST_SPECS[model_key]['baseline_universe']}",
    ]
    if not RESULTS_DATA_PATH.exists():
        notes.append("Local election seed file exists only for application seeding; full historical backtests still require richer constituency-level datasets.")

    return BacktestPlan(
        model_key=model_key,
        target_cycle=target_cycle,
        baseline_cycle=baseline_cycle,
        run_mode="dry-run" if dry_run else "live",
        available_signals=available_signals,
        missing_signals=missing_signals,
        excluded_signals=excluded_signals,
        data_dependencies=data_dependencies,
        leakage_warnings=leakage_warnings,
        notes=notes,
    )


def load_backtest_dataset(model_key: str, target_cycle: int, dry_run: bool = False) -> Mapping[str, object]:
    plan = build_backtest_plan(model_key, target_cycle, dry_run=dry_run)
    return {
        "plan": plan,
        "rows": [],
        "signal_inventory": {
            key: PYTHON_SIGNAL_INVENTORY[key]
            for key in MODEL_BACKTEST_SPECS[model_key]["signal_keys"]
        },
        "execution_status": "dry_run" if dry_run else "data_required",
    }
