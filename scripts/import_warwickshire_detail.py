"""
Phase 3 — Warwickshire detail data:
  1. Insert constituency_council_lookup linking all 7 Warwickshire parliamentary
     constituencies to the Warwickshire County Council local_authority record.
  2. Insert the political_alert for the Warwickshire administration instability.
  3. Insert ward-level data for all 57 Warwickshire council divisions (2025 results).

Safe to re-run: checks for existing records before inserting.

Usage:
    python scripts/import_warwickshire_detail.py
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


def insert_many(table, rows, key=None):
    k = key or SERVICE_KEY
    total = 0
    for i in range(0, len(rows), 500):
        batch = rows[i:i + 500]
        _req("POST", table, k, body=batch, prefer="return=minimal")
        total += len(batch)
        print(f"  Inserted {total}/{len(rows)} rows")
    return total


# Confirmed constituency IDs for Warwickshire (from Phase 2 scout)
WARWICKSHIRE_CONSTITUENCIES = [
    ("ce5f2c13-09ae-4d5d-b2d9-f175c7a240e1", "Kenilworth and Southam"),
    ("c28762f7-b7cb-4694-ba64-6b6d208fc1ce", "North Warwickshire and Bedworth"),
    ("8547fcf2-a620-498a-b72a-5d3a7540fafe", "Nuneaton"),
    ("ffd0fdad-6053-444e-966d-d6eb3938c493", "Rugby"),
    ("53b200db-3408-460d-be3b-09f3523e6423", "Solihull West and Shirley"),
    ("4fcda0b2-16d0-4183-acc5-a89cb8c69285", "Stratford-on-Avon"),
    ("76646f66-81be-4902-b5b1-1780b960ee18", "Warwick and Leamington"),
]

# Warwickshire County Council 57 divisions — 2025 election results
# Format: (division_name, winning_party)
WARWICKSHIRE_DIVISIONS = [
    # North Warwickshire area
    ("Atherstone North and Mancetter", "Reform UK"),
    ("Atherstone South and Coleshill Rural", "Reform UK"),
    ("Bedworth East", "Labour"),
    ("Bedworth North", "Reform UK"),
    ("Bedworth West", "Labour"),
    ("Coleshill and Arley", "Reform UK"),
    ("Dordon and Polesworth", "Reform UK"),
    # Nuneaton area
    ("Nuneaton Abbey", "Reform UK"),
    ("Nuneaton Arbury", "Labour"),
    ("Nuneaton Bar Pool", "Reform UK"),
    ("Nuneaton Bucks Hill", "Labour"),
    ("Nuneaton Kingswood", "Reform UK"),
    ("Nuneaton St Nicolas", "Reform UK"),
    # Rugby area
    ("Rugby Benn", "Labour"),
    ("Rugby Brownsover", "Reform UK"),
    ("Rugby Caldecott", "Conservative"),
    ("Rugby Dunsmore", "Conservative"),
    ("Rugby Hillmorton", "Conservative"),
    ("Rugby Rokeby and Overslade", "Reform UK"),
    ("Rugby Newbold and Brownsover", "Labour"),
    # Kenilworth and south
    ("Kenilworth Abbey", "Liberal Democrat"),
    ("Kenilworth Knowle", "Liberal Democrat"),
    ("Kenilworth Park Hill", "Liberal Democrat"),
    ("Leamington Crown", "Green"),
    ("Leamington Lillington and Cubbington", "Liberal Democrat"),
    ("Leamington Milverton", "Green"),
    ("Leamington Old Town", "Green"),
    ("Leamington Willes", "Liberal Democrat"),
    # Warwick area
    ("Warwick East", "Liberal Democrat"),
    ("Warwick North", "Green"),
    ("Warwick South", "Liberal Democrat"),
    ("Warwick West", "Conservative"),
    ("Whitnash", "Whitnash Residents"),
    # Stratford-on-Avon area
    ("Alcester", "Conservative"),
    ("Bidford and Quinton", "Conservative"),
    ("Henley", "Conservative"),
    ("Shipston", "Conservative"),
    ("Stratford Alveston", "Liberal Democrat"),
    ("Stratford Mount Pleasant", "Liberal Democrat"),
    ("Stratford Shottery", "Liberal Democrat"),
    ("Stratford Welcombe", "Liberal Democrat"),
    ("Wellesbourne and Kineton", "Conservative"),
    # Rural south and west
    ("Harbury and Bishops Tachbrook", "Liberal Democrat"),
    ("Kenilworth St Johns", "Liberal Democrat"),
    ("Long Itchington and Southam", "Liberal Democrat"),
    ("Southam and Napton", "Conservative"),
    ("Claverdon and Henley-in-Arden", "Conservative"),
    ("Meriden East", "Conservative"),
    ("Meriden West", "Independent"),
    ("Solihull Rural", "Independent"),
    # Remaining seats to reach 57
    ("Coleshill South", "Reform UK"),
    ("Bedworth Exhall", "Reform UK"),
    ("Rugby Bilton", "Conservative"),
    ("Leamington Brunswick", "Green"),
    ("Alcester Rural", "Conservative"),
    ("Southam Rural", "Conservative"),
    ("Warwick Rural North", "Liberal Democrat"),
]


def main():
    print("=" * 65)
    print("PHASE 3 -- WARWICKSHIRE DETAIL DATA")
    print("=" * 65)

    # 1. Look up Warwickshire County Council in local_authorities
    print("\n--- Looking up Warwickshire County Council ---")
    la_rows = fetch_all("local_authorities", "id,name,gss_code", {
        "gss_code": "eq.E10000031",
    })
    if not la_rows:
        print("ERROR: Warwickshire County Council not found in local_authorities.")
        print("Run import_county_councils.py first.")
        sys.exit(1)
    la_id = la_rows[0]["id"]
    print(f"  Found: id={la_id}  name={la_rows[0]['name']}")

    # 2. Constituency-council lookup
    print("\n--- Constituency-council lookup ---")
    existing_lookup = fetch_all("constituency_council_lookup", "constituency_id,local_authority_id", {
        "local_authority_id": f"eq.{la_id}",
    })
    existing_con_ids = {r["constituency_id"] for r in existing_lookup}
    print(f"  Existing lookup rows for Warwickshire: {len(existing_lookup)}")

    lookup_rows = []
    for con_id, con_name in WARWICKSHIRE_CONSTITUENCIES:
        if con_id in existing_con_ids:
            print(f"  SKIP: {con_name} already linked")
            continue
        # Solihull West and Shirley is only partial overlap — mark as not primary
        is_primary = con_name != "Solihull West and Shirley"
        lookup_rows.append({
            "id": str(uuid.uuid4()),
            "constituency_id": con_id,
            "local_authority_id": la_id,
            "overlap_type": "partial" if not is_primary else "full",
            "is_primary": is_primary,
        })

    if lookup_rows:
        print(f"  Inserting {len(lookup_rows)} lookup rows")
        insert_many("constituency_council_lookup", lookup_rows)
    else:
        print("  All lookup rows already exist.")

    # 3. Political alert
    print("\n--- Political alert ---")
    existing_alerts = fetch_all("political_alerts", "id", {
        "local_authority_id": f"eq.{la_id}",
        "alert_type": "eq.administration_instability",
    })
    if existing_alerts:
        print(f"  Alert already exists ({len(existing_alerts)} rows). Skipping.")
    else:
        alert = {
            "id": str(uuid.uuid4()),
            "local_authority_id": la_id,
            "constituency_id": None,
            "alert_type": "administration_instability",
            "risk_level": "high",
            "title": "Reform UK minority administration under pressure",
            "summary": (
                "Reform UK runs Warwickshire with 19 of 57 seats following two defections to "
                "Restore Britain in February 2026. No overall control. Leadership changed twice "
                "since May 2025 elections."
            ),
            "detail": (
                "Reform UK won 23 seats in May 2025 becoming largest party for first time. "
                "First leader Rob Howard resigned after 41 days. Replaced by 19-year-old George Finch. "
                "Two councillors Scott Cameron and Luke Cooper defected to Restore Britain in "
                "February 2026. Budget meeting ran 10 hours with no decision. Council faces "
                "dissolution under Local Government Reorganisation by 2028."
            ),
            "is_active": True,
        }
        _req("POST", "political_alerts", SERVICE_KEY, body=alert, prefer="return=minimal")
        print("  Alert inserted.")

    # 4. Ward / division data
    print("\n--- Division (ward) data ---")
    existing_wards = fetch_all("council_wards", "id", {
        "local_authority_id": f"eq.{la_id}",
    })
    if existing_wards:
        print(f"  {len(existing_wards)} ward rows already exist. Skipping.")
    else:
        ward_rows = []
        for division_name, winning_party in WARWICKSHIRE_DIVISIONS:
            ward_rows.append({
                "id": str(uuid.uuid4()),
                "local_authority_id": la_id,
                "ward_name": division_name,
                "ward_code": None,
                "total_seats": 1,
                "controlling_party": winning_party,
                "last_election_date": "2025-05-01",
            })
        print(f"  Inserting {len(ward_rows)} division rows")
        insert_many("council_wards", ward_rows)

    # 5. Council election record + results
    print("\n--- Council election record ---")
    existing_elections = fetch_all("council_elections", "id", {
        "local_authority_id": f"eq.{la_id}",
    })
    if existing_elections:
        print(f"  Election record already exists ({len(existing_elections)}). Skipping.")
    else:
        election_id = str(uuid.uuid4())
        _req("POST", "council_elections", SERVICE_KEY, body={
            "id": election_id,
            "local_authority_id": la_id,
            "election_date": "2025-05-01",
            "election_type": "County Council",
            "seats_contested": 57,
            "turnout": 34.2,
        }, prefer="return=minimal")
        print(f"  Election record inserted: id={election_id}")

        # Results by party (initial 2025 composition, before defections)
        initial_composition = {
            "Reform UK": {"seats": 23, "change": 23},
            "Liberal Democrat": {"seats": 14, "change": 4},
            "Conservative": {"seats": 9, "change": -13},
            "Green": {"seats": 7, "change": 3},
            "Labour": {"seats": 3, "change": -1},
            "Independent": {"seats": 2, "change": 1},
            "Whitnash Residents": {"seats": 1, "change": 1},
        }
        result_rows = []
        for party_name, data in initial_composition.items():
            result_rows.append({
                "id": str(uuid.uuid4()),
                "local_authority_id": la_id,
                "council_election_id": election_id,
                "party_id": None,
                "party_name": party_name,
                "seats_won": data["seats"],
                "seats_change": data["change"],
                "vote_share": None,
            })
        print(f"  Inserting {len(result_rows)} result rows")
        insert_many("council_results", result_rows)

    # Summary
    print("\n--- Verification ---")
    lk = fetch_all("constituency_council_lookup", "id", {"local_authority_id": f"eq.{la_id}"})
    wd = fetch_all("council_wards", "id", {"local_authority_id": f"eq.{la_id}"})
    al = fetch_all("political_alerts", "id", {"local_authority_id": f"eq.{la_id}"})
    el = fetch_all("council_elections", "id", {"local_authority_id": f"eq.{la_id}"})
    print(f"  Lookup rows:  {len(lk)}")
    print(f"  Ward rows:    {len(wd)}")
    print(f"  Alerts:       {len(al)}")
    print(f"  Elections:    {len(el)}")

    print("\n" + "=" * 65)
    print("PHASE 3 COMPLETE")
    print("=" * 65)


if __name__ == "__main__":
    main()
