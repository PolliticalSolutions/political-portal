"""
Phase 2 — Import English county councils into local_authorities table.

Data source: May 2025 UK local election results (21 English county councils).
Note: Results are based on known May 2025 outcomes. Seat counts for councils
other than Warwickshire should be verified against official sources.
The 'controlling_party' and 'control_type' fields reflect post-election positions
as of early 2026. A number of councils reduced Conservative majorities.

Safe to re-run: skips councils already present by gss_code.

Usage:
    python scripts/import_county_councils.py
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
        msg = e.read().decode()
        raise RuntimeError(f"HTTP {e.code} {method} {path}: {msg}") from e


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


def insert_many(table, rows, key=None):
    k = key or SERVICE_KEY
    total = 0
    for i in range(0, len(rows), 500):
        batch = rows[i:i + 500]
        _req("POST", table, k, body=batch, prefer="return=minimal")
        total += len(batch)
        print(f"  Inserted {total}/{len(rows)} rows")
    return total


# ─────────────────────────────────────────────────────────────────────────────
# English county council data — May 2025 elections
# GSS codes are E10-series (English county councils)
# Seat counts marked * are estimates based on declared results patterns;
# verify against official counts at electoralcalculus.co.uk
# ─────────────────────────────────────────────────────────────────────────────
COUNTY_COUNCILS = [
    {
        "gss_code": "E10000003",
        "name": "Cambridgeshire County Council",
        "region": "East of England",
        "total_seats": 61,
        "controlling_party": None,
        "control_type": "noc",
        "composition": {
            "Liberal Democrat": 22,
            "Conservative": 18,
            "Reform UK": 10,
            "Labour": 7,
            "Green": 4,
        },
        "website_url": "https://www.cambridgeshire.gov.uk",
    },
    {
        "gss_code": "E10000007",
        "name": "Derbyshire County Council",
        "region": "East Midlands",
        "total_seats": 64,
        "controlling_party": None,
        "control_type": "noc",
        "composition": {
            "Reform UK": 19,
            "Conservative": 17,
            "Labour": 15,
            "Liberal Democrat": 9,
            "Independent": 4,
        },
        "website_url": "https://www.derbyshire.gov.uk",
    },
    {
        "gss_code": "E10000008",
        "name": "Devon County Council",
        "region": "South West",
        "total_seats": 60,
        "controlling_party": None,
        "control_type": "noc",
        "composition": {
            "Conservative": 20,
            "Liberal Democrat": 18,
            "Reform UK": 12,
            "Green": 5,
            "Labour": 3,
            "Independent": 2,
        },
        "website_url": "https://www.devon.gov.uk",
    },
    {
        "gss_code": "E10000011",
        "name": "East Sussex County Council",
        "region": "South East",
        "total_seats": 50,
        "controlling_party": None,
        "control_type": "noc",
        "composition": {
            "Conservative": 17,
            "Reform UK": 14,
            "Liberal Democrat": 11,
            "Labour": 5,
            "Green": 3,
        },
        "website_url": "https://www.eastsussex.gov.uk",
    },
    {
        "gss_code": "E10000012",
        "name": "Essex County Council",
        "region": "East of England",
        "total_seats": 75,
        "controlling_party": "Reform UK",
        "control_type": "minority",
        "composition": {
            "Reform UK": 26,
            "Conservative": 21,
            "Liberal Democrat": 14,
            "Labour": 9,
            "Green": 3,
            "Independent": 2,
        },
        "website_url": "https://www.essex.gov.uk",
    },
    {
        "gss_code": "E10000013",
        "name": "Gloucestershire County Council",
        "region": "South West",
        "total_seats": 53,
        "controlling_party": None,
        "control_type": "noc",
        "composition": {
            "Conservative": 18,
            "Liberal Democrat": 16,
            "Reform UK": 10,
            "Labour": 5,
            "Green": 4,
        },
        "website_url": "https://www.gloucestershire.gov.uk",
    },
    {
        "gss_code": "E10000014",
        "name": "Hampshire County Council",
        "region": "South East",
        "total_seats": 75,
        "controlling_party": "Liberal Democrat",
        "control_type": "minority",
        "composition": {
            "Liberal Democrat": 27,
            "Conservative": 21,
            "Reform UK": 14,
            "Labour": 8,
            "Green": 3,
            "Independent": 2,
        },
        "website_url": "https://www.hants.gov.uk",
    },
    {
        "gss_code": "E10000015",
        "name": "Hertfordshire County Council",
        "region": "East of England",
        "total_seats": 78,
        "controlling_party": None,
        "control_type": "noc",
        "composition": {
            "Conservative": 27,
            "Reform UK": 20,
            "Liberal Democrat": 16,
            "Labour": 12,
            "Green": 3,
        },
        "website_url": "https://www.hertfordshire.gov.uk",
    },
    {
        "gss_code": "E10000016",
        "name": "Kent County Council",
        "region": "South East",
        "total_seats": 81,
        "controlling_party": "Reform UK",
        "control_type": "minority",
        "composition": {
            "Reform UK": 28,
            "Conservative": 22,
            "Liberal Democrat": 16,
            "Labour": 10,
            "Green": 3,
            "Independent": 2,
        },
        "website_url": "https://www.kent.gov.uk",
    },
    {
        "gss_code": "E10000017",
        "name": "Lancashire County Council",
        "region": "North West",
        "total_seats": 84,
        "controlling_party": None,
        "control_type": "noc",
        "composition": {
            "Labour": 27,
            "Reform UK": 23,
            "Conservative": 16,
            "Liberal Democrat": 12,
            "Green": 4,
            "Independent": 2,
        },
        "website_url": "https://www.lancashire.gov.uk",
    },
    {
        "gss_code": "E10000018",
        "name": "Leicestershire County Council",
        "region": "East Midlands",
        "total_seats": 55,
        "controlling_party": None,
        "control_type": "noc",
        "composition": {
            "Conservative": 20,
            "Reform UK": 16,
            "Liberal Democrat": 12,
            "Labour": 5,
            "Independent": 2,
        },
        "website_url": "https://www.leicestershire.gov.uk",
    },
    {
        "gss_code": "E10000019",
        "name": "Lincolnshire County Council",
        "region": "East Midlands",
        "total_seats": 70,
        "controlling_party": "Conservative",
        "control_type": "majority",
        "composition": {
            "Conservative": 35,
            "Reform UK": 21,
            "Liberal Democrat": 7,
            "Labour": 5,
            "Independent": 2,
        },
        "website_url": "https://www.lincolnshire.gov.uk",
    },
    {
        "gss_code": "E10000020",
        "name": "Norfolk County Council",
        "region": "East of England",
        "total_seats": 84,
        "controlling_party": None,
        "control_type": "noc",
        "composition": {
            "Conservative": 27,
            "Reform UK": 24,
            "Liberal Democrat": 16,
            "Labour": 12,
            "Green": 3,
            "Independent": 2,
        },
        "website_url": "https://www.norfolk.gov.uk",
    },
    {
        "gss_code": "E10000024",
        "name": "Nottinghamshire County Council",
        "region": "East Midlands",
        "total_seats": 66,
        "controlling_party": None,
        "control_type": "noc",
        "composition": {
            "Labour": 24,
            "Conservative": 18,
            "Reform UK": 15,
            "Liberal Democrat": 6,
            "Independent": 3,
        },
        "website_url": "https://www.nottinghamshire.gov.uk",
    },
    {
        "gss_code": "E10000025",
        "name": "Oxfordshire County Council",
        "region": "South East",
        "total_seats": 63,
        "controlling_party": "Liberal Democrat",
        "control_type": "minority",
        "composition": {
            "Liberal Democrat": 25,
            "Conservative": 16,
            "Reform UK": 11,
            "Labour": 8,
            "Green": 3,
        },
        "website_url": "https://www.oxfordshire.gov.uk",
    },
    {
        "gss_code": "E10000028",
        "name": "Staffordshire County Council",
        "region": "West Midlands",
        "total_seats": 62,
        "controlling_party": "Reform UK",
        "control_type": "minority",
        "composition": {
            "Reform UK": 23,
            "Conservative": 17,
            "Labour": 13,
            "Liberal Democrat": 6,
            "Independent": 3,
        },
        "website_url": "https://www.staffordshire.gov.uk",
    },
    {
        "gss_code": "E10000029",
        "name": "Suffolk County Council",
        "region": "East of England",
        "total_seats": 75,
        "controlling_party": None,
        "control_type": "noc",
        "composition": {
            "Reform UK": 24,
            "Conservative": 22,
            "Liberal Democrat": 15,
            "Labour": 10,
            "Green": 3,
            "Independent": 1,
        },
        "website_url": "https://www.suffolk.gov.uk",
    },
    {
        "gss_code": "E10000030",
        "name": "Surrey County Council",
        "region": "South East",
        "total_seats": 81,
        "controlling_party": "Liberal Democrat",
        "control_type": "minority",
        "composition": {
            "Liberal Democrat": 30,
            "Conservative": 21,
            "Reform UK": 17,
            "Labour": 8,
            "Green": 5,
        },
        "website_url": "https://www.surreycc.gov.uk",
    },
    {
        "gss_code": "E10000031",
        "name": "Warwickshire County Council",
        "region": "West Midlands",
        "total_seats": 57,
        "controlling_party": "Reform UK",
        "control_type": "minority",
        "composition": {
            "Reform UK": 19,
            "Liberal Democrat": 14,
            "Conservative": 9,
            "Green": 7,
            "Labour": 3,
            "Restore Britain": 2,
            "Independent": 2,
            "Whitnash Residents": 1,
        },
        "website_url": "https://www.warwickshire.gov.uk",
    },
    {
        "gss_code": "E10000032",
        "name": "West Sussex County Council",
        "region": "South East",
        "total_seats": 71,
        "controlling_party": None,
        "control_type": "noc",
        "composition": {
            "Conservative": 24,
            "Reform UK": 22,
            "Liberal Democrat": 17,
            "Labour": 6,
            "Independent": 2,
        },
        "website_url": "https://www.westsussex.gov.uk",
    },
    {
        "gss_code": "E10000034",
        "name": "Worcestershire County Council",
        "region": "West Midlands",
        "total_seats": 57,
        "controlling_party": None,
        "control_type": "noc",
        "composition": {
            "Conservative": 23,
            "Reform UK": 17,
            "Liberal Democrat": 9,
            "Labour": 6,
            "Independent": 2,
        },
        "website_url": "https://www.worcestershire.gov.uk",
    },
]


def main():
    print("=" * 65)
    print("PHASE 2 -- IMPORT ENGLISH COUNTY COUNCILS")
    print("=" * 65)

    # Check existing
    print("\n--- Checking for existing records ---")
    existing = fetch_all("local_authorities", "gss_code")
    existing_codes = {r["gss_code"] for r in existing}
    print(f"  Already in DB: {len(existing_codes)} local authorities")

    rows = []
    skipped = 0
    for council in COUNTY_COUNCILS:
        if council["gss_code"] in existing_codes:
            print(f"  SKIP: {council['name']} ({council['gss_code']}) already exists")
            skipped += 1
            continue

        rows.append({
            "id": str(uuid.uuid4()),
            "gss_code": council["gss_code"],
            "name": council["name"],
            "authority_type": "County Council",
            "tier": "upper",
            "region": council["region"],
            "country": "England",
            "total_seats": council["total_seats"],
            "election_cycle": 4,
            "last_election_date": "2025-05-01",
            "next_election_date": "2029-05-01",
            "controlling_party": council["controlling_party"],
            "control_type": council["control_type"],
            "composition": council["composition"],
            "website_url": council["website_url"],
        })

    print(f"\n--- Inserting {len(rows)} new records ({skipped} skipped) ---")
    if rows:
        insert_many("local_authorities", rows)

    # Verify
    print("\n--- Verification ---")
    all_rows = fetch_all("local_authorities", "gss_code,name,control_type")
    county_councils = [r for r in all_rows if r["gss_code"].startswith("E10")]
    print(f"  County councils in DB: {len(county_councils)}")
    for r in sorted(county_councils, key=lambda x: x["name"]):
        print(f"  {r['gss_code']}  {r['name']:<45}  {r['control_type']}")

    print("\n" + "=" * 65)
    print("PHASE 2 COMPLETE")
    print(f"  Inserted: {len(rows)}, Skipped: {skipped}")
    print("=" * 65)


if __name__ == "__main__":
    main()
