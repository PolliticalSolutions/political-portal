"""
fix_councillor_name_casing.py — Apply title case to councillor names stored
in lowercase in councillor_attendance and political_alerts.

councillor_attendance: patches via filter on the raw lowercase name, so one
  PATCH request covers all rows with the same name (bulk-efficient).

political_alerts: patches row-by-row because each row has a unique
  title/summary/detail combination.

Usage:
    python scripts/fix_councillor_name_casing.py [--dry-run]
"""

import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

_SSL_CTX = ssl._create_unverified_context()

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
    print("ERROR: SUPABASE_SERVICE_KEY not found.")
    sys.exit(1)

DRY_RUN = "--dry-run" in sys.argv


def _headers(extra=None):
    h = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _get(path, params):
    url = f"{SUPABASE_URL}/rest/v1/{path}?{params}"
    req = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
        return json.loads(resp.read())


def _patch(path, filter_params, body):
    if DRY_RUN:
        keys = list(body.keys())
        print(f"    [dry-run] PATCH /{path}?{filter_params[:80]} ← {keys}")
        return
    url = f"{SUPABASE_URL}/rest/v1/{path}?{filter_params}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers=_headers({"Prefer": "return=minimal"}),
        method="PATCH",
    )
    try:
        with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"PATCH {path} [{exc.code}]: {detail}") from exc


def fetch_all(table, select, extra_filter=""):
    rows = []
    limit = 1000
    offset = 0
    while True:
        params = f"select={select}&limit={limit}&offset={offset}"
        if extra_filter:
            params += f"&{extra_filter}"
        batch = _get(table, params)
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return rows


# ── councillor_attendance ──────────────────────────────────────────────────────

def fix_councillor_attendance():
    print("── councillor_attendance ─────────────────────────────────────────")
    rows = fetch_all("councillor_attendance", "id,councillor_name")
    print(f"  Fetched {len(rows)} rows")

    # Build a map of unique lowercase names that need fixing
    name_pairs = {}
    for row in rows:
        name = row.get("councillor_name") or ""
        titled = name.title()
        if name != titled:
            name_pairs[name] = titled

    print(f"  Unique names needing title-case fix: {len(name_pairs)}")
    if not name_pairs:
        print("  Nothing to do.")
        return 0

    # One PATCH per unique old name — updates all rows sharing that name at once
    affected_rows = 0
    patched_names = 0
    for old_name, new_name in sorted(name_pairs.items()):
        count = sum(1 for r in rows if (r.get("councillor_name") or "") == old_name)
        if DRY_RUN:
            print(f"    {repr(old_name)} → {repr(new_name)}  ({count} row(s))")
        else:
            filter_params = f"councillor_name=eq.{urllib.parse.quote(old_name)}"
            _patch("councillor_attendance", filter_params, {"councillor_name": new_name})
            print(f"    ✓ {repr(new_name)}  ({count} row(s))")
        affected_rows += count
        patched_names += 1

    print(f"  Unique names patched: {patched_names}  |  Total rows affected: {affected_rows}")
    return affected_rows


# ── political_alerts ───────────────────────────────────────────────────────────

def fix_political_alerts():
    print("── political_alerts ──────────────────────────────────────────────")
    # No is_active filter — fix all by_election_risk alerts regardless of status
    rows = fetch_all(
        "political_alerts",
        "id,title,summary,detail",
        "alert_type=eq.by_election_risk",
    )
    print(f"  Fetched {len(rows)} rows")

    updated = 0
    skipped_already_ok = 0
    errors = 0

    for row in rows:
        row_id = row["id"]
        title = row.get("title") or ""
        summary = row.get("summary") or ""
        detail_raw = row.get("detail") or ""

        try:
            detail = json.loads(detail_raw) if detail_raw else {}
        except (json.JSONDecodeError, TypeError):
            print(f"    WARN: could not parse detail JSON for id={row_id}")
            errors += 1
            continue

        old_name = detail.get("councillorName") or ""
        if not old_name:
            continue

        new_name = old_name.title()
        if old_name == new_name:
            skipped_already_ok += 1
            continue

        new_title = title.replace(old_name, new_name)
        new_summary = summary.replace(old_name, new_name)
        detail["councillorName"] = new_name
        new_detail = json.dumps(detail)

        patch_body = {
            "title": new_title,
            "summary": new_summary,
            "detail": new_detail,
        }
        filter_params = f"id=eq.{row_id}"

        if DRY_RUN:
            print(f"    [dry-run] id={row_id}: {repr(old_name)} → {repr(new_name)}")
            updated += 1
        else:
            try:
                _patch("political_alerts", filter_params, patch_body)
                print(f"    ✓ {repr(new_name)}")
                updated += 1
            except Exception as exc:
                print(f"    ERROR id={row_id}: {exc}")
                errors += 1

    print(f"  Updated: {updated}  |  Already correct: {skipped_already_ok}  |  Errors: {errors}")
    return updated


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print("=" * 66)
    print("COUNCILLOR NAME CASING FIX" + ("  [DRY RUN]" if DRY_RUN else ""))
    print("=" * 66)
    print()

    att_updated = fix_councillor_attendance()
    print()
    alert_updated = fix_political_alerts()

    print()
    print("=" * 66)
    print("SUMMARY")
    print("=" * 66)
    print(f"  councillor_attendance rows updated:  {att_updated:>6}")
    print(f"  political_alerts rows updated:       {alert_updated:>6}")
    if DRY_RUN:
        print()
        print("  [DRY RUN — no rows were modified]")
    print("=" * 66)


if __name__ == "__main__":
    main()
