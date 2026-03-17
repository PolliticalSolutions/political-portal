"""
Feature 7 — Demographic Correlation Engine

Calculates Pearson correlation between demographic variables and party vote shares
across constituencies with 2021 census data, broken down by region.

DDL — run in Supabase SQL Editor before this script:

  CREATE TABLE IF NOT EXISTS public.demographic_correlations (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    region                 varchar(50),
    demographic_variable   varchar(100),
    party_id               uuid REFERENCES parties(id),
    correlation_coefficient numeric(6,4),
    sample_size            int,
    calculated_at          timestamptz DEFAULT now()
  );
  ALTER TABLE public.demographic_correlations ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow anon read" ON public.demographic_correlations FOR SELECT TO anon USING (true);

Usage:
  python scripts/calculate_correlations.py
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
    print("ERROR: SUPABASE_SERVICE_KEY not found.")
    sys.exit(1)

DEMO_VARIABLES = [
    "pct_owner_occupied",
    "pct_degree_qualified",
    "pct_no_qualifications",
    "pct_white_british",
    "pct_social_rented",
    "pct_private_rented",
    "pct_christian",
    "pct_employed",
    "median_household_income",
]


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


def pearson(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    denom_x = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    denom_y = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    if denom_x == 0 or denom_y == 0:
        return None
    return num / (denom_x * denom_y)


def main():
    print("=" * 65)
    print("FEATURE 7 — DEMOGRAPHIC CORRELATION ENGINE")
    print("=" * 65)

    # Verify table
    try:
        fetch_all("demographic_correlations", "id", {"limit": "1"})
        print("  Table exists.")
    except RuntimeError as err:
        print(f"ERROR: {err}")
        print("Run DDL from script header in Supabase SQL Editor first.")
        sys.exit(1)

    # Load constituencies with region
    print("\n--- Loading constituencies ---")
    constituencies = fetch_all("constituencies", "id,name,region")
    con_by_id = {c["id"]: c for c in constituencies}
    print(f"  {len(constituencies)} constituencies")

    # Load 2021 demographics
    print("\n--- Loading 2021 demographics ---")
    demographics = fetch_all("demographics", "constituency_id," + ",".join(DEMO_VARIABLES), {"census_year": "eq.2021"})
    demo_map = {d["constituency_id"]: d for d in demographics}
    print(f"  {len(demo_map)} demographic records")

    # Load latest GE results
    print("\n--- Loading 2024 election results ---")
    elections = fetch_all(
        "elections", "id",
        {"election_type": "eq.general", "order": "election_date.desc", "limit": "1"},
    )
    latest_id = elections[0]["id"]
    results = fetch_all(
        "results", "constituency_id,party_id,vote_share",
        {"election_id": f"eq.{latest_id}"},
    )
    # Build party list (parties with significant national presence)
    parties = fetch_all("parties", "id,name,short_name,colour_hex")
    # Filter to parties with 20+ seats or significant vote share
    party_ids = {p["id"] for p in parties}

    # Build per-constituency vote share by party
    con_party_share = {}  # constituency_id -> {party_id: vote_share}
    for r in results:
        cid = r["constituency_id"]
        pid = r["party_id"]
        if cid not in con_party_share:
            con_party_share[cid] = {}
        if pid:
            con_party_share[cid][pid] = float(r["vote_share"] or 0)

    # Get regions
    regions = list(set(c["region"] for c in constituencies if c.get("region")))
    regions.append("National")  # also compute nationally
    print(f"  Computing correlations across {len(regions)} regions")

    rows = []
    total_correlations = 0

    for region in regions:
        if region == "National":
            region_cons = [c["id"] for c in constituencies]
        else:
            region_cons = [c["id"] for c in constituencies if c.get("region") == region]

        # Only use constituencies with demographics data
        valid_cons = [cid for cid in region_cons if cid in demo_map]
        if len(valid_cons) < 5:
            continue

        for party in parties:
            pid = party["id"]
            for var in DEMO_VARIABLES:
                xs = []  # demographic values
                ys = []  # vote shares
                for cid in valid_cons:
                    demo = demo_map.get(cid, {})
                    val = demo.get(var)
                    share = con_party_share.get(cid, {}).get(pid)
                    if val is not None and share is not None:
                        xs.append(float(val))
                        ys.append(float(share))

                if len(xs) < 5:
                    continue

                r = pearson(xs, ys)
                if r is None or abs(r) < 0.1:  # skip weak correlations
                    continue

                rows.append({
                    "id": str(uuid.uuid4()),
                    "region": region,
                    "demographic_variable": var,
                    "party_id": pid,
                    "correlation_coefficient": round(r, 4),
                    "sample_size": len(xs),
                })
                total_correlations += 1

    print(f"\n  {total_correlations} significant correlations computed (|r| >= 0.10)")

    # Show top 10 strongest
    top = sorted(rows, key=lambda r: abs(r["correlation_coefficient"]), reverse=True)[:10]
    party_name_map = {p["id"]: (p["short_name"] or p["name"]) for p in parties}
    print("\n  Top 10 strongest correlations:")
    for r in top:
        print(f"    r={r['correlation_coefficient']:+.3f}  {r['region']:<20}  "
              f"{r['demographic_variable']:<25}  {party_name_map.get(r['party_id'], '?')}")

    # Upsert
    print(f"\n--- Upserting {len(rows)} correlations ---")
    try:
        _req("DELETE", "demographic_correlations", SERVICE_KEY, params={"id": "not.is.null"})
    except RuntimeError:
        pass
    total = 0
    for i in range(0, len(rows), 500):
        batch = rows[i:i + 500]
        _req("POST", "demographic_correlations", SERVICE_KEY, body=batch, prefer="return=minimal")
        total += len(batch)
        print(f"  Inserted {total}/{len(rows)}")

    print("\n" + "=" * 65)
    print(f"DONE — {len(rows)} demographic correlations written")
    print("=" * 65)


if __name__ == "__main__":
    main()
