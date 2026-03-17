"""
Feature 5 — Reform UK Threat Index

Ranks the 50 Conservative seats most at risk from Reform UK.

Score components (v2 — historical signals added):
  30% — Con→RUK swing vs national (contextual, kept but de-weighted as partially circular)
  25% — 2016 EU referendum Leave vote share (strongest historical predictor)
  15% — UKIP 2015 vote share (pre-existing populist-right base)
  15% — Reform 2024 vote share (direct signal, de-weighted to reduce circularity)
  15% — Demographic alignment (post-industrial, lower owner-occupancy)

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
    leave_vote_share      numeric(5,2),
    ukip_2015_share       numeric(5,2),
    calculated_at         timestamptz DEFAULT now()
  );
  ALTER TABLE public.reform_threat_index ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow anon read" ON public.reform_threat_index FOR SELECT TO anon USING (true);

  -- If table already exists, add new columns:
  ALTER TABLE public.reform_threat_index ADD COLUMN IF NOT EXISTS leave_vote_share numeric(5,2);
  ALTER TABLE public.reform_threat_index ADD COLUMN IF NOT EXISTS ukip_2015_share numeric(5,2);

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

    # Reform vote share per constituency (vote_share stored as 0-1 decimal → convert to %)
    print("\n--- Loading Reform vote shares ---")
    ruk_results = fetch_all(
        "results", "constituency_id,vote_share",
        {"election_id": f"eq.{latest_id}", "party_id": f"eq.{RUK_ID}"},
    )
    ruk_share = {r["constituency_id"]: float(r["vote_share"] or 0) * 100 for r in ruk_results}

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

    # Demographics (owner-occupancy as inverse post-industrial proxy)
    demo_map = {
        d["constituency_id"]: float(d.get("pct_owner_occupied") or 65)
        for d in fetch_all("demographics", "constituency_id,pct_owner_occupied", {"census_year": "eq.2021"})
    }

    # Leave vote share (2016 referendum) from constituencies table
    print("\n--- Loading Leave vote shares ---")
    leave_data = fetch_all(
        "constituencies", "id,leave_vote_share",
        {"leave_vote_share": "not.is.null"},
    )
    leave_map = {c["id"]: float(c["leave_vote_share"]) for c in leave_data if c.get("leave_vote_share")}
    print(f"  {len(leave_map)} constituencies with Leave vote data")

    # UKIP 2015 signals from historical_party_signals
    # 2015 constituency IDs differ from 2024 IDs (boundary changes), so match by name
    print("\n--- Loading UKIP 2015 signals ---")
    ukip_data = []
    try:
        ukip_data = fetch_all(
            "historical_party_signals",
            "constituency_id,signal_value",
            {"signal_name": "eq.ukip_2015_vote_share"},
        )
    except RuntimeError:
        print("  WARNING: historical_party_signals table not found — UKIP 2015 signal zeroed.")

    # Load names for all constituencies that have UKIP data (2015 IDs)
    ukip_cids = list({r["constituency_id"] for r in ukip_data})
    ukip_con_names = {}
    for i in range(0, len(ukip_cids), 100):
        batch_ids = ukip_cids[i:i + 100]
        # Use 'in' filter — PostgREST uses (val1,val2,...) for 'in'
        id_list = "(" + ",".join(batch_ids) + ")"
        rows = fetch_all("constituencies", "id,name", {"id": f"in.{id_list}"})
        for row in rows:
            ukip_con_names[row["id"]] = row["name"].upper().strip()

    # Build name → ukip_pct map
    ukip_by_name = {}
    for r in ukip_data:
        name = ukip_con_names.get(r["constituency_id"])
        if name:
            ukip_by_name[name] = float(r["signal_value"])

    # Load names for all 2024 Con constituencies
    con_id_to_name = {}
    if con_ids:
        id_list = "(" + ",".join(con_ids) + ")"
        rows = fetch_all("constituencies", "id,name", {"id": f"in.{id_list}"})
        for row in rows:
            con_id_to_name[row["id"]] = row["name"].upper().strip()

    ukip_matched = sum(1 for name in con_id_to_name.values() if name in ukip_by_name)
    print(f"  {len(ukip_by_name)} UKIP 2015 entries; {ukip_matched}/{len(con_ids)} Conservative seats matched by name")

    # Build winner map
    winner_map = {w["constituency_id"]: w for w in con_winners}

    # Calculate scores for all Con seats
    scored = []
    for cid in con_ids:
        winner = winner_map.get(cid, {})
        majority = winner.get("majority")
        electorate = winner.get("electorate")

        # Factor 1: Con→RUK swing (30%) — contextual signal, partially circular but useful
        swing = swings_con_ruk.get(cid)
        if swing is not None and national_ruk:
            swing_factor = min(10.0, max(0.0, (swing / national_ruk) * 5.0))
        else:
            swing_factor = 3.0

        # Factor 2: Leave vote share 2016 (25%) — strongest historical predictor
        # Range ~30–75%; normalise so 30% → 0, 70% → 10
        leave_pct = leave_map.get(cid)
        if leave_pct is not None:
            leave_factor = min(10.0, max(0.0, (leave_pct - 30.0) / 4.0))
        else:
            leave_factor = 4.0  # national median fallback (~46% Leave)

        # Factor 3: UKIP 2015 vote share (15%) — pre-existing populist-right base
        # Range 0–30%+; normalise so 20% → 10
        con_name = con_id_to_name.get(cid, "")
        ukip_pct = ukip_by_name.get(con_name, 0)
        ukip_factor = min(10.0, ukip_pct * 0.5)

        # Factor 4: Reform 2024 vote share (15%) — de-weighted to reduce circularity
        # ruk_pct is in percentage points (e.g. 25.0 for 25%); 40% → 10
        ruk_pct = ruk_share.get(cid, 0)
        ruk_factor = min(10.0, ruk_pct * 0.25)

        # Factor 5: Demographic alignment (15%) — post-industrial proxy
        # Lower owner-occupancy = more post-industrial = more Reform-aligned
        owner_pct = demo_map.get(cid, 65)
        demo_align = max(0.0, min(10.0, 10.0 - owner_pct * 0.125))

        score = round(
            0.30 * swing_factor +
            0.25 * leave_factor +
            0.15 * ukip_factor +
            0.15 * ruk_factor +
            0.15 * demo_align,
            2,
        )

        scored.append({
            "constituency_id": cid,
            "threat_score": score,
            "con_ruk_swing": round((swing or 0) * 100, 2),
            "ruk_2024_share": round(ruk_pct, 2),
            "con_majority": round((majority / electorate * 100) if (majority and electorate) else 0, 2),
            "council_reform_strength": 0,
            "demographic_alignment": round(demo_align, 2),
            "leave_vote_share": round(leave_pct, 2) if leave_pct is not None else None,
            "ukip_2015_share": round(ukip_pct, 2) if ukip_pct else None,
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
            "leave_vote_share": s.get("leave_vote_share"),
            "ukip_2015_share": s.get("ukip_2015_share"),
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
        leave = f"Leave {r['leave_vote_share']:.1f}%" if r.get("leave_vote_share") else "Leave n/a"
        ukip = f"UKIP15 {r['ukip_2015_share']:.1f}%" if r.get("ukip_2015_share") else "UKIP15 n/a"
        print(f"  #{r['threat_rank']:>2}  {r['threat_score']:.2f}  {name}")
        print(f"       {leave}  {ukip}  RUK24 {r['ruk_2024_share']:.1f}%  Swing {r['con_ruk_swing']:.1f}pp")

    print("\n" + "=" * 65)
    print(f"DONE — {len(rows)} Reform threat records written")
    print("=" * 65)


if __name__ == "__main__":
    main()
