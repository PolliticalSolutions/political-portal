"""
Import first_elected_year for Conservative 2024 MPs using existing Supabase results data.

Logic:
  For each Conservative 2024 General Election winner:
    - If the same constituency also had a Conservative winner in the 2019 notional election
      (same constituency_id, same 2024 boundaries), the 2024 MP was already sitting before
      2024 — set first_elected_year = 2019.
    - If no Conservative won that constituency in the 2019 notional election, the seat was
      gained in 2024 — set first_elected_year = 2024 (first-term MP).

  Candidates where first_elected_year is already populated are skipped.

The 2019 notional election uses 2024 boundaries (same constituency UUIDs), so
constituency_id matching works directly without a crosswalk.

Note: MPs who held their seat pre-2019 cannot be distinguished from 2019-elected MPs
using only constituency-level data. Both are labelled 2019. This means the incumbency
boost (first_elected_year >= 2019) will apply to returning pre-2019 MPs — a known
limitation of this approach.

DDL required (run in Supabase SQL Editor first if not already done):
  ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS first_elected_year SMALLINT;
  ALTER TABLE public.vulnerability_scores ADD COLUMN IF NOT EXISTS incumbency_boost BOOLEAN DEFAULT FALSE;

Usage:
  python scripts/import_first_elected_year_from_db.py [--dry-run]

Flags:
  --dry-run  Print proposed updates without writing to Supabase.
"""

import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"
ANON_KEY = "sb_publishable_A7AT-20ghVjk_BNk8ZnH0A_vKJKIxh-"

CON_ID = "a4f20caf-ba89-4fb0-9ae3-313a7f937719"

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


def _sb_req(method, path, key, body=None, params=None, prefer=None):
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
        params = {"select": select, "limit": "1000", "offset": str(offset)}
        if filters:
            params.update(filters)
        data = _sb_req("GET", table, k, params=params)
        results.extend(data or [])
        if len(data or []) < 1000:
            break
        offset += 1000
    return results


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    dry_run = "--dry-run" in sys.argv

    print("=" * 65)
    print("IMPORT — first_elected_year from Supabase results data")
    if dry_run:
        print("MODE: DRY RUN — no writes will be made")
    print("=" * 65)

    if not SERVICE_KEY:
        print("ERROR: SUPABASE_SERVICE_KEY not found in .env")
        sys.exit(1)

    # ── Verify column exists ───────────────────────────────────────────────────
    print("\n--- Checking candidates table ---")
    sample = _sb_req("GET", "candidates", ANON_KEY,
                     params={"select": "id,first_elected_year", "limit": "1"})
    if sample and "first_elected_year" not in sample[0]:
        print("ERROR: first_elected_year column missing.")
        print("Run DDL: ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS first_elected_year SMALLINT;")
        sys.exit(1)
    print("  Column first_elected_year exists.")

    # ── Find elections ─────────────────────────────────────────────────────────
    print("\n--- Finding elections ---")
    elections = fetch_all(
        "elections", "id,election_date,election_type,name",
        {"election_type": "eq.general", "order": "election_date.desc"},
    )
    el_2024 = next((e for e in elections if e["election_date"].startswith("2024")), None)
    if not el_2024:
        print("ERROR: 2024 general election not found.")
        sys.exit(1)
    print(f"  2024 GE: {el_2024['name']} ({el_2024['id']})")

    # The 2019 notional election uses 2024 boundaries — same constituency UUIDs
    notional = fetch_all(
        "elections", "id,election_date,election_type,name",
        {"election_type": "eq.notional"},
    )
    el_2019_notional = next((e for e in notional if e["election_date"].startswith("2019")), None)
    if not el_2019_notional:
        print("ERROR: 2019 notional election not found.")
        sys.exit(1)
    print(f"  2019 notional: {el_2019_notional['name']} ({el_2019_notional['id']})")

    # ── Load 2024 Conservative winners ────────────────────────────────────────
    print("\n--- Loading 2024 Conservative winners ---")
    winners_2024 = fetch_all(
        "results",
        "constituency_id,candidate_id,candidates(id,first_name,last_name,first_elected_year),constituencies(name)",
        {
            "election_id": f"eq.{el_2024['id']}",
            "party_id": f"eq.{CON_ID}",
            "is_winner": "eq.true",
        },
    )
    print(f"  {len(winners_2024)} Conservative 2024 winners found")

    # ── Load 2019 notional Conservative winners (constituency_ids only) ────────
    print("\n--- Loading 2019 notional Conservative winners ---")
    winners_2019 = fetch_all(
        "results",
        "constituency_id",
        {
            "election_id": f"eq.{el_2019_notional['id']}",
            "party_id": f"eq.{CON_ID}",
            "is_winner": "eq.true",
        },
    )
    con_2019_constituencies = {r["constituency_id"] for r in winners_2019}
    print(f"  {len(con_2019_constituencies)} constituencies where Con won in 2019 notional")

    # ── Classify each 2024 winner ──────────────────────────────────────────────
    print("\n--- Classifying candidates ---")
    updates = []       # (candidate_id, year, name, constituency, reason)
    already_set = []
    no_candidate_id = []

    for w in winners_2024:
        cand = w.get("candidates") or {}
        con = w.get("constituencies") or {}
        cid = cand.get("id")
        existing = cand.get("first_elected_year")
        name = f"{cand.get('first_name', '')} {cand.get('last_name', '')}".strip()
        con_name = con.get("name", "?")

        if not cid:
            no_candidate_id.append(con_name)
            continue

        if existing is not None:
            already_set.append(f"{name} (already {existing})")
            continue

        constituency_id = w["constituency_id"]
        if constituency_id in con_2019_constituencies:
            year = 2019
            reason = "Con held seat in 2019 notional"
        else:
            year = 2024
            reason = "Seat gained in 2024 (no Con win in 2019 notional)"

        updates.append({
            "candidate_id": cid,
            "first_elected_year": year,
            "name": name,
            "constituency": con_name,
            "reason": reason,
        })

    new_2024 = [u for u in updates if u["first_elected_year"] == 2024]
    returning  = [u for u in updates if u["first_elected_year"] == 2019]

    print(f"  To update:      {len(updates)}")
    print(f"    → 2024 (new): {len(new_2024)}")
    print(f"    → 2019 (returning/pre-2019): {len(returning)}")
    print(f"  Already set:    {len(already_set)}")
    if no_candidate_id:
        print(f"  No candidate_id (skipped): {len(no_candidate_id)}")

    print("\n--- New 2024 MPs (first-term, seat gained) ---")
    for u in sorted(new_2024, key=lambda x: x["constituency"]):
        print(f"  {u['name']} — {u['constituency']}")

    print(f"\n--- Returning MPs (set to 2019, {len(returning)} total) ---")
    for u in sorted(returning, key=lambda x: x["constituency"])[:20]:
        print(f"  {u['name']} — {u['constituency']}")
    if len(returning) > 20:
        print(f"  ... and {len(returning) - 20} more")

    # ── Write ──────────────────────────────────────────────────────────────────
    if dry_run:
        print("\n--- DRY RUN: no writes made ---")
        print(f"  Would update {len(updates)} candidates")
    else:
        print(f"\n--- Writing {len(updates)} first_elected_year values ---")
        written, errors = 0, []
        for u in updates:
            try:
                _sb_req(
                    "PATCH", "candidates", SERVICE_KEY,
                    body={"first_elected_year": u["first_elected_year"]},
                    params={"id": f"eq.{u['candidate_id']}"},
                )
                written += 1
            except RuntimeError as err:
                errors.append(f"{u['name']}: {err}")

        print(f"  Updated: {written}")
        if errors:
            print(f"  Errors ({len(errors)}):")
            for e in errors:
                print(f"    {e}")

        # ── Rerun vulnerability scorer ─────────────────────────────────────────
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
            for line in result.stdout.splitlines():
                if any(kw in line for kw in ["===", "---", "Scored", "distribution", "Critical",
                                             "High", "Medium", "Low", "boost", "DONE", "ERROR",
                                             "incumbency", "Inserted"]):
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
