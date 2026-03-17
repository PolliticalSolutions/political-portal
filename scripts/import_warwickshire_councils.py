"""
Phase 3 — Insert Warwickshire County Council data into council_data table.

Safe to re-run: checks for existing records first and skips if already imported.

Usage:
    python scripts/import_warwickshire_councils.py
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
    print("ERROR: SUPABASE_SERVICE_KEY not found in .env or environment.")
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


# Warwickshire constituencies confirmed in DB
WARWICKSHIRE_CONSTITUENCIES = [
    ("ce5f2c13-09ae-4d5d-b2d9-f175c7a240e1", "Kenilworth and Southam"),
    ("c28762f7-b7cb-4694-ba64-6b6d208fc1ce", "North Warwickshire and Bedworth"),
    ("8547fcf2-a620-498a-b72a-5d3a7540fafe", "Nuneaton"),
    ("ffd0fdad-6053-444e-966d-d6eb3938c493", "Rugby"),
    ("53b200db-3408-460d-be3b-09f3523e6423", "Solihull West and Shirley"),
    ("4fcda0b2-16d0-4183-acc5-a89cb8c69285", "Stratford-on-Avon"),
    ("76646f66-81be-4902-b5b1-1780b960ee18", "Warwick and Leamington"),
]

COUNCIL_NAME = "Warwickshire County Council"

COMPOSITION = {
    "Reform UK": 19,
    "Liberal Democrat": 14,
    "Conservative": 9,
    "Green": 7,
    "Labour": 3,
    "Restore Britain": 2,
    "Independent": 2,
    "Whitnash Residents": 1,
}

RECENT_CHANGES = [
    {
        "date": "2025-05-16",
        "description": "Rob Howard appointed leader after May 2025 elections",
    },
    {
        "date": "2025-06-26",
        "description": "Rob Howard resigns as leader after 41 days citing health problems",
    },
    {
        "date": "2025-07-01",
        "description": "George Finch, aged 19, appointed as new council leader — youngest county council leader in modern history",
    },
    {
        "date": "2026-02-01",
        "description": "Councillors Scott Cameron and Luke Cooper have Reform whip removed and defect to Restore Britain, reducing Reform to 19 effective seats",
    },
    {
        "date": "2026-02-15",
        "description": "Budget setting meeting runs 10 hours with no decision reached — second meeting required",
    },
]

POLITICAL_CONTEXT = (
    "Reform UK won 23 seats in the May 2025 elections, becoming the largest party and forming a minority "
    "administration — the first time any party other than the Conservatives had controlled the council. "
    "The council is under no overall control. The administration has faced significant instability: the first "
    "leader resigned after 41 days, his 19-year-old replacement has faced governance challenges, and two "
    "councillors have defected to Rupert Lowe's new Restore Britain party. The council is also undergoing "
    "Local Government Reorganisation and is due to become a single unitary authority by 2028, which will "
    "dissolve the existing council structure entirely."
)

ALERT_REASON = (
    "Reform UK minority administration under no overall control — two councillors defected to Restore Britain "
    "February 2026, reducing Reform to 19 seats. Leadership instability and budget failure increase probability "
    "of no-confidence motion or further defections. Council dissolution planned by 2028 under LGR."
)


def main():
    print("=" * 65)
    print("PHASE 3 -- IMPORT WARWICKSHIRE COUNTY COUNCIL DATA")
    print("=" * 65)

    # Check if already imported
    print("\n--- Checking for existing records ---")
    existing = fetch_all("council_data", "id,council_name,constituency_id", {
        "council_name": f"eq.{COUNCIL_NAME}",
    })
    if existing:
        print(f"Already imported: {len(existing)} rows found for '{COUNCIL_NAME}'")
        print("To reimport: delete existing rows first.")
        sys.exit(0)

    # Build rows
    print("\n--- Building rows ---")
    rows = []
    for cid, cname in WARWICKSHIRE_CONSTITUENCIES:
        rows.append({
            "id": str(uuid.uuid4()),
            "constituency_id": cid,
            "council_name": COUNCIL_NAME,
            "council_type": "County Council",
            "council_tier": "upper",
            "election_date": "2025-05-01",
            "next_election_date": "2029-05-01",
            "total_seats": 57,
            "controlling_party": "Reform UK",
            "control_type": "minority",
            "composition": COMPOSITION,
            "recent_changes": RECENT_CHANGES,
            "political_context": POLITICAL_CONTEXT,
            "alert_level": "high",
            "alert_reason": ALERT_REASON,
            "source_url": "https://www.warwickshire.gov.uk",
        })
        print(f"  {cname}")

    print(f"\n--- Inserting {len(rows)} rows ---")
    insert_many("council_data", rows)

    # Verify
    print("\n--- Verification ---")
    verify = fetch_all("council_data", "id,constituency_id", {
        "council_name": f"eq.{COUNCIL_NAME}",
    })
    print(f"Rows in DB for '{COUNCIL_NAME}': {len(verify)}")

    print("\n" + "=" * 65)
    print("PHASE 3 COMPLETE")
    print(f"  Rows inserted: {len(rows)}")
    print(f"  Rows verified: {len(verify)}")
    print("=" * 65)


if __name__ == "__main__":
    main()
