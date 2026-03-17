"""
Import first_elected_year for Conservative 2024 MPs from TheyWorkForYou API.

For each Conservative winner in the 2024 General Election:
  1. Matches the candidate by name to a TWFY MP record
  2. Extracts entered_house (the date the MP first entered Parliament, career-spanning)
  3. Converts to a year and writes to candidates.first_elected_year
  4. Reruns calculate_vulnerability.py so the incumbency boost activates

TheyWorkForYou API endpoint used:
  GET https://www.theyworkforyou.com/api/getMPs?output=json&key=KEY

API key: set VITE_TWFY_API_KEY in .env
Register at: https://www.theyworkforyou.com/api/key

DDL required (run in Supabase SQL Editor first):
  ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS first_elected_year SMALLINT;

Usage:
  python scripts/import_first_elected_year.py [--dry-run]

Flags:
  --dry-run  Print matches and proposed updates without writing to Supabase
"""

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"
ANON_KEY = "sb_publishable_A7AT-20ghVjk_BNk8ZnH0A_vKJKIxh-"

TWFY_BASE = "https://www.theyworkforyou.com/api"
CON_ID = "a4f20caf-ba89-4fb0-9ae3-313a7f937719"
EL_2024_DATE = "2024-07-04"

# Honorifics stripped before name matching
HONORIFICS = re.compile(
    r"\b(sir|dame|dr|mr|mrs|ms|miss|lord|lady|professor|prof|rev|reverend|the rt hon|rt hon)\b\.?",
    re.IGNORECASE,
)

# ── helpers ──────────────────────────────────────────────────────────────────

SERVICE_KEY = None
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
TWFY_API_KEY = None

if os.path.exists(env_path):
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("SUPABASE_SERVICE_KEY="):
                SERVICE_KEY = line.split("=", 1)[1]
            elif line.startswith("VITE_TWFY_API_KEY="):
                TWFY_API_KEY = line.split("=", 1)[1]

if not SERVICE_KEY:
    SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
if not TWFY_API_KEY:
    TWFY_API_KEY = os.environ.get("VITE_TWFY_API_KEY")


def _sb_req(method, path, body=None, params=None, prefer=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
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


def _sb_get(path, params):
    url = f"{SUPABASE_URL}/rest/v1/{path}?" + urllib.parse.urlencode(params)
    headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}", "Accept": "application/json"}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def fetch_all(table, select, filters=None):
    results, offset = [], 0
    while True:
        params = {"select": select, "limit": "1000", "offset": str(offset)}
        if filters:
            params.update(filters)
        data = _sb_get(table, params)
        results.extend(data or [])
        if len(data or []) < 1000:
            break
        offset += 1000
    return results


def normalise_name(name):
    """Remove honorifics, lowercase, strip punctuation for fuzzy matching."""
    name = HONORIFICS.sub("", name)
    name = re.sub(r"[^a-z ]", "", name.lower())
    return re.sub(r"\s+", " ", name).strip()


def twfy_get(endpoint, params):
    params["output"] = "json"
    params["key"] = TWFY_API_KEY
    url = f"{TWFY_BASE}/{endpoint}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "PoliticalPortal/1.0 (political intelligence platform)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"TWFY HTTP {e.code}: {e.read().decode()}") from e


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    dry_run = "--dry-run" in sys.argv

    print("=" * 65)
    print("IMPORT — first_elected_year via TheyWorkForYou API")
    if dry_run:
        print("MODE: DRY RUN — no writes will be made")
    print("=" * 65)

    # ── API key check ────────────────────────────────────────────────────────
    if not TWFY_API_KEY:
        print()
        print("ERROR: VITE_TWFY_API_KEY not found.")
        print()
        print("  The TheyWorkForYou API requires a free key.")
        print("  Register at: https://www.theyworkforyou.com/api/key")
        print()
        print("  Once you have it, add to your .env file:")
        print("    VITE_TWFY_API_KEY=your_key_here")
        print()
        sys.exit(1)

    if not SERVICE_KEY:
        print("ERROR: SUPABASE_SERVICE_KEY not found in .env")
        sys.exit(1)

    # ── Verify first_elected_year column exists ───────────────────────────────
    print("\n--- Checking candidates table ---")
    sample = _sb_get("candidates", {"select": "id,first_elected_year", "limit": "1"})
    if sample and "first_elected_year" not in sample[0]:
        print("ERROR: first_elected_year column not found on candidates table.")
        print("Run DDL: ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS first_elected_year SMALLINT;")
        sys.exit(1)
    print("  Column first_elected_year exists.")

    # ── Load 2024 Conservative winners ───────────────────────────────────────
    print("\n--- Loading 2024 Conservative winners ---")
    elections = _sb_get("elections", {
        "select": "id",
        "election_date": f"eq.{EL_2024_DATE}",
        "election_type": "eq.general",
    })
    if not elections:
        print("ERROR: 2024 general election not found.")
        sys.exit(1)
    el_id = elections[0]["id"]

    winners = fetch_all(
        "results",
        "candidate_id,constituencies(name,ons_code),candidates(id,first_name,last_name,first_elected_year)",
        {"election_id": f"eq.{el_id}", "party_id": f"eq.{CON_ID}", "is_winner": "eq.true"},
    )
    print(f"  {len(winners)} Conservative 2024 winners loaded")

    # ── Fetch TWFY MP list ────────────────────────────────────────────────────
    print("\n--- Fetching MP list from TheyWorkForYou ---")
    twfy_mps = twfy_get("getMPs", {"party": "Conservative"})

    if isinstance(twfy_mps, dict) and "error" in twfy_mps:
        print(f"ERROR from TWFY: {twfy_mps['error']}")
        sys.exit(1)

    print(f"  {len(twfy_mps)} Conservative MPs returned by TWFY")

    # Build normalised name → MP map from TWFY
    twfy_by_norm = {}
    twfy_by_last = {}
    for mp in twfy_mps:
        full_name = mp.get("name", "")
        norm = normalise_name(full_name)
        twfy_by_norm[norm] = mp
        # Also index by last name for fallback matching
        parts = norm.split()
        if parts:
            last = parts[-1]
            twfy_by_last.setdefault(last, []).append((norm, mp))

    # ── Match and build update list ───────────────────────────────────────────
    print("\n--- Matching candidates to TWFY records ---")

    updates = []          # (candidate_id, first_elected_year, candidate_name, twfy_name, entered_house)
    unmatched = []
    already_set = []

    for w in winners:
        cand = w.get("candidates") or {}
        con = w.get("constituencies") or {}
        cid = cand.get("id")
        first = (cand.get("first_name") or "").strip()
        last = (cand.get("last_name") or "").strip()
        existing_year = cand.get("first_elected_year")

        if not cid or not last:
            continue

        if existing_year is not None:
            already_set.append(f"{first} {last} (already {existing_year})")
            continue

        db_norm = normalise_name(f"{first} {last}")

        # Attempt 1: exact normalised name match
        mp = twfy_by_norm.get(db_norm)

        # Attempt 2: last-name match, disambiguate by first initial
        if mp is None:
            last_norm = normalise_name(last)
            candidates_for_last = twfy_by_last.get(last_norm, [])
            if len(candidates_for_last) == 1:
                mp = candidates_for_last[0][1]
            elif len(candidates_for_last) > 1:
                first_initial = first[0].lower() if first else ""
                for (norm, candidate_mp) in candidates_for_last:
                    parts = norm.split()
                    if parts and parts[0].startswith(first_initial):
                        mp = candidate_mp
                        break

        if mp is None:
            unmatched.append(f"{first} {last} (constituency: {con.get('name', '?')})")
            continue

        entered = mp.get("entered_house", "")  # format: "YYYY-MM-DD" or "YYYY-MM"
        if not entered:
            unmatched.append(f"{first} {last} — no entered_house in TWFY record")
            continue

        year = int(entered[:4])
        updates.append({
            "candidate_id": cid,
            "first_elected_year": year,
            "db_name": f"{first} {last}",
            "twfy_name": mp.get("name", ""),
            "entered_house": entered,
            "constituency": con.get("name", ""),
        })

    print(f"  Matched:      {len(updates)}")
    print(f"  Unmatched:    {len(unmatched)}")
    print(f"  Already set:  {len(already_set)}")

    if unmatched:
        print("\n  Unmatched candidates:")
        for u in unmatched:
            print(f"    - {u}")

    if already_set:
        print("\n  Already had first_elected_year (skipped):")
        for a in already_set:
            print(f"    - {a}")

    # ── Show year distribution ────────────────────────────────────────────────
    if updates:
        print("\n--- Year distribution for matched MPs ---")
        from collections import Counter
        year_counts = Counter(u["first_elected_year"] for u in updates)
        for year in sorted(year_counts):
            bar = "█" * year_counts[year]
            print(f"  {year}: {bar} ({year_counts[year]})")

        new_since_2019 = [u for u in updates if u["first_elected_year"] >= 2019]
        print(f"\n  First elected 2019 or later (will receive incumbency boost): {len(new_since_2019)}")
        for u in sorted(new_since_2019, key=lambda x: x["first_elected_year"]):
            print(f"    {u['first_elected_year']}  {u['db_name']} — {u['constituency']}")

    # ── Write to Supabase ─────────────────────────────────────────────────────
    if dry_run:
        print("\n--- DRY RUN: no writes made ---")
        print(f"  Would update {len(updates)} candidates")
    else:
        print(f"\n--- Writing {len(updates)} first_elected_year values ---")
        written = 0
        errors = []
        for u in updates:
            try:
                _sb_req(
                    "PATCH",
                    "candidates",
                    body={"first_elected_year": u["first_elected_year"]},
                    params={"id": f"eq.{u['candidate_id']}"},
                )
                written += 1
            except RuntimeError as err:
                errors.append(f"{u['db_name']}: {err}")

        print(f"  Updated: {written}")
        if errors:
            print(f"  Errors ({len(errors)}):")
            for e in errors:
                print(f"    {e}")

        # ── Rerun vulnerability calculator ────────────────────────────────────
        if written > 0:
            print("\n--- Rerunning calculate_vulnerability.py ---")
            script = os.path.join(os.path.dirname(__file__), "calculate_vulnerability.py")
            result = subprocess.run(
                [sys.executable, script],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            # Print the output, filtering for the key lines
            for line in result.stdout.splitlines():
                if any(kw in line for kw in ["===", "---", "Scored", "distribution", "Critical",
                                             "High", "Medium", "Low", "boost", "DONE", "ERROR",
                                             "incumbency"]):
                    print(f"  {line.strip()}")
            if result.returncode != 0:
                print("  WARNING: calculate_vulnerability.py exited with error")
                for line in result.stderr.splitlines()[-10:]:
                    print(f"  STDERR: {line}")
            else:
                print("  Vulnerability scores recalculated successfully")

    print("\n" + "=" * 65)
    print("DONE")
    print("=" * 65)


if __name__ == "__main__":
    main()
