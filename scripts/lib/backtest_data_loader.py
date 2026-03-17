"""Model-aware backtesting data loading with real vulnerability feature extraction."""

from __future__ import annotations

import csv
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Mapping
import urllib.parse
import urllib.request


GENERAL_ELECTION_CYCLES = [2015, 2017, 2019, 2024]
SUPPORTED_VULNERABILITY_TARGET_CYCLES = [2017, 2019, 2024]
SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"
FEATURE_ARTIFACT_DIR = Path("artifacts") / "backtests" / "features"
CONSERVATIVE_SHORT_NAMES = {"Con", "Conservative"}

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

VULNERABILITY_CYCLE_SPECS = {
    2017: {"baseline_cycle": 2015, "previous_cycle": 2010, "baseline_type": "general"},
    2019: {"baseline_cycle": 2017, "previous_cycle": 2015, "baseline_type": "general"},
    2024: {"baseline_cycle": 2019, "previous_cycle": 2017, "baseline_type": "notional"},
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


def _load_service_key() -> str:
    env_path = Path(".env")
    service_key = None
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("SUPABASE_SERVICE_KEY="):
                service_key = line.strip().split("=", 1)[1]
                break
    service_key = service_key or os.environ.get("SUPABASE_SERVICE_KEY")
    if not service_key:
        raise RuntimeError("SUPABASE_SERVICE_KEY is required for real historical backtests.")
    return service_key


def _supabase_fetch_all(table: str, select: str, filters: Mapping[str, str] | None = None) -> list[dict[str, Any]]:
    key = _load_service_key()
    offset = 0
    rows: list[dict[str, Any]] = []
    base_filters = dict(filters or {})

    while True:
        params = {"select": select, "limit": "1000", "offset": str(offset), **base_filters}
        url = f"{SUPABASE_URL}/rest/v1/{table}?{urllib.parse.urlencode(params)}"
        request = urllib.request.Request(
            url,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            batch = json.loads(response.read().decode())
        rows.extend(batch or [])
        if len(batch or []) < 1000:
            break
        offset += 1000
    return rows


def _ensure_feature_dir() -> Path:
    FEATURE_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    return FEATURE_ARTIFACT_DIR


def _feature_csv_path(target_cycle: int) -> Path:
    return _ensure_feature_dir() / f"vulnerability_{target_cycle}_features.csv"


def _feature_summary_path(target_cycle: int) -> Path:
    return _ensure_feature_dir() / f"vulnerability_{target_cycle}_features.json"


def _normalise_vote_share(raw_value: Any) -> float:
    if raw_value is None:
        return 0.0
    value = float(raw_value)
    return value * 100 if value <= 1 else value


def _percentage(numerator: Any, denominator: Any) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return (float(numerator) / float(denominator)) * 100


def _fetch_elections() -> list[dict[str, Any]]:
    return _supabase_fetch_all(
        "elections",
        "id,election_date,name,election_type",
    )


def _resolve_election_id(cycle: int, election_type: str) -> dict[str, Any]:
    elections = _fetch_elections()
    for election in elections:
        election_year = int(str(election["election_date"]).split("-", 1)[0])
        if election_year == cycle and election["election_type"] == election_type:
            return election
    raise RuntimeError(f"Could not find {election_type} election for {cycle}.")


def get_baseline_cycle(target_cycle: int) -> int | None:
    spec = VULNERABILITY_CYCLE_SPECS.get(target_cycle)
    return spec["baseline_cycle"] if spec else None


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
    notes.append("Real feature loading is currently implemented only for the vulnerability model.")

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


def _fetch_results_for_election(election_id: str) -> list[dict[str, Any]]:
    return _supabase_fetch_all(
        "results",
        "constituency_id,vote_share,majority,electorate,is_winner,constituencies(id,ons_code,name),parties(name,short_name)",
        {"election_id": f"eq.{election_id}"},
    )


def _build_constituency_result_map(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    seats: dict[str, dict[str, Any]] = {}
    for row in rows:
        constituency_id = row["constituency_id"]
        seat = seats.setdefault(
            constituency_id,
            {
                "constituency_id": constituency_id,
                "ons_code": row.get("constituencies", {}).get("ons_code"),
                "constituency_name": row.get("constituencies", {}).get("name"),
                "party_results": {},
                "winner_party": None,
                "winner_majority_pct": None,
                "winner_electorate": row.get("electorate"),
            },
        )
        party_short_name = row.get("parties", {}).get("short_name") or row.get("parties", {}).get("name")
        seat["party_results"][party_short_name] = _normalise_vote_share(row.get("vote_share"))
        if row.get("is_winner"):
            seat["winner_party"] = party_short_name
            seat["winner_majority_pct"] = _percentage(row.get("majority"), row.get("electorate"))
            seat["winner_electorate"] = row.get("electorate")

    for seat in seats.values():
        con_share = max(
            (share for party, share in seat["party_results"].items() if party in CONSERVATIVE_SHORT_NAMES),
            default=0.0,
        )
        challenger_share = max(
            (share for party, share in seat["party_results"].items() if party not in CONSERVATIVE_SHORT_NAMES),
            default=0.0,
        )
        seat["conservative_vote_share_pct"] = con_share
        seat["challenger_vote_share_pct"] = challenger_share
        seat["challenger_gap_pct"] = con_share - challenger_share
        seat["seat_held_by_conservative"] = seat["winner_party"] in CONSERVATIVE_SHORT_NAMES
    return seats


def _validate_vulnerability_rows(rows: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    required_keys = [
        "baseline_conservative_vote_share_pct",
        "baseline_conservative_majority_pct",
        "baseline_challenger_vote_share_pct",
        "baseline_challenger_gap_pct",
        "conservative_vote_share_change_input_pct",
        "target_seat_held_by_conservative",
        "observed_loss",
    ]
    missing_rows = []
    for row in rows:
        missing = [key for key in required_keys if row.get(key) is None]
        if missing:
            missing_rows.append({"constituency_name": row["constituency_name"], "missing": missing})
    if missing_rows:
        sample = ", ".join(entry["constituency_name"] for entry in missing_rows[:5])
        raise RuntimeError(
            f"Historical feature dataset is incomplete for {len(missing_rows)} seats. Examples: {sample}."
        )

    seat_names = {row["constituency_name"] for row in rows}
    if len(seat_names) != len(rows):
        warnings.append("Duplicate constituency rows detected in vulnerability feature dataset.")
    return warnings


def build_vulnerability_feature_dataset(target_cycle: int, write_artifacts: bool = False) -> dict[str, Any]:
    if target_cycle not in SUPPORTED_VULNERABILITY_TARGET_CYCLES:
        raise ValueError(f"Unsupported vulnerability target cycle: {target_cycle}")

    cycle_spec = VULNERABILITY_CYCLE_SPECS[target_cycle]
    baseline_cycle = cycle_spec["baseline_cycle"]
    previous_cycle = cycle_spec["previous_cycle"]
    baseline_election = _resolve_election_id(baseline_cycle, cycle_spec["baseline_type"])
    target_election = _resolve_election_id(target_cycle, "general")
    previous_election = _resolve_election_id(previous_cycle, "general")

    baseline_map = _build_constituency_result_map(_fetch_results_for_election(baseline_election["id"]))
    target_map = _build_constituency_result_map(_fetch_results_for_election(target_election["id"]))
    previous_map = _build_constituency_result_map(_fetch_results_for_election(previous_election["id"]))

    warnings: list[str] = []
    rows: list[dict[str, Any]] = []

    baseline_conservative_seats = [
        seat for seat in baseline_map.values() if seat["seat_held_by_conservative"]
    ]

    if not baseline_conservative_seats:
        raise RuntimeError(f"No Conservative-held baseline seats found for {baseline_cycle}.")

    previous_overlap = 0
    previous_missing = 0
    target_missing = 0

    for seat in baseline_conservative_seats:
        constituency_id = seat["constituency_id"]
        target_seat = target_map.get(constituency_id)
        previous_seat = previous_map.get(constituency_id)

        if not target_seat:
            target_missing += 1
            continue

        vote_share_change_pct = None
        vote_share_change_input_pct = 0.0
        vote_share_change_imputed = False
        if previous_seat:
            previous_overlap += 1
            vote_share_change_pct = (
                seat["conservative_vote_share_pct"] - previous_seat["conservative_vote_share_pct"]
            )
            vote_share_change_input_pct = vote_share_change_pct
        else:
            previous_missing += 1
            vote_share_change_imputed = True

        target_conservative_share_pct = target_seat["conservative_vote_share_pct"]
        target_margin_pct = target_seat["challenger_gap_pct"]
        baseline_margin_pct = seat["challenger_gap_pct"]

        row = {
            "target_cycle": target_cycle,
            "baseline_cycle": baseline_cycle,
            "previous_cycle": previous_cycle,
            "constituency_id": constituency_id,
            "ons_code": seat["ons_code"],
            "constituency_name": seat["constituency_name"],
            "baseline_seat_held_by_conservative": True,
            "baseline_incumbent_party": seat["winner_party"],
            "baseline_conservative_vote_share_pct": round(seat["conservative_vote_share_pct"], 4),
            "baseline_conservative_majority_pct": round(seat["winner_majority_pct"], 4)
            if seat["winner_majority_pct"] is not None
            else None,
            "baseline_challenger_vote_share_pct": round(seat["challenger_vote_share_pct"], 4),
            "baseline_challenger_gap_pct": round(seat["challenger_gap_pct"], 4),
            "baseline_conservative_vote_share_change_pct": round(vote_share_change_pct, 4)
            if vote_share_change_pct is not None
            else None,
            "conservative_vote_share_change_input_pct": round(vote_share_change_input_pct, 4),
            "vote_share_change_imputed": vote_share_change_imputed,
            "target_seat_held_by_conservative": bool(target_seat["seat_held_by_conservative"]),
            "target_conservative_vote_share_pct": round(target_conservative_share_pct, 4),
            "target_conservative_vote_share_change_pct": round(
                target_conservative_share_pct - seat["conservative_vote_share_pct"], 4
            ),
            "target_majority_change_pct": round(target_margin_pct - baseline_margin_pct, 4),
            "observed_loss": not bool(target_seat["seat_held_by_conservative"]),
        }
        rows.append(row)

    if target_missing:
        warnings.append(
            f"{target_missing} baseline Conservative seats were missing target-cycle constituency matches and were excluded."
        )
    if previous_missing:
        warnings.append(
            f"{previous_missing} baseline Conservative seats lacked previous-cycle constituency matches; vote-share trend was neutral-imputed for those seats."
        )
    if previous_overlap <= len(rows) * 0.1:
        warnings.append(
            "Previous-cycle overlap is low relative to the baseline universe. Trend features may be weak for this cycle, especially where boundary changes break constituency continuity."
        )
    if cycle_spec["baseline_type"] == "notional":
        warnings.append(
            "2024 backtest uses the 2019 notional baseline on 2024 boundaries to avoid boundary-change leakage."
        )

    warnings.extend(_validate_vulnerability_rows(rows))

    summary = {
        "model_key": "vulnerability",
        "target_cycle": target_cycle,
        "baseline_cycle": baseline_cycle,
        "previous_cycle": previous_cycle,
        "baseline_election_type": cycle_spec["baseline_type"],
        "row_count": len(rows),
        "baseline_conservative_seat_count": len(baseline_conservative_seats),
        "previous_overlap_count": previous_overlap,
        "previous_missing_count": previous_missing,
        "target_missing_count": target_missing,
        "warnings": warnings,
        "feature_columns": [
            "baseline_conservative_vote_share_pct",
            "baseline_conservative_majority_pct",
            "baseline_challenger_vote_share_pct",
            "baseline_challenger_gap_pct",
            "conservative_vote_share_change_input_pct",
        ],
        "outcome_columns": [
            "target_seat_held_by_conservative",
            "target_conservative_vote_share_change_pct",
            "target_majority_change_pct",
            "observed_loss",
        ],
    }

    if write_artifacts:
        feature_dir = _ensure_feature_dir()
        csv_path = _feature_csv_path(target_cycle)
        json_path = _feature_summary_path(target_cycle)
        with csv_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
        json_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        summary["artifact_csv_path"] = str(csv_path)
        summary["artifact_summary_path"] = str(json_path)

    return {"summary": summary, "rows": rows}


def load_vulnerability_feature_dataset(target_cycle: int, require_artifact: bool = False) -> dict[str, Any]:
    csv_path = _feature_csv_path(target_cycle)
    if require_artifact and not csv_path.exists():
        raise RuntimeError(f"Expected feature artifact not found: {csv_path}")
    if csv_path.exists():
        with csv_path.open("r", newline="", encoding="utf-8") as handle:
            rows = list(csv.DictReader(handle))
        parsed_rows = []
        for row in rows:
            parsed_rows.append(
                {
                    key: (
                        None
                        if value in {"", "None", "null"}
                        else value.lower() == "true"
                        if value in {"True", "False", "true", "false"}
                        else float(value)
                        if key.endswith("_pct") or key in {"target_cycle", "baseline_cycle", "previous_cycle"}
                        else value
                    )
                    for key, value in row.items()
                }
            )
        return {"summary": json.loads(_feature_summary_path(target_cycle).read_text(encoding="utf-8")), "rows": parsed_rows}
    return build_vulnerability_feature_dataset(target_cycle, write_artifacts=False)


def load_backtest_dataset(model_key: str, target_cycle: int, dry_run: bool = False) -> Mapping[str, object]:
    plan = build_backtest_plan(model_key, target_cycle, dry_run=dry_run)

    if model_key != "vulnerability" or dry_run:
        return {
            "plan": plan,
            "rows": [],
            "labels": [],
            "signal_inventory": {
                key: PYTHON_SIGNAL_INVENTORY[key]
                for key in MODEL_BACKTEST_SPECS[model_key]["signal_keys"]
            },
            "execution_status": "dry_run" if dry_run else "data_required",
            "warnings": list(plan.leakage_warnings),
        }

    feature_dataset = build_vulnerability_feature_dataset(target_cycle, write_artifacts=True)
    rows = feature_dataset["rows"]
    labels = [bool(row["observed_loss"]) for row in rows]
    warnings = list(plan.leakage_warnings) + list(feature_dataset["summary"]["warnings"])

    return {
        "plan": plan,
        "rows": rows,
        "labels": labels,
        "feature_matrix": [
            {
                "baseline_conservative_majority_pct": row["baseline_conservative_majority_pct"],
                "baseline_challenger_gap_pct": row["baseline_challenger_gap_pct"],
                "conservative_vote_share_change_input_pct": row["conservative_vote_share_change_input_pct"],
            }
            for row in rows
        ],
        "signal_inventory": {
            key: PYTHON_SIGNAL_INVENTORY[key]
            for key in MODEL_BACKTEST_SPECS[model_key]["signal_keys"]
        },
        "execution_status": "completed",
        "warnings": warnings,
        "feature_summary": feature_dataset["summary"],
    }
