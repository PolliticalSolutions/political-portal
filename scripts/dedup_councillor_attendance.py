"""
dedup_councillor_attendance.py — Remove duplicate rows from councillor_attendance.

Duplicate definition: multiple rows sharing (local_authority_id, councillor_name, ward).

Keep rule: row with highest meetings_eligible; tiebreak: latest period_end.
All other rows in the group are deleted.

Usage:
    python scripts/dedup_councillor_attendance.py [--dry-run]
"""

import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from collections import defaultdict

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


def _delete_batch(ids):
    if DRY_RUN:
        print(f"    [dry-run] Would DELETE {len(ids)} rows")
        return
    id_list = ",".join(ids)
    url = f"{SUPABASE_URL}/rest/v1/councillor_attendance?id=in.({id_list})"
    req = urllib.request.Request(
        url,
        headers=_headers({"Prefer": "return=minimal"}),
        method="DELETE",
    )
    try:
        with urllib.request.urlopen(req, timeout=60, context=_SSL_CTX) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"DELETE failed [{exc.code}]: {detail}") from exc


def fetch_all():
    rows = []
    limit = 1000
    offset = 0
    while True:
        batch = _get(
            "councillor_attendance",
            f"select=id,local_authority_id,councillor_name,ward,meetings_eligible,period_end"
            f"&limit={limit}&offset={offset}",
        )
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return rows


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print("=" * 60)
    print("COUNCILLOR ATTENDANCE DEDUPLICATION" + ("  [DRY RUN]" if DRY_RUN else ""))
    print("=" * 60)
    print()

    print("Fetching all rows from councillor_attendance…")
    all_rows = fetch_all()
    total_before = len(all_rows)
    print(f"  Total rows fetched: {total_before}")
    print()

    # Group by (local_authority_id, councillor_name, ward)
    groups = defaultdict(list)
    for row in all_rows:
        key = (
            row.get("local_authority_id") or "",
            (row.get("councillor_name") or "").strip().lower(),
            (row.get("ward") or "").strip().lower(),
        )
        groups[key].append(row)

    dup_groups = {k: v for k, v in groups.items() if len(v) > 1}
    print(f"  Councillors with duplicate rows:  {len(dup_groups)}")

    ids_to_delete = []
    for key, rows in dup_groups.items():
        # Sort: meetings_eligible DESC, then period_end DESC — keep index 0
        rows_sorted = sorted(
            rows,
            key=lambda r: (r.get("meetings_eligible") or 0, r.get("period_end") or ""),
            reverse=True,
        )
        for r in rows_sorted[1:]:
            ids_to_delete.append(r["id"])

    print(f"  Rows to delete:                   {len(ids_to_delete)}")
    print()

    if not ids_to_delete:
        print("No duplicates found. Table is already clean.")
        sys.exit(0)

    # Delete in batches of 100 (URL length safety)
    BATCH = 100
    deleted = 0
    for start in range(0, len(ids_to_delete), BATCH):
        batch = ids_to_delete[start:start + BATCH]
        _delete_batch(batch)
        deleted += len(batch)
        if not DRY_RUN:
            print(f"  Deleted {deleted}/{len(ids_to_delete)} rows…")

    total_after = total_before - (0 if DRY_RUN else deleted)

    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Rows before:        {total_before:>6}")
    print(f"  Duplicates removed: {deleted:>6}")
    print(f"  Rows after:         {total_after:>6}")
    if DRY_RUN:
        print()
        print("  [DRY RUN — no rows were deleted]")
    print("=" * 60)

    # Post-delete verification
    if not DRY_RUN:
        print()
        print("Verifying — re-fetching to confirm no remaining duplicates…")
        verify_rows = fetch_all()
        verify_groups = defaultdict(int)
        for row in verify_rows:
            key = (
                row.get("local_authority_id") or "",
                (row.get("councillor_name") or "").strip().lower(),
                (row.get("ward") or "").strip().lower(),
            )
            verify_groups[key] += 1

        remaining_dup_groups = sum(1 for v in verify_groups.values() if v > 1)
        print(f"  Rows in table now:       {len(verify_rows)}")
        print(f"  Remaining dup groups:    {remaining_dup_groups}")
        if remaining_dup_groups == 0:
            print("  All duplicates removed successfully.")
        else:
            print(f"  WARNING: {remaining_dup_groups} duplicate groups still exist — investigate manually.")


if __name__ == "__main__":
    main()
