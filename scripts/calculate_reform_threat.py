"""
Feature 5 — Reform UK Threat Index

Ranks the 50 Conservative seats most at risk from Reform UK.

Score components:
  30% — Con→RUK swing vs national
  25% — Reform 2024 vote share in seat
  25% — Con majority size (lower = more at risk)
  10% — Council Reform strength (from council_data)
  10% — Demographic alignment (post-industrial, lower owner-occupancy)

DDL — run in Supabase SQL Editor before this script:

  CREATE TABLE IF NOT EXISTS public.reform_threat_index (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    constituency_id       uuid REFERENCES constituencies(id),
    threat_score          numeric(4,2),
    threat_rank           int,
    con_ruk_swing         numeric(5,2),
    ruk_2024_share        numeric(5,2),
    con_majority          numeric(5,2),
    council_reform_strength numeric(4,2),
    demographic_alignment numeric(4,2),
    calculated_at         timestamptz DEFAULT now()
  );
  ALTER TABLE public.reform_threat_index ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow anon read" ON public.reform_threat_index FOR SELECT TO anon USING (true);

Usage:
  python scripts/calculate_reform_threat.py
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

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


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    print("=" * 65)
    print("FEATURE 5 — REFORM UK THREAT INDEX")
    print("=" * 65)

    # Verify table
    try:
        fetch_all("reform_threat_index", "id", {"limit": "1"})
        print("  Table exists.")
    except RuntimeError as err:
        print(f"ERROR: {err}")
        print("Run DDL from script header in Supabase SQL Editor first.")
        sys.exit(1)

    # Latest GE
    elections = fetch_all(
        "elections", "id",
        {"election_type": "eq.general", "order": "election_date.desc", "limit": "1"},
    )
    latest_id = elections[0]["id"]

    # Conservative winners
    print("\n--- Loading Conservative winners ---")
    con_winners = fetch_all(
        "results", "constituency_id,majority,electorate",
        {"election_id": f"eq.{latest_id}", "is_winner": "eq.true", "party_id": f"eq.{CON_ID}"},
    )
    con_ids = [w["constituency_id"] for w in con_winners]
    print(f"  {len(con_ids)} Conservative seats")

    # Reform vote share per constituency
    print("\n--- Loading Reform vote shares ---")
    ruk_results = fetch_all(
        "results", "constituency_id,vote_share",
        {"election_id": f"eq.{latest_id}", "party_id": f"eq.{RUK_ID}"},
    )
    ruk_share = {r["constituency_id"]: float(r["vote_share"] or 0) for r in ruk_results}

    # Con→RUK swings
    print("\n--- Loading Con→Reform swings ---")
    swings_con_ruk = {
        s["constituency_id"]: float(s["swing_value"])
        for s in fetch_all("swings", "constituency_id,swing_value",
                           {"from_party_id": f"eq.{CON_ID}", "to_party_id": f"eq.{RUK_ID}"})
        if s.get("constituency_id")
    }
    national_ruk = next(
        (float(s["swing_value"]) for s in (_req("GET", "swings", ANON_KEY, params={
            "select": "swing_value",
            "from_party_id": f"eq.{CON_ID}",
            "to_party_id": f"eq.{RUK_ID}",
            "constituency_id": "is.null",
        }) or [])), None
    )
    print(f"  National Con→Reform swing: {national_ruk}")

    # Council Reform strength (from council_data composition)
    councils = fetch_all("council_data", "constituency_id,composition")
    council_reform = {}
    for c in councils:
        cid = c["constituency_id"]
        comp = c.get("composition") or {}
        if isinstance(comp, str):
            try:
                comp = json.loads(comp)
            except Exception:
                comp = {}
        reform_seats = comp.get("Reform UK", 0)
        total_seats = sum(comp.values()) if comp else 1
        council_reform[cid] = (reform_seats / total_seats * 10) if total_seats else 0

    # Demographics
    demo_map = {
        d["constituency_id"]: float(d.get("pct_owner_occupied") or 65)
        for d in fetch_all("demographics", "constituency_id,pct_owner_occupied", {"census_year": "eq.2021"})
    }

    # Build winner map
    winner_map = {w["constituency_id"]: w for w in con_winners}

    # Calculate scores for all Con seats
    scored = []
    for cid in con_ids:
        winner = winner_map.get(cid, {})
        majority = winner.get("majority")
        electorate = winner.get("electorate")

        # Factor 1: Con→RUK swing (30%)
        swing = swings_con_ruk.get(cid)
        if swing is not None and national_ruk:
            swing_factor = min(10.0, max(0.0, (swing / national_ruk) * 5.0))
        else:
            swing_factor = 3.0

        # Factor 2: Reform 2024 vote share (25%)
        ruk_pct = ruk_share.get(cid, 0)
        ruk_factor = min(10.0, ruk_pct * 0.25)  # 40% share → 10

        # Factor 3: Con majority (25%)
        if majority is not None and electorate:
            maj_pct = (majority / electorate) * 100
            majority_factor = max(0.0, min(10.0, 10.0 - maj_pct * 0.4))
        else:
            majority_factor = 5.0

        # Factor 4: Council Reform strength (10%)
        reform_council = min(10.0, council_reform.get(cid, 0))

        # Factor 5: Demographic alignment (10%)
        # Post-industrial areas (lower owner-occupancy) align with Reform
        owner_pct = demo_map.get(cid, 65)
        demo_align = max(0.0, min(10.0, 10.0 - owner_pct * 0.125))

        score = round(
            0.30 * swing_factor +
            0.25 * ruk_factor +
            0.25 * majority_factor +
            0.10 * reform_council +
            0.10 * demo_align,
            2,
        )

        scored.append({
            "constituency_id": cid,
            "threat_score": score,
            "con_ruk_swing": round((swing or 0) * 100, 2),
            "ruk_2024_share": round(ruk_pct, 2),
            "con_majority": round((majority / electorate * 100) if (majority and electorate) else 0, 2),
            "council_reform_strength": round(reform_council, 2),
            "demographic_alignment": round(demo_align, 2),
        })

    # Sort and take top 50
    scored.sort(key=lambda s: s["threat_score"], reverse=True)
    top50 = scored[:50]

    rows = []
    for rank, s in enumerate(top50, 1):
        rows.append({
            "id": str(uuid.uuid4()),
            "constituency_id": s["constituency_id"],
            "threat_score": s["threat_score"],
            "threat_rank": rank,
            "con_ruk_swing": s["con_ruk_swing"],
            "ruk_2024_share": s["ruk_2024_share"],
            "con_majority": s["con_majority"],
            "council_reform_strength": s["council_reform_strength"],
            "demographic_alignment": s["demographic_alignment"],
        })

    # Upsert
    print(f"\n--- Upserting top {len(rows)} Reform threat seats ---")
    try:
        _req("DELETE", "reform_threat_index", SERVICE_KEY, params={"id": "not.is.null"})
    except RuntimeError:
        pass
    for i in range(0, len(rows), 500):
        batch = rows[i:i + 500]
        _req("POST", "reform_threat_index", SERVICE_KEY, body=batch, prefer="return=minimal")
    print(f"  Inserted {len(rows)} rows")

    # Show top 10
    print("\n--- Top 10 Reform-threatened Conservative seats ---")
    constituencies = {c["id"]: c["name"] for c in fetch_all("constituencies", "id,name")}
    for r in rows[:10]:
        name = constituencies.get(r["constituency_id"], "?")
        print(f"  #{r['threat_rank']:>2}  {r['threat_score']:.2f}  {name}")
        print(f"       RUK share {r['ruk_2024_share']:.1f}%  Con maj {r['con_majority']:.1f}%  Swing {r['con_ruk_swing']:.1f}pp")

    print("\n" + "=" * 65)
    print(f"DONE — {len(rows)} Reform threat records written")
    print("=" * 65)


if __name__ == "__main__":
    main()
