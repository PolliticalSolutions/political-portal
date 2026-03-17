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

from scripts.lib.vulnerability_model import (  # type: ignore
    SUPPORTED_VULNERABILITY_VARIANTS,
    get_variant_feature_columns,
)

GENERAL_ELECTION_CYCLES = [2015, 2017, 2019, 2024]
SUPPORTED_VULNERABILITY_TARGET_CYCLES = [2017, 2019, 2024]
SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"
FEATURE_ARTIFACT_DIR = Path("artifacts") / "backtests" / "features"
CONSERVATIVE_SHORT_NAMES = {"Con", "Conservative"}
DEMOGRAPHIC_TARGET_YEARS = {2017: 2011, 2019: 2011, 2024: 2021}
DEMOGRAPHIC_FALLBACK_YEARS = {2024: 2011}
LOCAL_VARIANT_MIN_COVERAGE = 0.5

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


def _feature_csv_path(target_cycle: int, variant: str) -> Path:
    return _ensure_feature_dir() / f"vulnerability_{target_cycle}_{variant}.csv"


def _feature_summary_path(target_cycle: int, variant: str) -> Path:
    return _ensure_feature_dir() / f"vulnerability_{target_cycle}_{variant}.json"


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


def _fetch_demographics_for_year(census_year: int) -> dict[str, dict[str, Any]]:
    rows = _supabase_fetch_all(
        "demographics",
        "constituency_id,census_year,pct_owner_occupied,pct_private_rented,pct_white_british,pct_born_uk",
        {"census_year": f"eq.{census_year}"},
    )
    return {row["constituency_id"]: row for row in rows if row.get("constituency_id")}


def _fetch_constituency_council_lookup() -> list[dict[str, Any]]:
    return _supabase_fetch_all(
        "constituency_council_lookup",
        "constituency_id,local_authority_id",
    )


def _fetch_local_authorities() -> dict[str, dict[str, Any]]:
    rows = _supabase_fetch_all(
        "local_authorities",
        "id,name,controlling_party,control_type,total_seats",
    )
    return {row["id"]: row for row in rows if row.get("id")}


def _fetch_council_results() -> list[dict[str, Any]]:
    return _supabase_fetch_all(
        "council_results",
        "local_authority_id,party_name,seats_won",
    )


def _normalise_optional_percentage(raw_value: Any) -> float | None:
    if raw_value is None:
        return None
    value = float(raw_value)
    return value * 100 if value <= 1 else value


def _build_demographic_feature_map(target_cycle: int) -> tuple[dict[str, dict[str, float | int]], list[str]]:
    warnings: list[str] = []
    preferred_year = DEMOGRAPHIC_TARGET_YEARS[target_cycle]
    preferred = _fetch_demographics_for_year(preferred_year)
    fallback: dict[str, dict[str, Any]] = {}
    if target_cycle in DEMOGRAPHIC_FALLBACK_YEARS:
        fallback_year = DEMOGRAPHIC_FALLBACK_YEARS[target_cycle]
        fallback = _fetch_demographics_for_year(fallback_year)
        warnings.append(
            f"Demographic enrichment prefers {preferred_year} census data for {target_cycle} and falls back to {fallback_year} where {preferred_year} rows are missing."
        )

    feature_map: dict[str, dict[str, float | int]] = {}
    for constituency_id in set(preferred) | set(fallback):
        source = preferred.get(constituency_id) or fallback.get(constituency_id)
        if not source:
            continue
        feature_map[constituency_id] = {
            "demographic_owner_occupied_pct": _normalise_optional_percentage(source.get("pct_owner_occupied")),
            "demographic_private_rented_pct": _normalise_optional_percentage(source.get("pct_private_rented")),
            "demographic_source_year": int(source["census_year"]),
        }

    return feature_map, warnings


def _build_local_feature_map() -> tuple[dict[str, dict[str, float | int]], dict[str, int]]:
    lookup_rows = _fetch_constituency_council_lookup()
    authorities = _fetch_local_authorities()
    result_rows = _fetch_council_results()

    results_by_authority: dict[str, list[dict[str, Any]]] = {}
    for row in result_rows:
        authority_id = row.get("local_authority_id")
        if authority_id:
            results_by_authority.setdefault(authority_id, []).append(row)

    lookup_by_constituency: dict[str, list[str]] = {}
    for row in lookup_rows:
        constituency_id = row.get("constituency_id")
        authority_id = row.get("local_authority_id")
        if constituency_id and authority_id:
            lookup_by_constituency.setdefault(constituency_id, []).append(authority_id)

    feature_map: dict[str, dict[str, float | int]] = {}
    coverage = {
        "lookup_rows": len(lookup_rows),
        "authority_count": len(authorities),
        "result_row_count": len(result_rows),
        "mapped_constituencies": len(lookup_by_constituency),
    }

    for constituency_id, authority_ids in lookup_by_constituency.items():
        conservative_control_values: list[float] = []
        noc_values: list[float] = []
        reform_seat_shares: list[float] = []
        for authority_id in authority_ids:
            authority = authorities.get(authority_id)
            if not authority:
                continue
            controlling_party = (authority.get("controlling_party") or "").strip().lower()
            control_type = (authority.get("control_type") or "").strip().lower()
            total_seats = authority.get("total_seats") or 0
            conservative_control_values.append(1.0 if controlling_party == "conservative" else 0.0)
            noc_values.append(1.0 if control_type == "noc" else 0.0)

            authority_results = results_by_authority.get(authority_id, [])
            reform_seats = sum(
                int(row.get("seats_won") or 0)
                for row in authority_results
                if str(row.get("party_name") or "").strip().lower() == "reform uk"
            )
            reform_share = (reform_seats / total_seats * 100) if total_seats else 0.0
            reform_seat_shares.append(reform_share)

        if conservative_control_values:
            feature_map[constituency_id] = {
                "local_conservative_control_flag": round(
                    sum(conservative_control_values) / len(conservative_control_values),
                    4,
                ),
                "local_no_overall_control_flag": round(sum(noc_values) / len(noc_values), 4),
                "local_reform_seat_share_pct": round(sum(reform_seat_shares) / len(reform_seat_shares), 4),
            }

    return feature_map, coverage


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


def build_vulnerability_feature_dataset(
    target_cycle: int,
    variant: str = "baseline",
    write_artifacts: bool = False,
) -> dict[str, Any]:
    if target_cycle not in SUPPORTED_VULNERABILITY_TARGET_CYCLES:
        raise ValueError(f"Unsupported vulnerability target cycle: {target_cycle}")
    if variant not in SUPPORTED_VULNERABILITY_VARIANTS:
        raise ValueError(f"Unsupported vulnerability variant: {variant}")

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
    uses_demographics = "demographic" in variant
    uses_local = "local" in variant
    demographic_feature_map: dict[str, dict[str, float | int]] = {}
    local_feature_map: dict[str, dict[str, float | int]] = {}
    local_coverage_meta = {"lookup_rows": 0, "authority_count": 0, "result_row_count": 0, "mapped_constituencies": 0}

    if uses_demographics:
        demographic_feature_map, demographic_warnings = _build_demographic_feature_map(target_cycle)
        warnings.extend(demographic_warnings)
    if uses_local:
        local_feature_map, local_coverage_meta = _build_local_feature_map()

    baseline_conservative_seats = [
        seat for seat in baseline_map.values() if seat["seat_held_by_conservative"]
    ]

    if not baseline_conservative_seats:
        raise RuntimeError(f"No Conservative-held baseline seats found for {baseline_cycle}.")

    previous_overlap = 0
    previous_missing = 0
    target_missing = 0
    demographic_missing = 0
    demographic_used = 0
    local_missing = 0
    local_used = 0

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

        if uses_demographics:
            demographic_features = demographic_feature_map.get(constituency_id)
            if demographic_features:
                demographic_used += 1
                row.update(demographic_features)
            else:
                demographic_missing += 1
                row.update(
                    {
                        "demographic_owner_occupied_pct": None,
                        "demographic_private_rented_pct": None,
                        "demographic_source_year": None,
                    }
                )

        if uses_local:
            local_features = local_feature_map.get(constituency_id)
            if local_features:
                local_used += 1
                row.update(local_features)
            else:
                local_missing += 1
                row.update(
                    {
                        "local_conservative_control_flag": None,
                        "local_no_overall_control_flag": None,
                        "local_reform_seat_share_pct": None,
                    }
                )

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

    demographic_coverage = (demographic_used / len(rows)) if rows and uses_demographics else None
    local_coverage = (local_used / len(rows)) if rows and uses_local else None
    variant_ready = True
    not_ready_reasons: list[str] = []

    if uses_demographics:
        warnings.append(
            f"Demographic feature coverage for {variant} on {target_cycle}: {demographic_used}/{len(rows)} seats."
        )
        if demographic_missing:
            warnings.append(
                f"{demographic_missing} seats are missing cycle-appropriate demographic rows for {variant}."
            )
        if demographic_coverage is not None and demographic_coverage < 0.75:
            variant_ready = False
            not_ready_reasons.append(
                f"Demographic coverage is too incomplete for credible enrichment testing ({demographic_used}/{len(rows)} seats)."
            )

    if uses_local:
        warnings.append(
            f"Local government feature coverage for {variant} on {target_cycle}: {local_used}/{len(rows)} seats."
        )
        warnings.append(
            f"Local data inventory currently includes {local_coverage_meta['mapped_constituencies']} mapped constituencies, {local_coverage_meta['authority_count']} authorities, and {local_coverage_meta['result_row_count']} council result rows."
        )
        if local_coverage is not None and local_coverage < LOCAL_VARIANT_MIN_COVERAGE:
            variant_ready = False
            not_ready_reasons.append(
                f"Local-government coverage is too sparse for national backtesting ({local_used}/{len(rows)} seats; minimum {int(LOCAL_VARIANT_MIN_COVERAGE * 100)}% coverage required)."
            )

    warnings.extend(_validate_vulnerability_rows(rows))

    summary = {
        "model_key": "vulnerability",
        "variant": variant,
        "target_cycle": target_cycle,
        "baseline_cycle": baseline_cycle,
        "previous_cycle": previous_cycle,
        "baseline_election_type": cycle_spec["baseline_type"],
        "row_count": len(rows),
        "baseline_conservative_seat_count": len(baseline_conservative_seats),
        "previous_overlap_count": previous_overlap,
        "previous_missing_count": previous_missing,
        "target_missing_count": target_missing,
        "variant_ready": variant_ready,
        "not_ready_reasons": not_ready_reasons,
        "uses_demographics": uses_demographics,
        "uses_local": uses_local,
        "demographic_feature_coverage": demographic_coverage,
        "local_feature_coverage": local_coverage,
        "demographic_source_year": DEMOGRAPHIC_TARGET_YEARS.get(target_cycle) if uses_demographics else None,
        "local_data_inventory": local_coverage_meta if uses_local else None,
        "warnings": warnings,
        "feature_columns": get_variant_feature_columns(variant),
        "outcome_columns": [
            "target_seat_held_by_conservative",
            "target_conservative_vote_share_change_pct",
            "target_majority_change_pct",
            "observed_loss",
        ],
    }

    if write_artifacts:
        feature_dir = _ensure_feature_dir()
        csv_path = _feature_csv_path(target_cycle, variant)
        json_path = _feature_summary_path(target_cycle, variant)
        with csv_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
        json_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        summary["artifact_csv_path"] = str(csv_path)
        summary["artifact_summary_path"] = str(json_path)

    return {"summary": summary, "rows": rows}


def load_vulnerability_feature_dataset(
    target_cycle: int,
    variant: str = "baseline",
    require_artifact: bool = False,
) -> dict[str, Any]:
    csv_path = _feature_csv_path(target_cycle, variant)
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
                        else int(value)
                        if key in {"target_cycle", "baseline_cycle", "previous_cycle", "demographic_source_year"}
                        else float(value)
                        if key.endswith("_pct") or key.endswith("_flag")
                        else value
                    )
                    for key, value in row.items()
                }
            )
        return {"summary": json.loads(_feature_summary_path(target_cycle, variant).read_text(encoding="utf-8")), "rows": parsed_rows}
    return build_vulnerability_feature_dataset(target_cycle, variant=variant, write_artifacts=False)


def load_backtest_dataset(
    model_key: str,
    target_cycle: int,
    dry_run: bool = False,
    variant: str = "baseline",
) -> Mapping[str, object]:
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

    feature_dataset = build_vulnerability_feature_dataset(target_cycle, variant=variant, write_artifacts=True)
    rows = feature_dataset["rows"]
    summary = feature_dataset["summary"]
    labels = [bool(row["observed_loss"]) for row in rows]
    warnings = list(plan.leakage_warnings) + list(summary["warnings"])

    execution_status = "completed" if summary["variant_ready"] else "not_ready"
    if not summary["variant_ready"]:
        warnings.extend(summary["not_ready_reasons"])

    return {
        "plan": plan,
        "variant": variant,
        "rows": rows,
        "labels": labels,
        "feature_matrix": [
            {column: row.get(column) for column in get_variant_feature_columns(variant)}
            for row in rows
        ],
        "signal_inventory": {
            key: PYTHON_SIGNAL_INVENTORY[key]
            for key in MODEL_BACKTEST_SPECS[model_key]["signal_keys"]
        },
        "execution_status": execution_status,
        "warnings": warnings,
        "feature_summary": summary,
    }
