"""
Task 11 — Import 33 London borough councils into local_authorities.

Uses 2022 local election results (most recent London local elections).
Checks for existing name before inserting to avoid duplicates.

Usage:
  python scripts/import_london_boroughs.py
"""

import json
import os
import sys
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

LONDON_BOROUGHS = [
    {"gss_code": "E09000002", "name": "Barking and Dagenham London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000003", "name": "Barnet London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000004", "name": "Bexley London Borough Council", "authority_type": "London Borough", "controlling_party": "Conservative", "control_type": "Conservative majority"},
    {"gss_code": "E09000005", "name": "Brent London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000006", "name": "Bromley London Borough Council", "authority_type": "London Borough", "controlling_party": "Conservative", "control_type": "Conservative majority"},
    {"gss_code": "E09000007", "name": "Camden London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000001", "name": "City of London Corporation", "authority_type": "City of London Corporation", "controlling_party": None, "control_type": "Non-partisan"},
    {"gss_code": "E09000008", "name": "Croydon London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000009", "name": "Ealing London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000010", "name": "Enfield London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000011", "name": "Greenwich London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000012", "name": "Hackney London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000013", "name": "Hammersmith and Fulham London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000014", "name": "Haringey London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000015", "name": "Harrow London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000016", "name": "Havering London Borough Council", "authority_type": "London Borough", "controlling_party": "No Overall Control", "control_type": "No Overall Control"},
    {"gss_code": "E09000017", "name": "Hillingdon London Borough Council", "authority_type": "London Borough", "controlling_party": "Conservative", "control_type": "Conservative majority"},
    {"gss_code": "E09000018", "name": "Hounslow London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000019", "name": "Islington London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000020", "name": "Kensington and Chelsea Royal Borough Council", "authority_type": "London Borough", "controlling_party": "Conservative", "control_type": "Conservative majority"},
    {"gss_code": "E09000021", "name": "Kingston upon Thames Royal Borough Council", "authority_type": "London Borough", "controlling_party": "Liberal Democrat", "control_type": "Liberal Democrat majority"},
    {"gss_code": "E09000022", "name": "Lambeth London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000023", "name": "Lewisham London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000024", "name": "Merton London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000025", "name": "Newham London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000026", "name": "Redbridge London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000027", "name": "Richmond upon Thames London Borough Council", "authority_type": "London Borough", "controlling_party": "Liberal Democrat", "control_type": "Liberal Democrat majority"},
    {"gss_code": "E09000028", "name": "Southwark London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000029", "name": "Sutton London Borough Council", "authority_type": "London Borough", "controlling_party": "Liberal Democrat", "control_type": "Liberal Democrat majority"},
    {"gss_code": "E09000030", "name": "Tower Hamlets London Borough Council", "authority_type": "London Borough", "controlling_party": "Aspire", "control_type": "Aspire majority"},
    {"gss_code": "E09000031", "name": "Waltham Forest London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000032", "name": "Wandsworth London Borough Council", "authority_type": "London Borough", "controlling_party": "Labour", "control_type": "Labour majority"},
    {"gss_code": "E09000033", "name": "Westminster City Council", "authority_type": "London Borough", "controlling_party": "Conservative", "control_type": "Conservative majority"},
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


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 65)
    print("TASK 11 — IMPORT LONDON BOROUGH COUNCILS")
    print("=" * 65)

    # Fetch existing authority names to avoid duplicates
    existing = fetch_all("local_authorities", "id,name")
    existing_names = {row["name"].strip() for row in existing}
    print(f"\n  {len(existing_names)} existing local authorities found")

    inserted = 0
    skipped = 0

    for borough in LONDON_BOROUGHS:
        name = borough["name"]
        if name in existing_names:
            skipped += 1
            print(f"  SKIP: {name} (already exists)")
            continue

        record = {
            "gss_code": borough["gss_code"],
            "name": name,
            "authority_type": borough["authority_type"],
            "tier": "unitary",
            "country": "England",
            "region": "London",
            "controlling_party": borough["controlling_party"],
            "control_type": borough["control_type"],
            "last_election_date": "2022-05-05",
            "next_election_date": "2026-05-07",
        }

        try:
            _req("POST", "local_authorities", SERVICE_KEY, body=record, prefer="return=minimal")
            inserted += 1
            print(f"  INSERTED: {name}")
        except RuntimeError as err:
            print(f"  ERROR inserting {name}: {err}")

    print(f"\n  Total boroughs: {len(LONDON_BOROUGHS)}")
    print(f"  Inserted: {inserted}")
    print(f"  Skipped:  {skipped}")
    print("\n" + "=" * 65)
    print("DONE — London borough import complete")
    print("=" * 65)


if __name__ == "__main__":
    main()
