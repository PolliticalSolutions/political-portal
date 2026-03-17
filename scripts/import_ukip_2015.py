"""
Extract UKIP 2015 vote share from results table into historical_party_signals.

This captures the pre-Reform populist-right signal. UKIP 2015 is a strong
predictor of Reform UK 2024 performance, independent of Conservative vote share.

Usage:
  python scripts/import_ukip_2015.py

DDL required (run in Supabase SQL Editor first):
  CREATE TABLE IF NOT EXISTS public.historical_party_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    constituency_id UUID REFERENCES constituencies(id),
    signal_name VARCHAR(100) NOT NULL,
    signal_value DECIMAL(8,4),
    election_year INT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE public.historical_party_signals ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow anon read" ON public.historical_party_signals FOR SELECT TO anon USING (true);
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

UKIP_PARTY_ID = "98c7c7b2-63e3-4e6e-83de-45e0ca93a28d"  # UKIP (short name)
ELECTION_2015_DATE = "2015-05-07"

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
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 65)
    print("IMPORT — UKIP 2015 VOTE SHARE -> historical_party_signals")
    print("=" * 65)

    # Verify table exists
    try:
        fetch_all("historical_party_signals", "id", {"limit": "1"})
        print("  Table historical_party_signals exists.")
    except RuntimeError as err:
        print(f"ERROR: {err}")
        print("Run DDL from script header in Supabase SQL Editor first.")
        sys.exit(1)

    # Find 2015 election
    print("\n--- Finding 2015 general election ---")
    elections = fetch_all(
        "elections", "id,election_date",
        {"election_date": f"eq.{ELECTION_2015_DATE}", "election_type": "eq.general"},
    )
    if not elections:
        print("ERROR: 2015 general election not found in elections table.")
        sys.exit(1)
    election_2015_id = elections[0]["id"]
    print(f"  Election ID: {election_2015_id}")

    # Fetch UKIP 2015 results
    print("\n--- Fetching UKIP 2015 results ---")
    ukip_results = fetch_all(
        "results",
        "constituency_id,vote_share,votes",
        {"election_id": f"eq.{election_2015_id}", "party_id": f"eq.{UKIP_PARTY_ID}"},
    )
    print(f"  {len(ukip_results)} UKIP constituencies found")

    if not ukip_results:
        print("ERROR: No UKIP 2015 results found.")
        sys.exit(1)

    # Show distribution
    shares = [float(r.get("vote_share") or 0) * 100 for r in ukip_results]
    shares.sort(reverse=True)
    print(f"  Vote share range: {min(shares):.1f}% - {max(shares):.1f}%")
    print(f"  Median: {shares[len(shares) // 2]:.1f}%")
    print(f"  Mean: {sum(shares) / len(shares):.1f}%")
    print(f"  Over 20%: {sum(1 for s in shares if s >= 20)}")
    print(f"  Over 15%: {sum(1 for s in shares if s >= 15)}")
    print(f"  Over 10%: {sum(1 for s in shares if s >= 10)}")

    # Clear existing UKIP 2015 signals
    print("\n--- Clearing existing UKIP_2015 signals ---")
    try:
        _req(
            "DELETE", "historical_party_signals", SERVICE_KEY,
            params={"signal_name": "eq.ukip_2015_vote_share"},
        )
        print("  Cleared existing rows.")
    except RuntimeError:
        pass

    # Build rows
    rows = []
    for r in ukip_results:
        cid = r.get("constituency_id")
        raw_share = r.get("vote_share")
        if not cid or raw_share is None:
            continue
        share = float(raw_share)
        # vote_share is stored as 0-1 decimal in this table; convert to percentage
        if share <= 1.0:
            share = share * 100
        rows.append({
            "id": str(uuid.uuid4()),
            "constituency_id": cid,
            "signal_name": "ukip_2015_vote_share",
            "signal_value": round(share, 4),
            "election_year": 2015,
            "notes": "UKIP vote share from 2015 general election. Proxy for pre-existing populist-right sentiment.",
        })

    # Insert
    print(f"\n--- Inserting {len(rows)} rows ---")
    for i in range(0, len(rows), 500):
        batch = rows[i : i + 500]
        _req("POST", "historical_party_signals", SERVICE_KEY, body=batch, prefer="return=minimal")
    print(f"  Inserted {len(rows)} rows")

    # Show top 10
    print("\n--- Top 10 UKIP 2015 constituencies ---")
    top10 = fetch_all(
        "historical_party_signals",
        "constituency_id,signal_value",
        {"signal_name": "eq.ukip_2015_vote_share", "order": "signal_value.desc", "limit": "10"},
    )
    con_names = {c["id"]: c["name"] for c in fetch_all("constituencies", "id,name")}
    for rec in top10:
        name = con_names.get(rec["constituency_id"], "?")
        print(f"  {name}: {rec['signal_value']:.1f}%")

    print("\n" + "=" * 65)
    print(f"DONE — {len(rows)} UKIP 2015 signals written to historical_party_signals")
    print("=" * 65)


if __name__ == "__main__":
    main()
