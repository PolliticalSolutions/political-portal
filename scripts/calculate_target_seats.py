"""
Task 12 — Conservative Target Seat Ranker

Ranks seats currently held by non-Conservative parties by Conservative
recovery potential for the next general election (expected 2029).

Algorithm:
  1. Load 2024 general election results — all winners
  2. Exclude current Conservative seats (defence, not targets)
  3. For remaining seats (Lab, LD, SNP, etc.):
     - swing_required = majority / (2 * electorate) * 100 (standard swing formula)
     - reform_squeeze_risk: if Reform got >15% → reduces Con recovery (score 0-10)
     - demographic_alignment: leave_vote_share + owner_occupancy signal
     - target_score = 0.40*(10-swing_required/2) + 0.30*(10-reform_squeeze_risk) + 0.30*demographic_alignment
  4. Rank descending by target_score; top 150 only
  5. Top 50: "Top Target", 51-100: "Key Target", 101-150: "Longer Shot"

Default scope: England and Wales only. Scottish and NI Conservative dynamics
are fundamentally different and dilute the England-focused analysis.
Use --include-all to score all 529 non-Conservative UK seats.

DDL: Run docs/target_seats_ddl.sql in Supabase SQL Editor first.

Usage:
  python scripts/calculate_target_seats.py              # England & Wales only
  python scripts/calculate_target_seats.py --include-all  # All UK seats
"""

import json
import os
import sys
import uuid
import urllib.error
import urllib.parse
import urllib.request

INCLUDE_ALL = "--include-all" in sys.argv
ENGLAND_WALES_REGIONS = {
    "East Midlands", "East of England", "London", "North East", "North West",
    "South East", "South West", "West Midlands", "Yorkshire and The Humber",
    "Wales",
}

SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"
ANON_KEY = "sb_publishable_A7AT-20ghVjk_BNk8ZnH0A_vKJKIxh-"

CON_ID = "a4f20caf-ba89-4fb0-9ae3-313a7f937719"
RUK_ID = "a2b82e7c-5f8d-425d-a1b2-36db57c7268e"

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
    print("ERROR: SUPABASE_SERVICE_KEY not found.")
    sys.exit(1)

DDL_MESSAGE = """
==========================================================
TARGET SEATS TABLE DOES NOT EXIST.

Please run the following DDL in the Supabase SQL Editor:

  docs/target_seats_ddl.sql

Then re-run this script.
==========================================================
"""


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


def classify_target(rank):
    if rank <= 50:
        return "Top Target"
    if rank <= 100:
        return "Key Target"
    return "Longer Shot"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 65)
    print("TASK 12 — CONSERVATIVE TARGET SEAT RANKER")
    print("=" * 65)

    # Check if target_seats table exists
    try:
        fetch_all("target_seats", "id", {"limit": "1"})
        print("  target_seats table exists.")
    except RuntimeError as err:
        print(DDL_MESSAGE)
        print(f"Original error: {err}")
        sys.exit(1)

    # Get latest GE
    elections = fetch_all(
        "elections", "id,election_date",
        {"election_type": "eq.general", "order": "election_date.desc", "limit": "1"},
    )
    if not elections:
        print("ERROR: No general elections found in database.")
        sys.exit(1)
    latest_id = elections[0]["id"]
    print(f"\n  Latest election ID: {latest_id}")

    # Get ALL 2024 winners
    print("\n--- Loading all 2024 winners ---")
    all_winners = fetch_all(
        "results",
        "constituency_id,party_id,majority,electorate,vote_share,candidate_id",
        {"election_id": f"eq.{latest_id}", "is_winner": "eq.true"},
    )
    print(f"  {len(all_winners)} total winners")

    # Build Conservative winner set (these are defence, not targets)
    con_held_ids = {w["constituency_id"] for w in all_winners if w["party_id"] == CON_ID}
    print(f"  {len(con_held_ids)} Conservative seats (excluded from target list)")

    # Non-Conservative winners are the target universe
    non_con_winners_all = [w for w in all_winners if w["party_id"] != CON_ID]

    # Load constituency regions so we can filter to England & Wales
    all_con_ids = [w["constituency_id"] for w in non_con_winners_all]
    region_rows = fetch_all("constituencies", "id,region")
    region_map = {r["id"]: (r.get("region") or "") for r in region_rows}

    if INCLUDE_ALL:
        non_con_winners = non_con_winners_all
        print(f"  {len(non_con_winners)} non-Conservative seats = target universe (all UK)")
    else:
        non_con_winners = [
            w for w in non_con_winners_all
            if region_map.get(w["constituency_id"], "") in ENGLAND_WALES_REGIONS
        ]
        excluded = len(non_con_winners_all) - len(non_con_winners)
        print(f"  {len(non_con_winners)} non-Conservative seats = target universe (England & Wales)")
        print(f"  {excluded} Scottish/NI seats excluded (use --include-all to include)")

    # Get Conservative 2024 vote shares in all constituencies
    print("\n--- Loading Conservative 2024 vote shares ---")
    con_results = fetch_all(
        "results",
        "constituency_id,vote_share",
        {"election_id": f"eq.{latest_id}", "party_id": f"eq.{CON_ID}"},
    )
    con_share_map = {r["constituency_id"]: float(r["vote_share"] or 0) * 100 for r in con_results}

    # Get Reform 2024 vote shares in all constituencies
    print("\n--- Loading Reform 2024 vote shares ---")
    ruk_results = fetch_all(
        "results",
        "constituency_id,vote_share",
        {"election_id": f"eq.{latest_id}", "party_id": f"eq.{RUK_ID}"},
    )
    ruk_share_map = {r["constituency_id"]: float(r["vote_share"] or 0) * 100 for r in ruk_results}

    # Get demographics
    print("\n--- Loading demographics ---")
    demo_map = {
        d["constituency_id"]: {
            "owner_pct": float(d.get("pct_owner_occupied") or 65),
        }
        for d in fetch_all("demographics", "constituency_id,pct_owner_occupied", {"census_year": "eq.2021"})
    }

    # Get leave vote shares
    print("\n--- Loading Leave vote shares ---")
    leave_map = {
        c["id"]: float(c["leave_vote_share"])
        for c in fetch_all("constituencies", "id,leave_vote_share", {"leave_vote_share": "not.is.null"})
        if c.get("leave_vote_share")
    }

    # Get party names for current holder labelling
    print("\n--- Loading party names ---")
    parties = fetch_all("parties", "id,name,short_name")
    party_name_map = {p["id"]: p.get("short_name") or p.get("name") or "?" for p in parties}

    # Score all target seats
    print("\n--- Scoring target seats ---")
    scored = []
    for winner in non_con_winners:
        cid = winner["constituency_id"]
        majority = winner.get("majority")
        electorate = winner.get("electorate")
        party_id = winner.get("party_id")

        if not majority or not electorate:
            continue

        # Swing required: standard formula
        swing_required = (majority / (2 * electorate)) * 100  # %

        # Conservative 2024 vote share in this seat
        con_2024_share = con_share_map.get(cid, 0)

        # Reform squeeze risk: higher Reform share → harder for Con to recover
        ruk_pct = ruk_share_map.get(cid, 0)
        reform_squeeze_risk = min(10.0, ruk_pct * 0.4)  # 25% RUK → 10

        # Demographic alignment: leave vote share + owner occupancy
        leave_pct = leave_map.get(cid)
        demo = demo_map.get(cid, {})
        owner_pct = demo.get("owner_pct", 65)

        if leave_pct is not None:
            leave_factor = min(10.0, max(0.0, (leave_pct - 30.0) / 4.0))
        else:
            leave_factor = 4.0

        # Owner-occupancy: higher = more traditionally Con
        owner_factor = min(10.0, max(0.0, (owner_pct - 45.0) / 3.0))

        demographic_alignment = 0.6 * leave_factor + 0.4 * owner_factor

        # Target score (0-10)
        swing_component = max(0.0, min(10.0, 10.0 - swing_required / 2.0))
        squeeze_component = max(0.0, 10.0 - reform_squeeze_risk)

        target_score = round(
            0.40 * swing_component +
            0.30 * squeeze_component +
            0.30 * demographic_alignment,
            2,
        )

        # Demographic profile label
        if leave_pct is not None and leave_pct >= 55 and owner_pct >= 65:
            demo_profile = "Brexit-owning"
        elif leave_pct is not None and leave_pct >= 55:
            demo_profile = "High Leave"
        elif owner_pct >= 70:
            demo_profile = "High ownership"
        else:
            demo_profile = "Mixed"

        scored.append({
            "constituency_id": cid,
            "target_score": target_score,
            "swing_required": round(swing_required, 2),
            "current_holder": party_name_map.get(party_id, "?"),
            "current_majority": majority,
            "con_2024_share": round(con_2024_share, 2),
            "reform_squeeze_risk": round(reform_squeeze_risk, 2),
            "demographic_profile": demo_profile,
        })

    # Sort and take top 150
    scored.sort(key=lambda s: s["target_score"], reverse=True)
    top_150 = scored[:150]
    print(f"  Scored {len(scored)} seats; taking top {len(top_150)}")

    # Build rows for upsert
    rows = []
    for rank, s in enumerate(top_150, 1):
        rows.append({
            "id": str(uuid.uuid4()),
            "constituency_id": s["constituency_id"],
            "target_rank": rank,
            "target_score": s["target_score"],
            "swing_required": s["swing_required"],
            "current_holder": s["current_holder"],
            "current_majority": s["current_majority"],
            "con_2024_share": s["con_2024_share"],
            "reform_squeeze_risk": s["reform_squeeze_risk"],
            "demographic_profile": s["demographic_profile"],
            "target_classification": classify_target(rank),
        })

    # Upsert
    print(f"\n--- Upserting {len(rows)} target seats ---")
    try:
        _req("DELETE", "target_seats", SERVICE_KEY, params={"id": "not.is.null"})
    except RuntimeError:
        pass

    for i in range(0, len(rows), 500):
        batch = rows[i:i + 500]
        _req("POST", "target_seats", SERVICE_KEY, body=batch, prefer="return=minimal")
        print(f"  Inserted {min(i + 500, len(rows))}/{len(rows)}")

    # Summary
    top_targets = [r for r in rows if r["target_classification"] == "Top Target"]
    key_targets = [r for r in rows if r["target_classification"] == "Key Target"]
    longer_shots = [r for r in rows if r["target_classification"] == "Longer Shot"]

    print(f"\n  Top Targets (1-50):  {len(top_targets)}")
    print(f"  Key Targets (51-100): {len(key_targets)}")
    print(f"  Longer Shots (101-150): {len(longer_shots)}")

    # Show top 20 (need constituency names)
    top_cids = [r["constituency_id"] for r in rows[:20]]
    id_list = "(" + ",".join(top_cids) + ")"
    name_rows = fetch_all("constituencies", "id,name,region", {"id": f"in.{id_list}"})
    name_map = {n["id"]: n for n in name_rows}

    print("\n--- Top 20 Conservative target seats ---")
    for r in rows[:20]:
        con_info = name_map.get(r["constituency_id"], {})
        con_name = con_info.get("name", "?")
        region = con_info.get("region", "?")
        print(
            f"  #{r['target_rank']:>3}  {r['target_score']:.2f}  {con_name}  ({region})  "
            f"Holder: {r['current_holder']}  Swing: {r['swing_required']:.1f}%  "
            f"Reform risk: {r['reform_squeeze_risk']:.1f}  [{r['target_classification']}]"
        )

    print("\n" + "=" * 65)
    print(f"DONE — {len(rows)} target seat records written")
    print("=" * 65)


if __name__ == "__main__":
    main()
