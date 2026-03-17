"""
Import EU Referendum 2016 Leave vote share by constituency.

Source: Chris Hanretty final estimates (via Quartz/uk-tactical-voting GitHub mirror).
Uses the "Figure to use" column which prefers known/actual figures over modelled estimates.

Matches constituencies by name (normalised). The 2024 boundary constituencies don't have
1:1 PCON codes with 2016 boundaries so name-matching is used. Unmatched seats are reported.

Usage:
  python scripts/import_leave_vote.py

DDL required (run in Supabase SQL Editor first):
  ALTER TABLE public.constituencies ADD COLUMN IF NOT EXISTS leave_vote_share DECIMAL(5,2);
"""

import csv
import io
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"
ANON_KEY = "sb_publishable_A7AT-20ghVjk_BNk8ZnH0A_vKJKIxh-"

HANRETTY_CSV_URL = (
    "https://github.com/Quartz/uk-tactical-voting/raw/refs/heads/master/"
    "Final%20estimates%20of%20the%20Leave%20vote%20share%20in%20the%20EU%20referendum%20-%20google_sheets.csv"
)

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


def normalise(name):
    """Lowercase, strip punctuation, normalise whitespace for fuzzy matching."""
    name = name.lower()
    name = re.sub(r"[''`]", "", name)
    name = re.sub(r"[^a-z0-9 ]", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def download_hanretty_csv():
    print(f"  Downloading: {HANRETTY_CSV_URL}")
    req = urllib.request.Request(
        HANRETTY_CSV_URL,
        headers={"User-Agent": "Mozilla/5.0 (compatible; PoliticalPortal/1.0)"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        content = r.read().decode("utf-8-sig")  # handle BOM
    print(f"  Downloaded {len(content):,} bytes")
    return content


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 65)
    print("IMPORT — EU REFERENDUM 2016 LEAVE VOTE SHARE")
    print("Source: Chris Hanretty final estimates (Quartz mirror)")
    print("=" * 65)

    # Verify column exists
    sample = fetch_all("constituencies", "id,name,leave_vote_share", {"limit": "1"})
    if sample and "leave_vote_share" not in sample[0]:
        print("ERROR: leave_vote_share column not found on constituencies table.")
        print("Run DDL from script header in Supabase SQL Editor first.")
        sys.exit(1)
    print("  Column leave_vote_share exists on constituencies.")

    # Download Hanretty CSV
    print("\n--- Downloading Hanretty estimates ---")
    csv_content = download_hanretty_csv()

    # Parse CSV
    reader = csv.DictReader(io.StringIO(csv_content))
    rows = list(reader)
    print(f"  Parsed {len(rows)} rows from CSV")
    if rows:
        print(f"  CSV columns: {list(rows[0].keys())}")

    # Build leave share map keyed by normalised name
    hanretty_by_name = {}
    for row in rows:
        raw_name = row.get("Constituency name", "").strip()
        figure_str = row.get("Figure to use", "").strip()
        if not raw_name or not figure_str:
            continue
        try:
            figure = float(figure_str)
        except ValueError:
            continue
        # Figure to use is 0–1 scale; convert to percentage
        if figure <= 1.0:
            figure = round(figure * 100, 2)
        hanretty_by_name[normalise(raw_name)] = (raw_name, figure)

    print(f"  Leave share entries parsed: {len(hanretty_by_name)}")

    # Load all constituencies
    print("\n--- Loading constituencies ---")
    constituencies = fetch_all("constituencies", "id,name,ons_code")
    print(f"  {len(constituencies)} constituencies loaded")

    # Match and update
    matched = 0
    unmatched = []

    for con in constituencies:
        norm = normalise(con["name"])
        entry = hanretty_by_name.get(norm)
        if entry is None:
            unmatched.append(con["name"])
            continue

        leave_pct = entry[1]
        _req(
            "PATCH",
            "constituencies",
            SERVICE_KEY,
            body={"leave_vote_share": leave_pct},
            params={"id": f"eq.{con['id']}"},
        )
        matched += 1

    print(f"\n--- Results ---")
    print(f"  Matched and updated: {matched}")
    print(f"  Unmatched (no Hanretty entry): {len(unmatched)}")

    if unmatched:
        print(f"\n  Unmatched constituencies ({len(unmatched)}):")
        for name in sorted(unmatched)[:40]:
            print(f"    - {name}")
        if len(unmatched) > 40:
            print(f"    ... and {len(unmatched) - 40} more")

    # Show sample of matched values
    print("\n--- Sample leave vote shares (spot check) ---")
    sample = fetch_all(
        "constituencies",
        "name,leave_vote_share",
        {"leave_vote_share": "not.is.null", "order": "leave_vote_share.desc", "limit": "10"},
    )
    for s in sample:
        print(f"  {s['name']}: {s['leave_vote_share']}%")

    print("\n" + "=" * 65)
    print(f"DONE — {matched} constituencies updated with Leave vote share")
    print("=" * 65)


if __name__ == "__main__":
    main()
