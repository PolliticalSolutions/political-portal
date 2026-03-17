"""
Phase 1 — Swing data analysis.
Queries Supabase to assess data quality before any swing calculations.

Usage:
    python scripts/analyse_swing_data.py
"""

import os
import sys
import json
import urllib.request
import urllib.parse

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://pkpeevhmrjizvxkgvwhr.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_A7AT-20ghVjk_BNk8ZnH0A_vKJKIxh-")


def supabase_get(path, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
        "Prefer": "count=exact",
    })
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode()
        count = resp.headers.get("Content-Range", "")
        return json.loads(body), count


def fetch_all(table, select, filters=None, order=None, page_size=1000):
    """Paginate through all rows of a table."""
    results = []
    offset = 0
    while True:
        params = {"select": select, "limit": page_size, "offset": offset}
        if filters:
            params.update(filters)
        if order:
            params["order"] = order
        data, _ = supabase_get(table, params)
        results.extend(data)
        if len(data) < page_size:
            break
        offset += page_size
    return results


def main():
    print("=" * 60)
    print("PHASE 1 — SWING DATA ANALYSIS")
    print("=" * 60)

    # ----------------------------------------------------------------
    # 1. List all elections
    # ----------------------------------------------------------------
    print("\n--- All elections in database ---")
    elections, _ = supabase_get("elections", {
        "select": "id,name,election_date,election_type",
        "order": "election_date.asc",
    })
    for e in elections:
        print(f"  {e['election_date']}  id={e['id']}  type={e['election_type']}  name={e['name']}")

    # Find 2024 and 2019 elections
    election_2024 = next((e for e in elections if "2024" in (e["election_date"] or "")), None)
    election_2019 = next((e for e in elections if "2019" in (e["election_date"] or "") and (e.get("election_type") or "").lower() != "notional"), None)

    if not election_2024:
        print("\nERROR: No 2024 election found.")
        sys.exit(1)
    if not election_2019:
        print("\nWARNING: No 2019 election found — Phase 4 notional data may be needed.")

    print(f"\n2024 election id: {election_2024['id']}")
    if election_2019:
        print(f"2019 election id: {election_2019['id']}")

    # ----------------------------------------------------------------
    # 2. Check vote_share population in 2024 and 2019
    # ----------------------------------------------------------------
    print("\n--- vote_share coverage ---")
    for label, elec in [("2024", election_2024), ("2019", election_2019)]:
        if not elec:
            print(f"  {label}: election not found — skipping")
            continue

        all_rows, cr = supabase_get("results", {
            "select": "id,vote_share",
            "election_id": f"eq.{elec['id']}",
            "limit": 1,
        })
        total_data, cr_total = supabase_get("results", {
            "select": "id",
            "election_id": f"eq.{elec['id']}",
            "limit": 1,
        })
        # Get actual counts via pagination
        all_results = fetch_all("results", "id,vote_share,constituency_id", {"election_id": f"eq.{elec['id']}"})
        with_share = [r for r in all_results if r.get("vote_share") is not None]
        print(f"  {label}: {len(all_results)} total result rows, {len(with_share)} with vote_share populated")

    # ----------------------------------------------------------------
    # 3. Constituencies with results in BOTH 2024 and 2019 (by ons_code)
    # ----------------------------------------------------------------
    print("\n--- Constituency overlap: 2024 vs 2019 ---")
    if election_2019:
        results_2024 = fetch_all("results", "constituency_id,vote_share", {"election_id": f"eq.{election_2024['id']}"})
        results_2019 = fetch_all("results", "constituency_id,vote_share", {"election_id": f"eq.{election_2019['id']}"})

        ids_2024 = {r["constituency_id"] for r in results_2024}
        ids_2019 = {r["constituency_id"] for r in results_2019}
        overlap = ids_2024 & ids_2019
        print(f"  2024: {len(ids_2024)} constituency IDs")
        print(f"  2019: {len(ids_2019)} constituency IDs")
        print(f"  Overlap (same constituency_id in both): {len(overlap)}")
    else:
        print("  Cannot check — 2019 election not found")

    # ----------------------------------------------------------------
    # 4. Top parties by seats in 2024
    # ----------------------------------------------------------------
    print("\n--- Top parties by seats won in 2024 ---")
    winners_2024 = fetch_all("results", "party_id,parties(id,name,short_name)", {
        "election_id": f"eq.{election_2024['id']}",
        "is_winner": "eq.true",
    })

    seat_counts = {}
    party_names = {}
    for r in winners_2024:
        pid = r["party_id"]
        party_info = r.get("parties") or {}
        seat_counts[pid] = seat_counts.get(pid, 0) + 1
        party_names[pid] = party_info.get("short_name") or party_info.get("name") or str(pid)

    ranked = sorted(seat_counts.items(), key=lambda x: x[1], reverse=True)
    print(f"  {'Party':<20} {'Seats':>6}  {'ID'}")
    print(f"  {'-'*20} {'------':>6}  {'--'}")
    for pid, seats in ranked[:10]:
        print(f"  {party_names.get(pid, str(pid)):<20} {seats:>6}  {pid}")

    top5_ids = [pid for pid, _ in ranked[:5]]
    print(f"\n  Top 5 party IDs for swing calculations: {top5_ids}")

    # ----------------------------------------------------------------
    # 5. Check swings table
    # ----------------------------------------------------------------
    print("\n--- Swings table ---")
    swings_sample, _ = supabase_get("swings", {"select": "id", "limit": 1})
    all_swings = fetch_all("swings", "id")
    print(f"  Rows in swings table: {len(all_swings)}")

    # ----------------------------------------------------------------
    # 6. Sample a 2024 result to confirm column names
    # ----------------------------------------------------------------
    print("\n--- Sample 2024 result row (column structure) ---")
    sample, _ = supabase_get("results", {
        "select": "id,constituency_id,party_id,election_id,votes,vote_share,votes_change,vote_share_change,is_winner,majority,turnout",
        "election_id": f"eq.{election_2024['id']}",
        "limit": 1,
    })
    if sample:
        for k, v in sample[0].items():
            print(f"  {k}: {v}")

    print("\n" + "=" * 60)
    print("PHASE 1 COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
