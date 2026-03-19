"""
Lib Dem Threat Index — seats where Lib Dems pose the greatest threat to Conservatives.

Score components:
  25% — LD 2024 vote share (direct signal of current LD strength)
  25% — LD vote share trend 2019→2024 (momentum signal; uses notional 2019 baseline)
  25% — Con majority over LD (inverted — smaller margin = higher threat)
  15% — Graduate population % (LDs strongest in high-graduate areas)
  10% — Owner occupancy % (LD southern heartland proxy)

Scores only Conservative-held seats (117 after 4 Reform defections excluded).
Top 50 written to libdem_threat_index table.

DDL: Run docs/threat_indexes_ddl.sql in Supabase SQL Editor first.

Usage:
  python scripts/calculate_libdem_threat.py
"""

import json
import os
import sys
import uuid
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"
ANON_KEY = "sb_publishable_A7AT-20ghVjk_BNk8ZnH0A_vKJKIxh-"

CON_ID = "a4f20caf-ba89-4fb0-9ae3-313a7f937719"

# LD party ID — fetched at runtime if not found
LD_SHORT_NAMES = {"ld", "lib dem", "liberal democrat", "liberal democrats"}

REFORM_DEFECTED_CONSTITUENCIES = {
    "East Wiltshire", "Newark", "Romford", "Fareham and Waterlooville"
}

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


def clamp(v, lo=0.0, hi=10.0):
    return max(lo, min(hi, v))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 65)
    print("LIB DEM THREAT INDEX")
    print("=" * 65)

    # Check table exists
    try:
        fetch_all("libdem_threat_index", "id", {"limit": "1"})
    except RuntimeError as err:
        print("ERROR: libdem_threat_index table not found.")
        print("Run docs/threat_indexes_ddl.sql in Supabase SQL Editor first.")
        sys.exit(1)

    # Latest GE (2024) — fetched first so we can probe results for party ID confirmation
    elections = fetch_all(
        "elections", "id,election_date,election_type",
        {"election_type": "eq.general", "order": "election_date.desc", "limit": "1"},
    )
    if not elections:
        print("ERROR: No general elections found.")
        sys.exit(1)
    ge2024_id = elections[0]["id"]

    # Find LD party ID — probe GE2024 results to pick the ID actually used
    parties = fetch_all("parties", "id,name,short_name")
    ld_candidates = []
    for p in parties:
        sn = (p.get("short_name") or "").lower()
        nm = (p.get("name") or "").lower()
        if sn in LD_SHORT_NAMES or nm in LD_SHORT_NAMES or "liberal democrat" in nm:
            ld_candidates.append(p)

    ld_id = None
    for candidate in ld_candidates:
        probe = fetch_all(
            "results", "id",
            {"election_id": f"eq.{ge2024_id}", "party_id": f"eq.{candidate['id']}", "limit": "1"},
        )
        if probe:
            ld_id = candidate["id"]
            print(f"  LD party ID: {ld_id} ({candidate.get('name')}) [confirmed in results]")
            break

    if not ld_id:
        print("ERROR: Liberal Democrat party not found in GE2024 results.")
        print(f"  Candidates checked: {[p['name'] for p in ld_candidates]}")
        sys.exit(1)

    # Notional 2019 (for trend)
    notional_elections = fetch_all(
        "elections", "id,election_date,election_type",
        {"election_type": "eq.notional", "order": "election_date.desc"},
    )
    notional2019_id = next(
        (e["id"] for e in notional_elections if (e.get("election_date") or "")[:4] == "2019"),
        None,
    )
    print(f"\n  GE2024 ID: {ge2024_id}")
    print(f"  Notional 2019 ID: {notional2019_id or 'not found'}")

    # Con-held seats
    con_winners = fetch_all(
        "results", "constituency_id,majority,electorate",
        {"election_id": f"eq.{ge2024_id}", "is_winner": "eq.true", "party_id": f"eq.{CON_ID}"},
    )

    # Load constituency names to filter Reform defections
    all_cons = fetch_all("constituencies", "id,name")
    name_by_id = {c["id"]: c.get("name", "") for c in all_cons}

    con_winners = [
        w for w in con_winners
        if name_by_id.get(w["constituency_id"], "") not in REFORM_DEFECTED_CONSTITUENCIES
    ]
    con_cids = {w["constituency_id"] for w in con_winners}
    print(f"\n  {len(con_cids)} Conservative seats (after defection exclusions)")

    # LD 2024 vote shares across all Con seats
    ld_2024 = fetch_all(
        "results", "constituency_id,vote_share",
        {"election_id": f"eq.{ge2024_id}", "party_id": f"eq.{ld_id}"},
    )
    ld_2024_map = {r["constituency_id"]: float(r.get("vote_share") or 0) * 100 for r in ld_2024}
    print(f"  {len(ld_2024_map)} LD 2024 results")

    # LD 2019 notional vote shares (for trend)
    ld_2019_map = {}
    if notional2019_id:
        ld_2019 = fetch_all(
            "results", "constituency_id,vote_share",
            {"election_id": f"eq.{notional2019_id}", "party_id": f"eq.{ld_id}"},
        )
        ld_2019_map = {r["constituency_id"]: float(r.get("vote_share") or 0) * 100 for r in ld_2019}
        print(f"  {len(ld_2019_map)} LD 2019 notional results")

    # Demographics
    demo_map = {}
    demo_rows = fetch_all("demographics", "constituency_id,pct_degree_qualified,pct_owner_occupied", {"census_year": "eq.2021"})
    for d in demo_rows:
        demo_map[d["constituency_id"]] = {
            "grad": float(d.get("pct_degree_qualified") or 28),
            "owner": float(d.get("pct_owner_occupied") or 63),
        }

    # Score all Con seats
    print("\n--- Scoring Conservative seats ---")
    scored = []

    for winner in con_winners:
        cid = winner["constituency_id"]
        majority = winner.get("majority") or 0
        electorate = winner.get("electorate") or 1

        ld_share_2024 = ld_2024_map.get(cid, 0)
        ld_share_2019 = ld_2019_map.get(cid, 0)
        ld_trend = ld_share_2024 - ld_share_2019  # pp swing 2019→2024

        # Con majority over LD (as % of electorate)
        con_majority_pct = (majority / electorate) * 100

        demo = demo_map.get(cid, {"grad": 28, "owner": 63})
        grad_pct = demo["grad"]
        owner_pct = demo["owner"]

        # Component scores (0–10 each)
        # LD 2024 share: 40% LD = 10
        comp_ld_share = clamp(ld_share_2024 / 4.0)

        # LD trend: +20pp swing = 10; -10pp = 0
        comp_ld_trend = clamp((ld_trend + 10.0) / 3.0)

        # Con majority over LD: 0% majority = 10, 20% = 0
        comp_majority = clamp(10.0 - con_majority_pct / 2.0)

        # Graduate %: 50% grads = 10, national avg ~28% = 3.7
        comp_grad = clamp((grad_pct - 15.0) / 3.5)

        # Owner occupancy: 80%+ = 10, 50% = 0
        comp_owner = clamp((owner_pct - 50.0) / 3.0)

        threat_score = round(
            0.25 * comp_ld_share +
            0.25 * comp_ld_trend +
            0.25 * comp_majority +
            0.15 * comp_grad +
            0.10 * comp_owner,
            2,
        )

        scored.append({
            "constituency_id": cid,
            "threat_score": threat_score,
            "ld_2024_share": round(ld_share_2024, 2),
            "ld_share_trend": round(ld_trend, 3),
            "con_ld_majority": round(con_majority_pct, 2),
            "graduate_pct": round(grad_pct, 2),
            "owner_occupancy_pct": round(owner_pct, 2),
        })

    scored.sort(key=lambda s: s["threat_score"], reverse=True)
    top_50 = scored[:50]
    print(f"  Scored {len(scored)} seats; writing top {len(top_50)}")

    # Show top 10
    top_cids = [s["constituency_id"] for s in top_50[:10]]
    id_list = "(" + ",".join(top_cids) + ")"
    name_rows = fetch_all("constituencies", "id,name", {"id": f"in.{id_list}"})
    name_map = {n["id"]: n.get("name", "?") for n in name_rows}

    print("\n  Top 10 Lib Dem threat seats:")
    for i, s in enumerate(top_50[:10], 1):
        print(f"    #{i:>2}  {s['threat_score']:.2f}  {name_map.get(s['constituency_id'], '?')}  "
              f"LD:{s['ld_2024_share']:.1f}%  Trend:{s['ld_share_trend']:+.1f}pp  "
              f"Majority:{s['con_ld_majority']:.1f}%")

    # Upsert
    print(f"\n--- Upserting {len(top_50)} records ---")
    try:
        _req("DELETE", "libdem_threat_index", SERVICE_KEY, params={"id": "not.is.null"})
    except RuntimeError:
        pass

    rows = []
    for rank, s in enumerate(top_50, 1):
        rows.append({
            "id": str(uuid.uuid4()),
            "constituency_id": s["constituency_id"],
            "threat_score": s["threat_score"],
            "threat_rank": rank,
            "ld_2024_share": s["ld_2024_share"],
            "ld_share_trend": s["ld_share_trend"],
            "con_ld_majority": s["con_ld_majority"],
            "graduate_pct": s["graduate_pct"],
            "owner_occupancy_pct": s["owner_occupancy_pct"],
        })

    _req("POST", "libdem_threat_index", SERVICE_KEY, body=rows, prefer="return=minimal")
    print(f"  Inserted {len(rows)}/50")

    print("\n" + "=" * 65)
    print("DONE — Lib Dem threat index complete")
    print("=" * 65)


if __name__ == "__main__":
    main()
