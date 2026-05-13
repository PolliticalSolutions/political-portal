"""
extend_by_election_risk_attendance.py — Score councillor non-attendance against
Section 85 LGA 1972 and insert political_alerts for at-risk seats.

Thresholds (months since last qualifying attendance):
  >= 4 months → ELEVATED  — logged to console only, no alert inserted
  >= 5 months → CRITICAL  — alert inserted (risk_level=high)
  >= 6 months → VACANT    — alert inserted (risk_level=critical)

Safe to re-run: deduplicates on title + local_authority_id + is_active = true.

Authorities with no attendance data, or whose most recent data is older than
365 days, are skipped (logged as sparse).

Usage:
    python scripts/extend_by_election_risk_attendance.py [--dry-run]
"""

import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime

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

# ── Abolished councils — skip scoring for these ───────────────────────────────
# Cambridgeshire district/county councils abolished 1 April 2026 (LGR).
# Cross-referenced against Manus Step 1 report. Section 85 scoring is irrelevant
# for abolished bodies; alerts would be misleading.

ABOLISHED_COUNCILS = {
    "cambridge city council",
    "huntingdonshire district council",
    "fenland district council",
    "east cambridgeshire district council",
    "south cambridgeshire district council",
    "cambridgeshire county council",
}

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


def _fetch_all(table, select="*", extra_params=""):
    rows, offset = [], 0
    while True:
        params = f"select={select}&limit=1000&offset={offset}"
        if extra_params:
            params += f"&{extra_params}"
        batch = _get(table, params)
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return rows


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

# ── Date helpers ───────────────────────────────────────────────────────────────

def parse_date(s):
    """Parse ISO date string; returns date or None."""
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except (ValueError, TypeError):
        return None


def months_elapsed(d, today):
    """Number of whole months between d and today."""
    if d is None:
        return 0
    return int((today - d).days / 30.44)

# ── Alert dedup ────────────────────────────────────────────────────────────────

def alert_exists(title, authority_id):
    """Return True if an active by_election_risk alert already exists for this title + authority."""
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

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    today = date.today()

    print("=" * 70)
    print("BY-ELECTION ATTENDANCE RISK SCORER" + ("  [DRY RUN]" if DRY_RUN else ""))
    print(f"Date: {today.isoformat()}")
    print("Statutory basis: Section 85, Local Government Act 1972")
    print("=" * 70)
    print()

    # ── Load all local authorities ─────────────────────────────────────────────

    print("Loading local authorities…")
    try:
        authorities = _fetch_all("local_authorities", "id,gss_code,name")
    except Exception as exc:
        print(f"ERROR: Could not load local_authorities: {exc}")
        sys.exit(1)
    print(f"  {len(authorities)} authorities loaded.")
    print()

    stats = {
        "sparse": 0,
        "elevated_logged": 0,
        "critical_inserted": 0,
        "critical_existing": 0,
        "vacant_inserted": 0,
        "vacant_existing": 0,
        "errors": 0,
    }

    for authority in authorities:
        auth_id = authority["id"]
        auth_name = authority.get("name", auth_id)

        if auth_name.lower().strip() in ABOLISHED_COUNCILS:
            print(f"  [{auth_name}] SKIP — abolished on or before 1 Apr 2026 (LGR)")
            stats["sparse"] += 1
            continue

        # ── Fetch attendance rows for this authority ────────────────────────────

        try:
            rows = _fetch_all(
                "councillor_attendance",
                "councillor_name,ward,party,meetings_eligible,meetings_attended,period_start,period_end",
                f"local_authority_id=eq.{urllib.parse.quote(str(auth_id))}",
            )
        except Exception as exc:
            print(f"  [{auth_name}] ERROR fetching attendance: {exc}")
            stats["errors"] += 1
            continue

        if not rows:
            stats["sparse"] += 1
            continue

        # ── Sparseness check: most recent period_end must be within 365 days ───

        period_ends = [parse_date(r["period_end"]) for r in rows if r.get("period_end")]
        if not period_ends:
            stats["sparse"] += 1
            continue

        latest_period_end = max(period_ends)
        days_old = (today - latest_period_end).days
        if days_old > 365:
            print(f"  [{auth_name}] SPARSE — most recent data is {days_old} days old, skipping")
            stats["sparse"] += 1
            continue

        # ── Group rows by councillor ───────────────────────────────────────────

        councillors = {}
        for r in rows:
            name = (r.get("councillor_name") or "").strip()
            if not name:
                continue
            if name not in councillors:
                councillors[name] = {
                    "ward": r.get("ward") or "",
                    "party": r.get("party") or "",
                    "rows": [],
                }
            councillors[name]["rows"].append(r)

        # ── Score each councillor ──────────────────────────────────────────────

        for councillor_name, cdata in councillors.items():
            ward = cdata["ward"]
            party = cdata["party"]
            c_rows = cdata["rows"]

            # Skip councillors with no scheduled meetings across all periods.
            # meetings_eligible=0 means not scheduled — not the same as non-attendance.
            # Section 85 only applies when eligible meetings were missed.
            total_eligible = sum((r.get("meetings_eligible") or 0) for r in c_rows)
            if total_eligible == 0:
                continue

            # Find date of last meeting with at least one attendance recorded
            attended_rows = [r for r in c_rows if (r.get("meetings_attended") or 0) > 0]
            if attended_rows:
                last_date = max(parse_date(r["period_end"]) for r in attended_rows
                                if parse_date(r["period_end"]))
            else:
                # Never attended — use earliest period_start as proxy for start of risk
                starts = [parse_date(r["period_start"]) for r in c_rows if r.get("period_start")]
                last_date = min(starts) if starts else None

            mo = months_elapsed(last_date, today)

            if mo >= 6:
                risk_status = "vacant"
            elif mo >= 5:
                risk_status = "critical"
            elif mo >= 4:
                risk_status = "elevated"
                ward_str = f" ({ward})" if ward else ""
                print(f"  [{auth_name}] ELEVATED: {councillor_name}{ward_str} — {mo} months since last attendance")
                stats["elevated_logged"] += 1
                continue
            else:
                continue

            # ── Dedup and insert alert ─────────────────────────────────────────

            title = f"By-election Risk: {councillor_name}" + (f" ({ward})" if ward else "")

            try:
                if alert_exists(title, auth_id):
                    ward_str = f" ({ward})" if ward else ""
                    print(f"  [{auth_name}] SKIP (alert exists): {councillor_name}{ward_str} — {mo}mo {risk_status}")
                    if risk_status == "vacant":
                        stats["vacant_existing"] += 1
                    else:
                        stats["critical_existing"] += 1
                    continue

                last_date_str = last_date.isoformat() if last_date else "unknown"
                party_str = f", {party}" if party else ""
                ward_str = f", {ward}" if ward else ""
                now_iso = datetime.utcnow().isoformat() + "Z"

                alert_payload = {
                    "alert_type": "by_election_risk",
                    "risk_level": "critical" if risk_status == "vacant" else "high",
                    "title": title,
                    "summary": (
                        f"{councillor_name} ({party or 'Unknown party'}{ward_str}) has not attended "
                        f"a qualifying meeting for {mo} months — {risk_status} under Section 85 LGA 1972."
                    ),
                    "detail": json.dumps({
                        "councillorName": councillor_name,
                        "ward": ward or None,
                        "party": party or None,
                        "lastAttendanceDate": last_date_str,
                        "monthsElapsed": mo,
                        "riskStatus": risk_status,
                        "localAuthorityId": str(auth_id),
                    }),
                    "is_active": True,
                    "local_authority_id": str(auth_id),
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }

                _post("political_alerts", alert_payload)
                print(f"  [{auth_name}] INSERTED ({risk_status}): {councillor_name}{ward_str} — {mo} months")

                if risk_status == "vacant":
                    stats["vacant_inserted"] += 1
                else:
                    stats["critical_inserted"] += 1

            except Exception as exc:
                print(f"  [{auth_name}] ERROR on {councillor_name}: {exc}")
                stats["errors"] += 1

    # ── Summary ────────────────────────────────────────────────────────────────

    print()
    print("=" * 70)
    print("SCORING SUMMARY")
    print("=" * 70)
    print(f"  Authorities skipped (sparse/no data):  {stats['sparse']:>4}")
    print(f"  Elevated (logged only, 4–5 months):    {stats['elevated_logged']:>4}")
    print(f"  Critical alerts inserted (5–6 months): {stats['critical_inserted']:>4}  |  already existed: {stats['critical_existing']}")
    print(f"  Vacant alerts inserted (>6 months):    {stats['vacant_inserted']:>4}  |  already existed: {stats['vacant_existing']}")
    print(f"  Errors:                                {stats['errors']:>4}")
    if DRY_RUN:
        print()
        print("  [DRY RUN — no alerts were written to Supabase]")
    print("=" * 70)
    sys.exit(0)


if __name__ == "__main__":
    main()
