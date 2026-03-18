"""
Task 6 — Reform Threat Historical Proxy Backtest (2015 → 2019)

Tests whether a 2015-based 'proto-reform score' predicts the actual
Conservative vote share decline in 2019.

Features:
  - ukip_2015_pct: from historical_party_signals (signal_type=ukip_2015_vote_share)
  - leave_pct: from constituencies.leave_vote_share
  - con_majority_2015_pct: from 2015 election results

Proto-reform score:
  0.40 * (ukip_2015_pct / 5) + 0.40 * (leave_pct / 6) + 0.20 * (10 - con_majority_2015_pct * 0.5)
  — all components clamped 0-10

Target: 2019 Conservative vote share change (decline) per constituency.

Outputs: artifacts/backtests/reform_proxy_2015_2019.json

Usage:
  python scripts/backtest_reform_proxy.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"
ANON_KEY = "sb_publishable_A7AT-20ghVjk_BNk8ZnH0A_vKJKIxh-"

CON_ID = "a4f20caf-ba89-4fb0-9ae3-313a7f937719"

SERVICE_KEY = None
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
if os.path.exists(env_path):
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            if line.strip().startswith("SUPABASE_SERVICE_KEY="):
                SERVICE_KEY = line.strip().split("=", 1)[1]
                break
if not SERVICE_KEY:
    SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
if not SERVICE_KEY:
    print("WARNING: SUPABASE_SERVICE_KEY not found — using anon key for reads.")
    SERVICE_KEY = ANON_KEY


def _req(method, path, key, body=None, params=None, prefer=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            text = r.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} {method} {path}: {e.read().decode()}") from e


def fetch_all(table, select, filters=None, key=None):
    k = key or ANON_KEY
    results, offset = [], 0
    while True:
        params = {"select": select, "limit": 1000, "offset": offset}
        if filters:
            params.update(filters)
        data = _req("GET", table, k, params=params)
        results.extend(data or [])
        if len(data or []) < 1000:
            break
        offset += 1000
    return results


def spearman_correlation(x_list: list[float], y_list: list[float]) -> float:
    """Compute Spearman rank correlation without scipy."""
    n = len(x_list)
    if n < 3:
        return 0.0

    def rank_list(lst):
        sorted_indices = sorted(range(n), key=lambda i: lst[i])
        ranks = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j < n - 1 and lst[sorted_indices[j]] == lst[sorted_indices[j + 1]]:
                j += 1
            avg_rank = (i + j) / 2.0 + 1
            for k in range(i, j + 1):
                ranks[sorted_indices[k]] = avg_rank
            i = j + 1
        return ranks

    rx = rank_list(x_list)
    ry = rank_list(y_list)

    d2_sum = sum((rx[i] - ry[i]) ** 2 for i in range(n))
    return 1.0 - (6.0 * d2_sum) / (n * (n ** 2 - 1))


def _clamp(v: float, lo: float = 0.0, hi: float = 10.0) -> float:
    return max(lo, min(hi, v))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 65)
    print("TASK 6 — REFORM PROXY BACKTEST (2015 → 2019)")
    print("=" * 65)

    # Get election IDs for 2015 and 2019
    # We need: 2015 real GE (uses 2015 boundaries) + 2019 notional (uses 2024 boundaries).
    # The real 2019 GE results are not stored in the DB, so we always use notional for 2019.
    # Because the two elections use different boundary sets, we match by constituency name.
    elections = fetch_all("elections", "id,election_date,election_type,name")
    id_2015 = None
    id_2019_notional = None
    id_2019_real = None
    for e in elections:
        year = (e.get("election_date") or "")[:4]
        etype = e.get("election_type", "")
        if year == "2015" and etype == "general":
            id_2015 = e["id"]
        elif year == "2019" and etype == "notional":
            id_2019_notional = e["id"]
        elif year == "2019" and etype == "general":
            id_2019_real = e["id"]

    if not id_2015:
        print("ERROR: 2015 general election not found in database.")
        sys.exit(1)

    # Prefer notional 2019 (has results); fall back to real if somehow present
    id_2019 = id_2019_notional or id_2019_real
    if not id_2019:
        print("ERROR: 2019 election not found in database.")
        sys.exit(1)

    using_notional_2019 = id_2019 == id_2019_notional
    print(f"\n  2015 election ID: {id_2015}")
    print(f"  2019 election ID: {id_2019} ({'notional' if using_notional_2019 else 'real'})")

    # Load constituency name lookup
    print("\n--- Loading constituency names ---")
    all_constituencies = fetch_all("constituencies", "id,name")
    name_by_id = {c["id"]: (c.get("name") or "").strip() for c in all_constituencies}

    def _norm_name(n: str) -> str:
        """Lowercase and strip punctuation for fuzzy name matching across boundary sets."""
        return n.lower().replace(",", "").replace("'", "").replace("-", " ").strip()

    # Load 2015 Conservative results (by constituency_id, boundary-matched)
    print("\n--- Loading 2015 Conservative results ---")
    con_2015 = fetch_all(
        "results",
        "constituency_id,vote_share,majority,electorate,is_winner",
        {"election_id": f"eq.{id_2015}", "party_id": f"eq.{CON_ID}"},
    )
    # Build name-keyed map for 2015
    con_2015_map_by_name = {}
    for r in con_2015:
        raw_name = name_by_id.get(r["constituency_id"], "")
        if raw_name:
            con_2015_map_by_name[_norm_name(raw_name)] = {**r, "_name": raw_name}
    # Also keep id-keyed map for leave/UKIP lookups
    con_2015_map = {r["constituency_id"]: r for r in con_2015}
    print(f"  {len(con_2015_map_by_name)} Conservative candidates found in 2015")

    # Load 2019 Conservative results (may use different boundary constituency_ids)
    print("\n--- Loading 2019 Conservative results ---")
    con_2019 = fetch_all(
        "results",
        "constituency_id,vote_share",
        {"election_id": f"eq.{id_2019}", "party_id": f"eq.{CON_ID}"},
    )
    con_2019_map_by_name = {}
    for r in con_2019:
        raw_name = name_by_id.get(r["constituency_id"], "")
        if raw_name:
            con_2019_map_by_name[_norm_name(raw_name)] = {**r, "_name": raw_name}
    print(f"  {len(con_2019_map_by_name)} Conservative candidates found in 2019")

    # Leave vote share
    print("\n--- Loading Leave vote shares ---")
    leave_data = fetch_all("constituencies", "id,leave_vote_share", {"leave_vote_share": "not.is.null"})
    leave_map = {c["id"]: float(c["leave_vote_share"]) for c in leave_data if c.get("leave_vote_share")}
    print(f"  {len(leave_map)} constituencies with Leave data")

    # UKIP 2015 signals
    print("\n--- Loading UKIP 2015 signals ---")
    ukip_data = []
    try:
        ukip_data = fetch_all("historical_party_signals", "constituency_id,signal_value",
                              {"signal_name": "eq.ukip_2015_vote_share"})
    except RuntimeError:
        print("  WARNING: historical_party_signals not found — UKIP signal unavailable")
    ukip_map = {r["constituency_id"]: float(r["signal_value"]) for r in ukip_data if r.get("signal_value")}
    print(f"  {len(ukip_map)} UKIP 2015 signal entries")

    # Build feature-target pairs (matched by normalised constituency name)
    print("\n--- Building feature-target pairs ---")
    results_list = []
    missing_leave = 0
    missing_2019 = 0

    for norm_name, r2015 in con_2015_map_by_name.items():
        cid = r2015["constituency_id"]

        # Match 2019 result by normalised name (handles boundary change renames)
        r2019 = con_2019_map_by_name.get(norm_name)
        if r2019 is None:
            missing_2019 += 1
            continue

        leave_pct = leave_map.get(cid)
        if leave_pct is None:
            # Try 2019 boundary constituency id
            leave_pct = leave_map.get(r2019["constituency_id"])
        if leave_pct is None:
            missing_leave += 1
            leave_pct = 46.0  # approximate national median

        # Con majority 2015 as % of electorate
        majority_2015 = r2015.get("majority") or 0
        electorate_2015 = r2015.get("electorate") or 1
        con_majority_2015_pct = (majority_2015 / electorate_2015) * 100 if r2015.get("is_winner") else 0

        # UKIP 2015 share (fallback 0)
        ukip_pct = ukip_map.get(cid, 0)

        # Proto-reform score components (each 0-10 before weighting)
        ukip_component = _clamp(ukip_pct / 5.0)           # 50% UKIP → 10
        leave_component = _clamp(leave_pct / 6.0)         # 60% Leave → 10
        majority_component = _clamp(10.0 - con_majority_2015_pct * 0.5)  # 20% majority → 0

        proto_score = round(
            0.40 * ukip_component +
            0.40 * leave_component +
            0.20 * majority_component,
            4,
        )

        # Target: Con vote share change (negative = decline)
        share_2015 = float(r2015.get("vote_share") or 0) * 100
        share_2019 = float(r2019.get("vote_share") or 0) * 100
        con_change_2019 = share_2019 - share_2015

        results_list.append({
            "constituency_id": cid,
            "ukip_2015_pct": round(ukip_pct, 2),
            "leave_pct": round(leave_pct, 2),
            "con_majority_2015_pct": round(con_majority_2015_pct, 2),
            "proto_reform_score": proto_score,
            "con_vote_share_2015": round(share_2015, 2),
            "con_vote_share_2019": round(share_2019, 2),
            "con_change_2019": round(con_change_2019, 2),
        })

    print(f"  Built {len(results_list)} seat pairs (missing 2019: {missing_2019}, leave fallback: {missing_leave})")

    if len(results_list) < 10:
        print("ERROR: Too few seats to calculate meaningful correlation.")
        sys.exit(1)

    # Calculate statistics
    proto_scores = [r["proto_reform_score"] for r in results_list]
    con_changes = [r["con_change_2019"] for r in results_list]

    spearman_corr = spearman_correlation(proto_scores, con_changes)
    # Note: positive score = more Reform-prone; negative change = Con decline
    # So we expect negative Spearman if higher proto_score → more Con decline
    print(f"\n  Spearman correlation (proto_score vs Con decline 2019): {spearman_corr:.4f}")

    median_change = sorted(con_changes)[len(con_changes) // 2]
    print(f"  Median Con vote share change 2019: {median_change:.2f}pp")

    # Top-decile capture
    n = len(proto_scores)
    top_decile_threshold = sorted(proto_scores, reverse=True)[max(0, n // 10 - 1)]
    top_decile_seats = [r for r in results_list if r["proto_reform_score"] >= top_decile_threshold]

    # Seats in top decile that saw Con decline worse than median
    top_decile_con_decline = [s for s in top_decile_seats if s["con_change_2019"] < median_change]
    top_decile_capture = len(top_decile_con_decline) / max(1, len(top_decile_seats))
    print(f"  Top-decile capture (% with worse-than-median Con decline): {top_decile_capture:.2%}")
    print(f"    Top-decile seats: {len(top_decile_seats)}, below median decline: {len(top_decile_con_decline)}")

    # Save artifacts
    output = {
        "methodology": (
            "Proto-reform score built from 2015-only features (UKIP share, Leave vote, Con majority). "
            "Target: Conservative vote share change between 2015 and 2019 general elections. "
            "Spearman rank correlation measures whether higher proto-reform scores co-vary with "
            "greater Conservative vote share decline (negative correlation = correct direction)."
        ),
        "sample_size": len(results_list),
        "spearman_correlation": round(spearman_corr, 6),
        "top_decile_capture": round(top_decile_capture, 6),
        "median_con_decline": round(median_change, 4),
        "top_decile_threshold": round(top_decile_threshold, 4),
        "results": results_list,
    }

    artifact_dir = Path("artifacts") / "backtests"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    output_path = artifact_dir / "reform_proxy_2015_2019.json"
    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"\n  Saved: {output_path}")

    print("\n" + "=" * 65)
    print(f"DONE — Reform proxy backtest complete")
    print(f"  Sample: {len(results_list)} seats")
    print(f"  Spearman correlation: {spearman_corr:.4f}")
    print(f"  Top-decile capture: {top_decile_capture:.2%}")
    print("=" * 65)


if __name__ == "__main__":
    main()
