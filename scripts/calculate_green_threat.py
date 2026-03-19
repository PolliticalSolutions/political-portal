"""
Green Threat Index — seats where Greens pose meaningful threat to Con or Lab incumbents.

Score components:
  30% — Green 2024 vote share (direct signal)
  25% — Green vote share trend 2019→2024 (momentum)
  20% — Incumbent majority over Green (inverted — smaller margin = higher threat)
  15% — Graduate population % (Greens strongest in graduate-heavy areas)
  10% — Urban density proxy (Greens tend to over-perform in urban seats)

Scores Conservative AND Labour-held seats (Green threat is not party-specific).
Top 30 written to green_threat_index table.

DDL: Run docs/threat_indexes_ddl.sql in Supabase SQL Editor first.

Usage:
  python scripts/calculate_green_threat.py
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

GREEN_SHORT_NAMES = {"green", "greens", "green party"}

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
    print("GREEN THREAT INDEX")
    print("=" * 65)

    # Check table exists
    try:
        fetch_all("green_threat_index", "id", {"limit": "1"})
    except RuntimeError as err:
        print("ERROR: green_threat_index table not found.")
        print("Run docs/threat_indexes_ddl.sql in Supabase SQL Editor first.")
        sys.exit(1)

    # Elections — fetched first so we can probe results for party ID confirmation
    elections = fetch_all(
        "elections", "id,election_date,election_type",
        {"election_type": "eq.general", "order": "election_date.desc", "limit": "1"},
    )
    if not elections:
        print("ERROR: No general elections found.")
        sys.exit(1)
    ge2024_id = elections[0]["id"]

    # Find Green party ID — probe GE2024 results to pick the ID actually used
    parties = fetch_all("parties", "id,name,short_name")
    party_name_map = {p["id"]: p.get("short_name") or p.get("name") or "?" for p in parties}
    green_candidates = []
    for p in parties:
        sn = (p.get("short_name") or "").lower()
        nm = (p.get("name") or "").lower()
        if sn in GREEN_SHORT_NAMES or nm in GREEN_SHORT_NAMES or "green party" in nm:
            green_candidates.append(p)

    green_id = None
    for candidate in sorted(green_candidates, key=lambda p: len(p.get("name") or ""), reverse=False):
        probe = fetch_all(
            "results", "id",
            {"election_id": f"eq.{ge2024_id}", "party_id": f"eq.{candidate['id']}", "limit": "1"},
        )
        if probe:
            # Prefer England/Wales Green over regional variants
            nm = (candidate.get("name") or "").lower()
            if "scottish" in nm or "wales" in nm or "northern ireland" in nm:
                continue
            green_id = candidate["id"]
            print(f"  Green party ID: {green_id} ({candidate.get('name')}) [confirmed in results]")
            break

    # Fallback: any Green with results
    if not green_id:
        for candidate in green_candidates:
            probe = fetch_all(
                "results", "id",
                {"election_id": f"eq.{ge2024_id}", "party_id": f"eq.{candidate['id']}", "limit": "1"},
            )
            if probe:
                green_id = candidate["id"]
                print(f"  Green party ID: {green_id} ({candidate.get('name')}) [fallback]")
                break

    if not green_id:
        print("ERROR: Green Party not found in GE2024 results.")
        sys.exit(1)

    # Find Lab party ID (for incumbent party labelling) — probe results to confirm
    lab_candidates = [
        p for p in parties
        if (p.get("short_name") or "").lower() in ("lab", "labour")
        or (p.get("name") or "").lower() == "labour"
    ]
    lab_id = None
    for candidate in lab_candidates:
        probe = fetch_all(
            "results", "id",
            {"election_id": f"eq.{ge2024_id}", "party_id": f"eq.{candidate['id']}", "is_winner": "eq.true", "limit": "1"},
        )
        if probe:
            lab_id = candidate["id"]
            break
    if not lab_id and lab_candidates:
        lab_id = lab_candidates[0]["id"]

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

    # All 2024 winners (Con + Lab seats = target for Green threat)
    all_winners = fetch_all(
        "results", "constituency_id,party_id,majority,electorate",
        {"election_id": f"eq.{ge2024_id}", "is_winner": "eq.true"},
    )
    # Include Con AND Lab held seats
    target_winners = [
        w for w in all_winners
        if w["party_id"] in (CON_ID, lab_id)
    ]
    print(f"\n  {len(target_winners)} Con+Lab seats in scope for Green threat")

    # Green 2024 vote shares
    green_2024 = fetch_all(
        "results", "constituency_id,vote_share",
        {"election_id": f"eq.{ge2024_id}", "party_id": f"eq.{green_id}"},
    )
    green_2024_map = {r["constituency_id"]: float(r.get("vote_share") or 0) * 100 for r in green_2024}

    # Green 2019 notional (for trend)
    green_2019_map = {}
    if notional2019_id:
        green_2019 = fetch_all(
            "results", "constituency_id,vote_share",
            {"election_id": f"eq.{notional2019_id}", "party_id": f"eq.{green_id}"},
        )
        green_2019_map = {r["constituency_id"]: float(r.get("vote_share") or 0) * 100 for r in green_2019}

    # Demographics
    demo_map = {}
    demo_rows = fetch_all("demographics", "constituency_id,pct_degree_qualified,population_density", {"census_year": "eq.2021"})
    for d in demo_rows:
        demo_map[d["constituency_id"]] = {
            "grad": float(d.get("pct_degree_qualified") or 28),
            "density": float(d.get("population_density") or 500),
        }

    # Score
    print("\n--- Scoring seats ---")
    scored = []

    for winner in target_winners:
        cid = winner["constituency_id"]
        majority = winner.get("majority") or 0
        electorate = winner.get("electorate") or 1
        party_id = winner.get("party_id")

        green_share = green_2024_map.get(cid, 0)
        if green_share < 5.0:
            continue  # Skip seats with trivial Green presence

        green_trend = green_share - green_2019_map.get(cid, 0)
        incumbent_majority_pct = (majority / electorate) * 100

        demo = demo_map.get(cid, {"grad": 28, "density": 500})
        grad_pct = demo["grad"]
        density = demo["density"]

        # Components (0–10 each)
        comp_green_share = clamp(green_share / 4.0)            # 40% = 10
        comp_green_trend = clamp((green_trend + 5.0) / 2.5)   # +20pp = 10, -5pp = 0
        comp_majority = clamp(10.0 - incumbent_majority_pct / 1.5)  # 0% = 10, 15% = 0
        comp_grad = clamp((grad_pct - 15.0) / 3.5)
        comp_density = clamp(density / 800.0)                  # 8000/km² = 10

        threat_score = round(
            0.30 * comp_green_share +
            0.25 * comp_green_trend +
            0.20 * comp_majority +
            0.15 * comp_grad +
            0.10 * comp_density,
            2,
        )

        incumbent_party = party_name_map.get(party_id, "?")

        scored.append({
            "constituency_id": cid,
            "threat_score": threat_score,
            "green_2024_share": round(green_share, 2),
            "green_share_trend": round(green_trend, 3),
            "incumbent_majority": round(incumbent_majority_pct, 2),
            "graduate_pct": round(grad_pct, 2),
            "urban_density_score": round(clamp(density / 800.0), 2),
            "incumbent_party": incumbent_party,
        })

    scored.sort(key=lambda s: s["threat_score"], reverse=True)
    top_30 = scored[:30]
    print(f"  Scored {len(scored)} seats with >5% Green; writing top {len(top_30)}")

    # Show top 10
    top_cids = [s["constituency_id"] for s in top_30[:10]]
    id_list = "(" + ",".join(top_cids) + ")"
    name_rows = fetch_all("constituencies", "id,name", {"id": f"in.{id_list}"})
    name_map = {n["id"]: n.get("name", "?") for n in name_rows}

    print("\n  Top 10 Green threat seats:")
    for i, s in enumerate(top_30[:10], 1):
        print(f"    #{i:>2}  {s['threat_score']:.2f}  {name_map.get(s['constituency_id'], '?')}  "
              f"({s['incumbent_party']})  Green:{s['green_2024_share']:.1f}%  "
              f"Trend:{s['green_share_trend']:+.1f}pp  Majority:{s['incumbent_majority']:.1f}%")

    # Upsert
    print(f"\n--- Upserting {len(top_30)} records ---")
    try:
        _req("DELETE", "green_threat_index", SERVICE_KEY, params={"id": "not.is.null"})
    except RuntimeError:
        pass

    rows = []
    for rank, s in enumerate(top_30, 1):
        rows.append({
            "id": str(uuid.uuid4()),
            "constituency_id": s["constituency_id"],
            "threat_score": s["threat_score"],
            "threat_rank": rank,
            "green_2024_share": s["green_2024_share"],
            "green_share_trend": s["green_share_trend"],
            "incumbent_majority": s["incumbent_majority"],
            "graduate_pct": s["graduate_pct"],
            "urban_density_score": s["urban_density_score"],
            "incumbent_party": s["incumbent_party"],
        })

    _req("POST", "green_threat_index", SERVICE_KEY, body=rows, prefer="return=minimal")
    print(f"  Inserted {len(rows)}/30")

    print("\n" + "=" * 65)
    print("DONE — Green threat index complete")
    print("=" * 65)


if __name__ == "__main__":
    main()
