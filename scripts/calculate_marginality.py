"""
Feature 1 — Marginality Index

Composite marginality score (0-10) for every 2024 UK constituency.

Weights:
  40% — Majority as % of electorate       (lower majority = more marginal)
  30% — Con→Lab swing deviation            (higher deviation from national = more volatile)
  20% — Historical volatility              (std dev of winner vote share across 5 elections)
  10% — Demographic stability              (lower owner-occupancy = less stable)

Classifications:
  0.0 – 2.0 : Safe
  2.0 – 4.0 : Likely
  4.0 – 6.0 : Marginal
  6.0 – 8.0 : Highly Marginal
  8.0 – 10.0: Ultra Marginal

DDL — run in Supabase SQL Editor before this script:

  CREATE TABLE IF NOT EXISTS public.marginality_scores (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    constituency_id       uuid REFERENCES constituencies(id),
    marginality_score     numeric(4,2),
    majority_pct          numeric(5,2),
    swing_deviation       numeric(5,2),
    historical_volatility numeric(5,2),
    demographic_factor    numeric(5,2),
    classification        varchar(20),
    calculated_at         timestamptz DEFAULT now()
  );
  ALTER TABLE public.marginality_scores ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow anon read" ON public.marginality_scores FOR SELECT TO anon USING (true);

Usage:
  python scripts/calculate_marginality.py
"""

import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"
ANON_KEY = "sb_publishable_A7AT-20ghVjk_BNk8ZnH0A_vKJKIxh-"

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
    print("ERROR: SUPABASE_SERVICE_KEY not found in .env or environment.")
    sys.exit(1)

CON_ID = "a4f20caf-ba89-4fb0-9ae3-313a7f937719"
LAB_ID = "7cf90c7d-1540-4737-b581-48613d4715c2"


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


def std_dev(values):
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    variance = sum((x - mean) ** 2 for x in values) / n
    return math.sqrt(variance)


def classify(score):
    if score >= 8.0:
        return "Ultra Marginal"
    if score >= 6.0:
        return "Highly Marginal"
    if score >= 4.0:
        return "Marginal"
    if score >= 2.0:
        return "Likely"
    return "Safe"


def calculate_score(majority, electorate, swing_val, national_swing, vote_shares, owner_pct):
    """Return (composite_score, majority_factor, swing_factor, volatility_factor, demographic_factor)"""

    # Factor 1: Majority % of electorate (40% weight)
    # 0% maj → 10, 25% maj → 0
    if majority is not None and electorate:
        maj_pct = (majority / electorate) * 100
        majority_factor = max(0.0, min(10.0, 10.0 - maj_pct * 0.4))
        maj_pct_stored = round(maj_pct, 2)
    else:
        majority_factor = 5.0
        maj_pct_stored = None

    # Factor 2: Con→Lab swing deviation from national (30% weight)
    # 0pp deviation → 0, 20pp → 10
    if swing_val is not None and national_swing is not None:
        deviation_pp = abs((float(swing_val) - float(national_swing)) * 100)
        swing_factor = min(10.0, deviation_pp * 0.5)
        swing_deviation_stored = round(deviation_pp, 2)
    else:
        swing_factor = 2.0
        swing_deviation_stored = None

    # Factor 3: Historical volatility (20% weight)
    # std dev of winner vote_share across elections (stored as %, e.g. 35.5)
    # 0pp std → 0, 12.5pp → 10
    if len(vote_shares) >= 2:
        sd = std_dev([float(v) for v in vote_shares])
        volatility_factor = min(10.0, sd * 0.8)
        volatility_stored = round(sd, 2)
    else:
        volatility_factor = 2.0
        volatility_stored = None

    # Factor 4: Demographic stability (10% weight)
    # Lower owner-occupancy = less stable = higher score
    # 80% → 0, 0% → 10
    if owner_pct is not None:
        demographic_factor = max(0.0, min(10.0, 10.0 - float(owner_pct) * 0.125))
    else:
        demographic_factor = 3.0

    composite = round(
        0.40 * majority_factor +
        0.30 * swing_factor +
        0.20 * volatility_factor +
        0.10 * demographic_factor,
        2,
    )

    return composite, maj_pct_stored, swing_deviation_stored, volatility_stored, demographic_factor


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    print("=" * 65)
    print("FEATURE 1 — MARGINALITY INDEX CALCULATOR")
    print("=" * 65)

    # 0. Verify table exists
    print("\n--- Checking marginality_scores table ---")
    try:
        fetch_all("marginality_scores", "id", {"limit": "1"})
        print("  Table exists.")
    except RuntimeError as err:
        if "42P01" in str(err) or "does not exist" in str(err):
            print("ERROR: marginality_scores table not found.")
            print("Run the DDL shown at the top of this script in Supabase SQL Editor first.")
        else:
            print(f"ERROR: {err}")
        sys.exit(1)

    # 1. Get all constituencies
    print("\n--- Loading constituencies ---")
    constituencies = fetch_all("constituencies", "id,ons_code,name")
    print(f"  {len(constituencies)} constituencies")
    con_by_id = {c["id"]: c for c in constituencies}

    # 2. Get latest general election
    print("\n--- Getting latest general election ---")
    elections = fetch_all(
        "elections", "id,election_date,name,election_type",
        {"election_type": "eq.general", "order": "election_date.desc", "limit": "1"},
    )
    if not elections:
        print("ERROR: No general election found.")
        sys.exit(1)
    latest_election = elections[0]
    print(f"  Latest: {latest_election['name']} ({latest_election['election_date']})")

    # 3. Get 2024 winning results (majority, electorate)
    print("\n--- Loading 2024 winning results ---")
    winners_2024 = fetch_all(
        "results", "constituency_id,majority,electorate,vote_share",
        {"election_id": f"eq.{latest_election['id']}", "is_winner": "eq.true"},
    )
    winner_map = {r["constituency_id"]: r for r in winners_2024}
    print(f"  {len(winner_map)} winning results loaded")

    # 4. Get national Con→Lab swing
    print("\n--- Getting national Con→Lab swing ---")
    national_swings = fetch_all(
        "swings", "swing_value,from_party_id,to_party_id",
        {"from_party_id": f"eq.{CON_ID}", "to_party_id": f"eq.{LAB_ID}"},
    )
    national_swing = None
    for s in national_swings:
        if s.get("constituency_id") is None:
            national_swing = s["swing_value"]
            break
    # If all have constituency_id, pick first null from unfiltered fetch
    if national_swing is None:
        null_swings = _req("GET", "swings", ANON_KEY, params={
            "select": "swing_value",
            "from_party_id": f"eq.{CON_ID}",
            "to_party_id": f"eq.{LAB_ID}",
            "constituency_id": "is.null",
        })
        if null_swings:
            national_swing = null_swings[0]["swing_value"]
    print(f"  National Con→Lab swing: {national_swing}")

    # 5. Get all constituency Con→Lab swings
    print("\n--- Loading constituency Con→Lab swings ---")
    con_lab_swings = fetch_all(
        "swings", "constituency_id,swing_value",
        {"from_party_id": f"eq.{CON_ID}", "to_party_id": f"eq.{LAB_ID}"},
    )
    swing_map = {
        s["constituency_id"]: s["swing_value"]
        for s in con_lab_swings
        if s.get("constituency_id")
    }
    print(f"  {len(swing_map)} constituency swings loaded")

    # 6. Get historical general election winning results (all elections, is_winner=true)
    print("\n--- Loading historical vote shares ---")
    all_elections = fetch_all(
        "elections", "id,election_date,election_type",
        {"election_type": "eq.general", "order": "election_date.desc"},
    )
    # Take last 5 general elections for volatility
    recent_elections = all_elections[:5]
    recent_election_ids = {e["id"] for e in recent_elections}
    print(f"  Using {len(recent_elections)} elections: {[e['election_date'][:4] for e in recent_elections]}")

    historical_results = fetch_all(
        "results", "constituency_id,vote_share,election_id",
        {"is_winner": "eq.true"},
    )
    # Build map: constituency_id → [vote_share, ...]
    vote_share_history = {}
    for r in historical_results:
        if r["election_id"] not in recent_election_ids:
            continue
        cid = r["constituency_id"]
        if cid not in vote_share_history:
            vote_share_history[cid] = []
        if r["vote_share"] is not None:
            vote_share_history[cid].append(r["vote_share"])
    print(f"  Historical data for {len(vote_share_history)} constituencies")

    # 7. Get demographics (owner occupancy)
    print("\n--- Loading demographics ---")
    demographics = fetch_all(
        "demographics", "constituency_id,pct_owner_occupied",
        {"census_year": "eq.2021"},
    )
    demo_map = {d["constituency_id"]: d["pct_owner_occupied"] for d in demographics}
    print(f"  {len(demo_map)} demographic records loaded")

    # 8. Calculate scores
    print("\n--- Calculating scores ---")
    rows = []
    missing_data = []
    classification_counts = {}

    for constituency in constituencies:
        cid = constituency["id"]
        winner = winner_map.get(cid, {})
        majority = winner.get("majority")
        electorate = winner.get("electorate")
        swing_val = swing_map.get(cid)
        vote_shares = vote_share_history.get(cid, [])
        owner_pct = demo_map.get(cid)

        if majority is None or electorate is None:
            missing_data.append(constituency["name"])

        score, maj_pct, swing_dev, volatility, demo_factor = calculate_score(
            majority, electorate, swing_val, national_swing, vote_shares, owner_pct
        )
        classification = classify(score)
        classification_counts[classification] = classification_counts.get(classification, 0) + 1

        rows.append({
            "id": str(uuid.uuid4()),
            "constituency_id": cid,
            "marginality_score": score,
            "majority_pct": maj_pct,
            "swing_deviation": swing_dev,
            "historical_volatility": volatility,
            "demographic_factor": round(demo_factor, 2),
            "classification": classification,
        })

    print(f"  Calculated {len(rows)} scores")
    print("\n  Score distribution:")
    for cls in ["Ultra Marginal", "Highly Marginal", "Marginal", "Likely", "Safe"]:
        count = classification_counts.get(cls, 0)
        bar = "█" * (count // 5)
        print(f"    {cls:<18} {count:>3}  {bar}")

    if missing_data:
        print(f"\n  Warning: {len(missing_data)} constituencies had no 2024 result data (used defaults)")

    # 9. Delete existing rows and insert fresh
    print("\n--- Upserting scores ---")
    # Delete all existing
    try:
        _req("DELETE", "marginality_scores", SERVICE_KEY, params={"id": "not.is.null"})
        print("  Cleared existing scores")
    except RuntimeError:
        pass  # table was empty

    # Insert in batches
    total = 0
    for i in range(0, len(rows), 500):
        batch = rows[i:i + 500]
        _req("POST", "marginality_scores", SERVICE_KEY, body=batch, prefer="return=minimal")
        total += len(batch)
        print(f"  Inserted {total}/{len(rows)}")

    # 10. Verification — show top 10 most marginal
    print("\n--- Top 10 most marginal seats ---")
    top = sorted(rows, key=lambda r: r["marginality_score"], reverse=True)[:10]
    for r in top:
        name = con_by_id.get(r["constituency_id"], {}).get("name", "?")
        print(f"  {r['marginality_score']:.2f}  {r['classification']:<18}  {name}")

    print("\n" + "=" * 65)
    print(f"DONE — {len(rows)} marginality scores written")
    print("=" * 65)


if __name__ == "__main__":
    main()
