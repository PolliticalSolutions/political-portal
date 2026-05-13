"""
constituency_data_audit.py — Data completeness audit for all constituency
intelligence tables.

Queries each table via Supabase REST API and reports:
  - Total row count
  - Per-column null/empty count
  - Per-column completeness %

Output: scripts/constituency_data_audit_YYYY-MM-DD.csv (UTF-8-BOM for Excel)
Console: one-line summary per table, then absolute CSV path.

Usage:
    python scripts/constituency_data_audit.py

This is a standalone gate script — it exits cleanly after producing the CSV.
Await explicit "proceed" before running Tasks 2–6.
"""

import csv
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

_SSL_CTX = ssl._create_unverified_context()

# ── Connection ─────────────────────────────────────────────────────────────────

SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"

SERVICE_KEY = None
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

# ── Tables to audit ────────────────────────────────────────────────────────────

TABLES = [
    "constituencies",
    "elections",
    "results",
    "candidates",
    "demographics",
    "swings",
    "marginality_scores",
    "vulnerability_scores",
    "reform_threat_index",
    "libdem_threat_index",
    "green_threat_index",
    "by_election_risk",
    "target_seats",
    "demographic_correlations",
    "local_authorities",
    "council_elections",
    "council_results",
    "council_wards",
    "lgr_authorities",
    "political_alerts",
    "councillor_attendance",
]

# Columns that are GENERATED ALWAYS (null by design in certain conditions)
GENERATED_COLUMNS = {"attendance_pct"}

# ── Supabase helpers ───────────────────────────────────────────────────────────

def _headers():
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Accept": "application/json",
    }


def _get(table, params):
    url = f"{SUPABASE_URL}/rest/v1/{table}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
            text = resp.read().decode("utf-8")
            return json.loads(text) if text else []
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(str(exc)) from exc


def fetch_all_rows(table):
    """Paginate through all rows; returns list of dicts. Raises RuntimeError on HTTP error."""
    rows, offset = [], 0
    while True:
        batch = _get(table, {"select": "*", "limit": 1000, "offset": offset})
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return rows

# ── Completeness analysis ──────────────────────────────────────────────────────

def analyse(table, rows):
    """
    Returns list of dicts:
      {table_name, column_name, total_rows, null_or_empty_count, completeness_pct, note}
    """
    if not rows:
        return [{
            "table_name": table,
            "column_name": "(empty table)",
            "total_rows": 0,
            "null_or_empty_count": 0,
            "completeness_pct": "N/A",
            "note": "",
        }]

    total = len(rows)
    columns = list(rows[0].keys())
    result = []
    for col in columns:
        null_count = sum(
            1 for r in rows
            if r.get(col) is None or r.get(col) == ""
        )
        pct = round((1 - null_count / total) * 100, 1)
        note = "GENERATED ALWAYS — null when meetings_eligible=0 is by design" if col in GENERATED_COLUMNS else ""
        result.append({
            "table_name": table,
            "column_name": col,
            "total_rows": total,
            "null_or_empty_count": null_count,
            "completeness_pct": pct,
            "note": note,
        })
    return result

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    sys.stdout.reconfigure(encoding="utf-8")

    today_str = date.today().isoformat()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(script_dir, f"constituency_data_audit_{today_str}.csv")

    print("=" * 70)
    print("CONSTITUENCY INTELLIGENCE DATA AUDIT")
    print(f"Date: {today_str}")
    print("=" * 70)
    print()

    all_rows_csv = []
    summary_lines = []

    for table in TABLES:
        print(f"  Auditing {table}…", end=" ", flush=True)

        try:
            rows = fetch_all_rows(table)
        except RuntimeError as exc:
            msg = str(exc)
            if "404" in msg or "400" in msg or "42P01" in msg:
                status = "table not found / inaccessible"
            else:
                status = f"error: {msg}"
            print(status)
            all_rows_csv.append({
                "table_name": table,
                "column_name": f"({status})",
                "total_rows": 0,
                "null_or_empty_count": 0,
                "completeness_pct": "N/A",
                "note": "",
            })
            summary_lines.append((table, 0, "N/A", status))
            continue

        analysis = analyse(table, rows)
        all_rows_csv.extend(analysis)

        total_rows = analysis[0]["total_rows"]
        if total_rows == 0:
            avg_pct = "N/A"
            print("empty")
        else:
            pcts = [r["completeness_pct"] for r in analysis if isinstance(r["completeness_pct"], float)]
            avg_pct = round(sum(pcts) / len(pcts), 1) if pcts else "N/A"
            print(f"{total_rows} rows, {len(analysis)} columns, avg completeness {avg_pct}%")

        summary_lines.append((table, total_rows, avg_pct, ""))

    # Write CSV (UTF-8-BOM for Excel)
    print()
    fieldnames = ["table_name", "column_name", "total_rows", "null_or_empty_count", "completeness_pct", "note"]
    with open(out_path, "w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_rows_csv)

    # Console summary table
    print("=" * 70)
    print("AUDIT SUMMARY")
    print("=" * 70)
    print(f"  {'Table':<35} {'Rows':>7}   Completeness")
    print(f"  {'-'*35} {'-'*7}   {'-'*12}")
    for table, total_rows, avg_pct, note in summary_lines:
        pct_str = f"{avg_pct}%" if isinstance(avg_pct, float) else avg_pct
        flag = f"  ← {note}" if note else ""
        print(f"  {table:<35} {total_rows:>7}   {pct_str}{flag}")

    print()
    print(f"CSV written to: {out_path}")
    print()
    print("Task 1 complete. Review the CSV, then explicitly say 'proceed' to continue with Tasks 2–6.")
    print("=" * 70)

    sys.exit(0)


if __name__ == "__main__":
    main()
