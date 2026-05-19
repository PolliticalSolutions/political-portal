"""
import_section85_flags.py — Import manually-curated Section 85 priority flags
into political_alerts as by_election_risk alerts.

Source: section85_priority_flags_combined.csv (Manus research output)

Risk thresholds (months_absent):
  >= 5  → risk_level=critical  (or 99 = never attended)
  >= 4  → risk_level=high
  < 4   → skip (not yet at risk)

Deduplicates on title + local_authority_id + is_active = true.

Usage:
    python scripts/import_section85_flags.py [--file <path>] [--dry-run]
"""

import csv
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

_SSL_CTX = ssl._create_unverified_context()

# ── Connection ─────────────────────────────────────────────────────────────────

SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"

SERVICE_KEY = ""
_env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
try:
    with open(_env_path, encoding="utf-8") as _f:
        for _line in _f:
            if _line.strip().startswith("SUPABASE_SERVICE_KEY="):
                SERVICE_KEY = _line.strip().split("=", 1)[1].strip().strip('"')
except FileNotFoundError:
    pass
if not SERVICE_KEY:
    SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_KEY not found in .env or environment.")
    sys.exit(1)

DRY_RUN = "--dry-run" in sys.argv

# ── Abolished councils ─────────────────────────────────────────────────────────

ABOLISHED_COUNCILS = {
    "cambridge city council",
    "huntingdonshire district council",
    "fenland district council",
    "east cambridgeshire district council",
    "south cambridgeshire district council",
    "cambridgeshire county council",
}

# ── Resolve file path ──────────────────────────────────────────────────────────

DEFAULT_CSV = os.path.join(
    os.path.dirname(__file__),
    "..", "..", "..", "Downloads", "section85_priority_flags_combined.csv"
)

file_arg = None
for i, arg in enumerate(sys.argv[1:], 1):
    if arg == "--file" and i < len(sys.argv):
        file_arg = sys.argv[i + 1]
        break

if not file_arg:
    # Try sibling of scripts dir
    file_arg = os.path.join(
        os.path.expanduser("~"), "Downloads", "section85_priority_flags_combined.csv"
    )

if not os.path.exists(file_arg):
    print(f"ERROR: File not found: {file_arg}")
    print("Usage: python scripts/import_section85_flags.py [--file <path>]")
    sys.exit(1)

print(f"Reading: {file_arg}")

# ── Supabase helpers ───────────────────────────────────────────────────────────

def _headers(extra=None):
    h = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _get(path, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{path}?{params}"
    req = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
        return json.loads(resp.read())


def _post(table, payload):
    if DRY_RUN:
        print(f"    [dry-run] INSERT {table}: {payload.get('title', '')}")
        return
    body = json.dumps([payload]).encode()
    req = urllib.request.Request(
        url=f"{SUPABASE_URL}/rest/v1/{table}",
        data=body,
        headers=_headers({"Prefer": "return=minimal"}),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"POST {table} [{exc.code}]: {detail}") from exc

# ── Authority name resolution ──────────────────────────────────────────────────

print("Loading local authority index…")
try:
    authorities_raw = _get("local_authorities", "select=id,name&limit=1000")
    authority_map = {a["name"].strip().lower(): a["id"] for a in authorities_raw}
    print(f"  {len(authority_map)} authorities loaded.")
except Exception as exc:
    print(f"ERROR: Could not load local_authorities: {exc}")
    sys.exit(1)


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


_bare_authority_map = {_bare_name(k): v for k, v in authority_map.items()}


def _resolve_authority(name):
    """Three-pass match: exact → substring → bare-name normalisation."""
    key = name.strip().lower()
    if not key:
        return None
    if key in authority_map:
        return authority_map[key]
    if len(key) >= 4:
        for auth_name, auth_id in authority_map.items():
            if key in auth_name or auth_name in key:
                return auth_id
    bare = _bare_name(key)
    if bare and bare in _bare_authority_map:
        return _bare_authority_map[bare]
    return None

# ── Alert dedup ────────────────────────────────────────────────────────────────

def alert_exists(title, authority_id):
    params = (
        f"select=id"
        f"&alert_type=eq.by_election_risk"
        f"&title=eq.{urllib.parse.quote(title)}"
        f"&local_authority_id=eq.{urllib.parse.quote(str(authority_id))}"
        f"&is_active=eq.true"
        f"&limit=1"
    )
    try:
        rows = _get("political_alerts", params)
        return len(rows) > 0
    except Exception:
        return False

# ── Parse months_absent ────────────────────────────────────────────────────────

def parse_months(val):
    """Return float months or None. 99 means 'never attended'."""
    if not val or not str(val).strip():
        return None
    try:
        return float(str(val).strip())
    except ValueError:
        return None

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    sys.stdout.reconfigure(encoding="utf-8")

    print("=" * 70)
    print("SECTION 85 FLAGS IMPORT" + ("  [DRY RUN]" if DRY_RUN else ""))
    print("Statutory basis: Section 85, Local Government Act 1972")
    print("=" * 70)
    print()

    stats = {
        "read": 0,
        "abolished": 0,
        "below_threshold": 0,
        "unmatched": 0,
        "inserted": 0,
        "existing": 0,
        "errors": 0,
    }

    with open(file_arg, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)

    stats["read"] = len(rows)
    print(f"Rows read: {stats['read']}")
    print()

    for row in rows:
        council_name = (row.get("council_name") or "").strip()
        councillor_name = (row.get("councillor_name") or "").strip()
        ward = (row.get("ward") or "").strip() or None
        party = (row.get("party") or "").strip() or None
        last_attended = (row.get("last_attended_date") or "").strip()
        source_url = (row.get("source_url") or "").strip() or None
        months_raw = row.get("months_absent", "")

        if council_name.lower() in ABOLISHED_COUNCILS:
            stats["abolished"] += 1
            continue

        months = parse_months(months_raw)
        if months is None or months < 4.0:
            stats["below_threshold"] += 1
            continue

        # Determine risk classification
        if months >= 6 or months == 99:
            risk_status = "vacant"
            alert_risk_level = "critical"
        elif months >= 5:
            risk_status = "critical"
            alert_risk_level = "critical"
        else:
            risk_status = "elevated"
            alert_risk_level = "high"

        auth_id = _resolve_authority(council_name)
        if not auth_id:
            print(f"  UNMATCHED: {council_name}")
            stats["unmatched"] += 1
            continue

        display_name = councillor_name.title()

        title = f"By-election Risk: {display_name}"
        if ward:
            title += f" ({ward})"

        ward_str = f", {ward}" if ward else ""
        last_date = None if (last_attended.lower().startswith("never") or not last_attended) else last_attended

        try:
            if alert_exists(title, auth_id):
                print(f"  SKIP (exists): {display_name}{ward_str} — {months}mo {risk_status}")
                stats["existing"] += 1
                continue

            now_iso = datetime.utcnow().isoformat() + "Z"
            summary = (
                f"{display_name} ({party or 'Unknown party'}{ward_str}) has not attended "
                f"a qualifying meeting for {months} months — {risk_status} under Section 85 LGA 1972."
            )

            detail = json.dumps({
                "councillorName": display_name,
                "ward": ward,
                "party": party,
                "lastAttendanceDate": last_date,
                "monthsElapsed": months,
                "riskStatus": risk_status,
                "sourceUrl": source_url,
            })

            payload = {
                "alert_type": "by_election_risk",
                "risk_level": alert_risk_level,
                "title": title,
                "summary": summary,
                "detail": detail,
                "is_active": True,
                "local_authority_id": str(auth_id),
                "created_at": now_iso,
                "updated_at": now_iso,
            }

            _post("political_alerts", payload)
            print(f"  INSERTED ({risk_status}): {display_name}{ward_str} — {months}mo")
            stats["inserted"] += 1

        except Exception as exc:
            print(f"  ERROR: {display_name} ({council_name}): {exc}")
            stats["errors"] += 1

    print()
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"  Rows read:                    {stats['read']:>4}")
    print(f"  Abolished council (skipped):  {stats['abolished']:>4}")
    print(f"  Below threshold (<4 months):  {stats['below_threshold']:>4}")
    print(f"  Council unmatched (skipped):  {stats['unmatched']:>4}")
    print(f"  Alerts inserted:              {stats['inserted']:>4}")
    print(f"  Already existed (skipped):    {stats['existing']:>4}")
    print(f"  Errors:                       {stats['errors']:>4}")
    if DRY_RUN:
        print()
        print("  [DRY RUN — no alerts were written to Supabase]")
    print("=" * 70)
    sys.exit(0)


if __name__ == "__main__":
    main()
