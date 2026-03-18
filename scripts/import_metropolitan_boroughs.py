"""
Task 10 — Import 36 metropolitan borough councils into local_authorities.

Checks for existing name before inserting to avoid duplicates.

Usage:
  python scripts/import_metropolitan_boroughs.py
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

METROPOLITAN_BOROUGHS = [
    # West Midlands
    {"gss_code": "E08000025", "name": "Birmingham City Council", "controlling_party": "No Overall Control", "control_type": "No Overall Control", "region": "West Midlands"},
    {"gss_code": "E08000026", "name": "Coventry City Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "West Midlands"},
    {"gss_code": "E08000027", "name": "Dudley Metropolitan Borough Council", "controlling_party": "Conservative", "control_type": "Conservative majority", "region": "West Midlands"},
    {"gss_code": "E08000028", "name": "Sandwell Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "West Midlands"},
    {"gss_code": "E08000029", "name": "Solihull Metropolitan Borough Council", "controlling_party": "Conservative", "control_type": "Conservative majority", "region": "West Midlands"},
    {"gss_code": "E08000030", "name": "Walsall Metropolitan Borough Council", "controlling_party": "Conservative", "control_type": "Conservative majority", "region": "West Midlands"},
    {"gss_code": "E08000031", "name": "Wolverhampton City Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "West Midlands"},
    # Greater Manchester
    {"gss_code": "E08000001", "name": "Bolton Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Greater Manchester"},
    {"gss_code": "E08000002", "name": "Bury Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Greater Manchester"},
    {"gss_code": "E08000003", "name": "Manchester City Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Greater Manchester"},
    {"gss_code": "E08000004", "name": "Oldham Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Greater Manchester"},
    {"gss_code": "E08000005", "name": "Rochdale Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Greater Manchester"},
    {"gss_code": "E08000006", "name": "Salford City Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Greater Manchester"},
    {"gss_code": "E08000007", "name": "Stockport Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Greater Manchester"},
    {"gss_code": "E08000008", "name": "Tameside Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Greater Manchester"},
    {"gss_code": "E08000009", "name": "Trafford Metropolitan Borough Council", "controlling_party": "No Overall Control", "control_type": "No Overall Control", "region": "Greater Manchester"},
    {"gss_code": "E08000010", "name": "Wigan Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Greater Manchester"},
    # Merseyside
    {"gss_code": "E08000011", "name": "Knowsley Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Merseyside"},
    {"gss_code": "E08000012", "name": "Liverpool City Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Merseyside"},
    {"gss_code": "E08000014", "name": "Sefton Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Merseyside"},
    {"gss_code": "E08000013", "name": "St Helens Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Merseyside"},
    {"gss_code": "E08000015", "name": "Wirral Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Merseyside"},
    # West Yorkshire
    {"gss_code": "E08000032", "name": "Bradford Metropolitan District Council", "controlling_party": "No Overall Control", "control_type": "No Overall Control", "region": "West Yorkshire"},
    {"gss_code": "E08000033", "name": "Calderdale Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "West Yorkshire"},
    {"gss_code": "E08000034", "name": "Kirklees Metropolitan Borough Council", "controlling_party": "No Overall Control", "control_type": "No Overall Control", "region": "West Yorkshire"},
    {"gss_code": "E08000035", "name": "Leeds City Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "West Yorkshire"},
    {"gss_code": "E08000036", "name": "Wakefield Metropolitan District Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "West Yorkshire"},
    # South Yorkshire
    {"gss_code": "E08000016", "name": "Barnsley Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "South Yorkshire"},
    {"gss_code": "E08000017", "name": "Doncaster City Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "South Yorkshire"},
    {"gss_code": "E08000018", "name": "Rotherham Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "South Yorkshire"},
    {"gss_code": "E08000019", "name": "Sheffield City Council", "controlling_party": "No Overall Control", "control_type": "No Overall Control", "region": "South Yorkshire"},
    # Tyne and Wear
    {"gss_code": "E08000020", "name": "Gateshead Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Tyne and Wear"},
    {"gss_code": "E08000021", "name": "Newcastle City Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Tyne and Wear"},
    {"gss_code": "E08000022", "name": "North Tyneside Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Tyne and Wear"},
    {"gss_code": "E08000023", "name": "South Tyneside Metropolitan Borough Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Tyne and Wear"},
    {"gss_code": "E08000024", "name": "Sunderland City Council", "controlling_party": "Labour", "control_type": "Labour majority", "region": "Tyne and Wear"},
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
    print("TASK 10 — IMPORT METROPOLITAN BOROUGH COUNCILS")
    print("=" * 65)

    # Fetch existing authority names to avoid duplicates
    existing = fetch_all("local_authorities", "id,name")
    existing_names = {row["name"].strip() for row in existing}
    print(f"\n  {len(existing_names)} existing local authorities found")

    inserted = 0
    skipped = 0

    for borough in METROPOLITAN_BOROUGHS:
        name = borough["name"]
        if name in existing_names:
            skipped += 1
            print(f"  SKIP: {name} (already exists)")
            continue

        record = {
            "gss_code": borough["gss_code"],
            "name": name,
            "authority_type": "Metropolitan Borough",
            "tier": "unitary",
            "country": "England",
            "region": borough["region"],
            "controlling_party": borough["controlling_party"],
            "control_type": borough["control_type"],
            "last_election_date": "2024-05-02",
            "next_election_date": "2026-05-01",
        }

        try:
            _req("POST", "local_authorities", SERVICE_KEY, body=record, prefer="return=minimal")
            inserted += 1
            print(f"  INSERTED: {name}")
        except RuntimeError as err:
            print(f"  ERROR inserting {name}: {err}")

    print(f"\n  Total boroughs: {len(METROPOLITAN_BOROUGHS)}")
    print(f"  Inserted: {inserted}")
    print(f"  Skipped:  {skipped}")
    print("\n" + "=" * 65)
    print("DONE — metropolitan borough import complete")
    print("=" * 65)


if __name__ == "__main__":
    main()
