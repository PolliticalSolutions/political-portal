"""
import_councillor_attendance.py — Import councillor attendance data from CSV.

Usage:
    python scripts/import_councillor_attendance.py --file <path_to_csv>
    python scripts/import_councillor_attendance.py --file scripts/templates/councillor_attendance_template.csv --dry-run

CSV columns (see scripts/templates/councillor_attendance_template.csv):
    local_authority_name, councillor_name, ward, party, meeting_type,
    meetings_eligible, meetings_attended, period_start, period_end,
    source_url, import_notes

Prerequisite: run docs/councillor_attendance_ddl.sql in Supabase first.
"""

import csv
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime

SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"
SUPABASE_SERVICE_KEY = ""
_env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
try:
    with open(_env_path) as _f:
        for _line in _f:
            if _line.strip().startswith("SUPABASE_SERVICE_KEY="):
                SUPABASE_SERVICE_KEY = _line.strip().split("=", 1)[1].strip().strip('"')
except FileNotFoundError:
    pass
if not SUPABASE_SERVICE_KEY:
    SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

DRY_RUN = "--dry-run" in sys.argv

# ── Resolve file path ──────────────────────────────────────────────────────────

file_arg = None
for i, arg in enumerate(sys.argv[1:], 1):
    if arg == "--file" and i < len(sys.argv):
        file_arg = sys.argv[i + 1]
        break

if not file_arg:
    print("Usage: python scripts/import_councillor_attendance.py --file <path_to_csv>")
    sys.exit(1)

if not os.path.exists(file_arg):
    print(f"ERROR: File not found: {file_arg}")
    sys.exit(1)

# ── Supabase helpers ───────────────────────────────────────────────────────────

def _headers():
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

def _get(path, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{path}?{params}"
    req = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def _upsert(table, rows):
    if DRY_RUN:
        print(f"  [dry-run] Would upsert {len(rows)} row(s) into {table}")
        return
    body = json.dumps(rows).encode()
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    req = urllib.request.Request(url, data=body, headers=_headers(), method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"Upsert to {table} failed [{exc.code}]: {detail}") from exc

# ── Load authority name → id map ───────────────────────────────────────────────

print("Loading local authority index…")
try:
    authorities = _get("local_authorities", "select=id,name&limit=1000")
    authority_map = {a["name"].strip().lower(): a["id"] for a in authorities}
    print(f"  {len(authority_map)} authorities loaded.")
except Exception as exc:
    print(f"ERROR: Could not load local_authorities: {exc}")
    sys.exit(1)

# ── Read and validate CSV ──────────────────────────────────────────────────────

def _resolve_authority(name):
    """Case-insensitive substring match against authority names."""
    key = name.strip().lower()
    if key in authority_map:
        return authority_map[key]
    # Substring fallback
    for auth_name, auth_id in authority_map.items():
        if key in auth_name or auth_name in key:
            return auth_id
    return None

rows_to_upsert = []
skipped = []

with open(file_arg, newline="", encoding="utf-8-sig") as fh:
    reader = csv.DictReader(fh)
    for i, row in enumerate(reader, start=2):  # row 1 = header
        auth_name = row.get("local_authority_name", "").strip()
        auth_id = _resolve_authority(auth_name)

        if not auth_id:
            skipped.append(f"  Row {i}: authority not found '{auth_name}'")
            continue

        name = row.get("councillor_name", "").strip()
        if not name:
            skipped.append(f"  Row {i}: councillor_name is blank")
            continue

        try:
            eligible = int(row.get("meetings_eligible", 0))
            attended = int(row.get("meetings_attended", 0))
        except ValueError:
            skipped.append(f"  Row {i}: invalid attendance figures for {name}")
            continue

        if attended > eligible:
            skipped.append(f"  Row {i}: attended ({attended}) > eligible ({eligible}) for {name}")
            continue

        meeting_type = row.get("meeting_type", "").strip() or None
        period_start = row.get("period_start", "").strip()
        period_end = row.get("period_end", "").strip()

        if not period_start or not period_end:
            skipped.append(f"  Row {i}: period_start/period_end required for {name}")
            continue

        rows_to_upsert.append({
            "local_authority_id": auth_id,
            "councillor_name": name,
            "ward": row.get("ward", "").strip() or None,
            "party": row.get("party", "").strip() or None,
            "meeting_type": meeting_type,
            "meetings_eligible": eligible,
            "meetings_attended": attended,
            "period_start": period_start,
            "period_end": period_end,
            "source_url": row.get("source_url", "").strip() or None,
            "import_notes": row.get("import_notes", "").strip() or None,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        })

# ── Report skips ───────────────────────────────────────────────────────────────

if skipped:
    print(f"\nSkipped {len(skipped)} row(s):")
    for msg in skipped:
        print(msg)

if not rows_to_upsert:
    print("\nNo rows to import. Exiting.")
    sys.exit(0)

# ── Preview ────────────────────────────────────────────────────────────────────

low_attendance = [r for r in rows_to_upsert if r["meetings_eligible"] > 0
                  and (r["meetings_attended"] / r["meetings_eligible"]) < 0.5]

print(f"\nReady to import {len(rows_to_upsert)} row(s).")
print(f"  Low attendance (<50%): {len(low_attendance)} councillor(s)")

# ── Upsert in batches ──────────────────────────────────────────────────────────

BATCH = 50
imported = 0
for start in range(0, len(rows_to_upsert), BATCH):
    batch = rows_to_upsert[start:start + BATCH]
    try:
        _upsert("councillor_attendance", batch)
        imported += len(batch)
        print(f"  Upserted rows {start + 1}–{start + len(batch)}")
    except RuntimeError as exc:
        # Check for missing table gracefully
        if "does not exist" in str(exc) or "relation" in str(exc).lower():
            print("\nERROR: councillor_attendance table does not exist.")
            print("Run docs/councillor_attendance_ddl.sql in Supabase SQL Editor first.")
            sys.exit(1)
        raise

print(f"\nDone. {imported} rows imported. {len(skipped)} skipped.")
if low_attendance:
    print(f"\nLow attendance councillors (<50%):")
    for r in low_attendance:
        pct = round((r["meetings_attended"] / r["meetings_eligible"]) * 100, 1)
        print(f"  {r['councillor_name']} ({r.get('ward','?')}, {r.get('party','?')}): {pct}%")
