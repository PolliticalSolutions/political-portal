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
import re
import ssl
import sys
import urllib.request
import urllib.error
from datetime import datetime

_SSL_CTX = ssl._create_unverified_context()

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

# ── Abolished councils — do not import attendance data for these ───────────────
# Cambridgeshire district/county councils abolished 1 April 2026 (LGR).
# Cross-referenced against Manus Step 1 report.

ABOLISHED_COUNCILS = {
    "cambridge city council",
    "huntingdonshire district council",
    "fenland district council",
    "east cambridgeshire district council",
    "south cambridgeshire district council",
    "cambridgeshire county council",
}

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
    with urllib.request.urlopen(req, context=_SSL_CTX) as resp:
        return json.loads(resp.read())

def _upsert(table, rows):
    if DRY_RUN:
        print(f"  [dry-run] Would upsert {len(rows)} row(s) into {table}")
        return
    body = json.dumps(rows).encode()
    conflict_cols = "local_authority_id,councillor_name,meeting_type,period_start,period_end"
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={conflict_cols}"
    req = urllib.request.Request(url, data=body, headers=_headers(), method="POST")
    try:
        with urllib.request.urlopen(req, context=_SSL_CTX) as resp:
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

_LONDON_PREFIX = re.compile(r'^london borough of\s+', re.IGNORECASE)
_COUNCIL_SUFFIX = re.compile(
    r'\s+(london borough council|london borough|metropolitan borough council|'
    r'borough council|city council|county council|district council|council)$',
    re.IGNORECASE,
)

def _bare_name(name):
    """Strip 'London Borough of' prefix and trailing council-type suffixes."""
    n = _LONDON_PREFIX.sub('', name.strip().lower())
    n = _COUNCIL_SUFFIX.sub('', n)
    return n.strip()

# Secondary lookup keyed by bare name — resolves "London Borough of X" → "X London Borough Council"
_bare_authority_map = {_bare_name(k): v for k, v in authority_map.items()}


def _resolve_authority(name):
    """Three-pass match: exact → substring → bare-name normalisation."""
    key = name.strip().lower()
    if not key:
        return None
    if key in authority_map:
        return authority_map[key]
    # Substring fallback — only match if key is at least 4 chars to avoid false positives
    if len(key) >= 4:
        for auth_name, auth_id in authority_map.items():
            if key in auth_name or auth_name in key:
                return auth_id
    # Bare-name normalisation — handles "London Borough of X" vs "X London Borough Council"
    bare = _bare_name(key)
    if bare and bare in _bare_authority_map:
        return _bare_authority_map[bare]
    return None

# Default period for rows with no period dates — represents 2025-26 municipal year.
# Manus data from local-democracy.uk API does not include period dates.
DEFAULT_PERIOD_START = "2025-05-01"
DEFAULT_PERIOD_END = "2026-04-30"

rows_to_upsert = []
skipped = []

with open(file_arg, newline="", encoding="utf-8-sig") as fh:
    reader = csv.DictReader(fh)
    for i, row in enumerate(reader, start=2):  # row 1 = header
        # Accept council_name as alias for local_authority_name (Manus CSV format)
        auth_name = (
            row.get("local_authority_name", "").strip()
            or row.get("council_name", "").strip()
        )

        if auth_name.lower() in ABOLISHED_COUNCILS:
            skipped.append(f"  Row {i}: '{auth_name}' abolished on or before 1 Apr 2026 — skipped")
            continue

        auth_id = _resolve_authority(auth_name)

        if not auth_id:
            skipped.append(f"  Row {i}: authority not found '{auth_name}'")
            continue

        name = row.get("councillor_name", "").strip().title()
        if not name:
            skipped.append(f"  Row {i}: councillor_name is blank")
            continue

        eligible_raw = str(row.get("meetings_eligible", "") or "").strip()
        attended_raw = str(row.get("meetings_attended", "") or "").strip()
        if not eligible_raw and not attended_raw:
            skipped.append(f"  Row {i}: no attendance data for {name} — membership row skipped")
            continue

        try:
            eligible = int(eligible_raw or 0)
            attended = int(attended_raw or 0)
        except ValueError:
            skipped.append(f"  Row {i}: invalid attendance figures for {name}")
            continue

        if attended > eligible:
            skipped.append(f"  Row {i}: attended ({attended}) > eligible ({eligible}) for {name}")
            continue

        meeting_type = (row.get("meeting_type", "").strip() or None)
        if meeting_type and len(meeting_type) > 50:
            meeting_type = meeting_type[:50]
        period_start = row.get("period_start", "").strip() or DEFAULT_PERIOD_START
        period_end = row.get("period_end", "").strip() or DEFAULT_PERIOD_END

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
            "import_notes": (row.get("import_notes", "") or row.get("data_source", "")).strip() or None,
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

# ── Deduplicate on conflict key (keep row with higher meetings_eligible) ───────

dedup: dict = {}
for r in rows_to_upsert:
    key = (r["local_authority_id"], r["councillor_name"],
           r.get("meeting_type"), r["period_start"], r["period_end"])
    existing = dedup.get(key)
    if existing is None or r["meetings_eligible"] > existing["meetings_eligible"]:
        dedup[key] = r
rows_to_upsert = list(dedup.values())

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
