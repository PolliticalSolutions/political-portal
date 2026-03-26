#!/usr/bin/env python3
"""
Sync upcoming and recent elections from Democracy Club into Supabase.

This script:
1. Fetches Democracy Club election records for a configurable date window
2. Matches them to Westminster constituencies using the existing
   constituencies, local_authorities, and constituency_council_lookup tables
3. Upserts elections into public.elections
4. Maintains public.constituency_elections links

Run weekly. Start with --dry-run until the DDL in scripts/elections_democracy_club_ddl.sql
has been applied in Supabase.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

SUPABASE_URL = ""
SUPABASE_SERVICE_KEY = ""
DEMOCRACY_CLUB_BASE_URL = "https://elections.democracyclub.org.uk/api/elections/"
DEFAULT_MONTHS_BACK = 6
DEFAULT_MONTHS_FORWARD = 12
PAGE_SIZE = 100


def load_env() -> None:
    global SUPABASE_URL, SUPABASE_SERVICE_KEY

    env_path = Path(".env")
    if env_path.exists():
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value

    SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "").strip().rstrip("/")
    SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise RuntimeError("VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY are required.")


def _json_request(url: str, *, method: str = "GET", headers: dict[str, str] | None = None, body: Any = None) -> Any:
    data = None
    request_headers = headers or {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        request_headers = {"Content-Type": "application/json", **request_headers}

    request = urllib.request.Request(url, method=method, headers=request_headers, data=data)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else None
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            parsed = {"message": payload or str(exc)}
        message = parsed.get("message") or parsed.get("hint") or parsed.get("error_description") or str(exc)
        raise RuntimeError(message) from exc


def supabase_headers(prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def encode_params(params: dict[str, str]) -> str:
    return urllib.parse.urlencode(params, safe="(),.*")


def supabase_get(table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{encode_params(params)}"
    data = _json_request(url, headers=supabase_headers())
    return data if isinstance(data, list) else []


def supabase_post(path: str, body: Any, *, prefer: str | None = None) -> Any:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    return _json_request(url, method="POST", headers=supabase_headers(prefer), body=body)


def supabase_patch(table: str, params: dict[str, str], body: Any, *, prefer: str | None = None) -> Any:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{encode_params(params)}"
    return _json_request(url, method="PATCH", headers=supabase_headers(prefer), body=body)


def supabase_delete(table: str, params: dict[str, str], *, prefer: str | None = None) -> Any:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{encode_params(params)}"
    return _json_request(url, method="DELETE", headers=supabase_headers(prefer))


def add_months(base: date, months: int) -> date:
    month_index = (base.month - 1) + months
    year = base.year + month_index // 12
    month = month_index % 12 + 1
    day = min(
        base.day,
        [
            31,
            29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
            31,
            30,
            31,
            30,
            31,
            31,
            30,
            31,
            30,
            31,
        ][month - 1],
    )
    return date(year, month, day)


def normalise_name(value: str | None) -> str:
    text = (value or "").lower()
    for needle in [" city ", " county ", " district ", " borough ", " metropolitan ", " council ", " the ", " of "]:
        text = text.replace(needle, " ")
    text = text.replace("&", " and ")
    return " ".join("".join(ch if ch.isalnum() else " " for ch in text).split())


def slugify(value: str | None) -> str:
    text = (value or "").lower().replace("&", " and ")
    parts = ["".join(ch for ch in part if ch.isalnum()) for part in text.replace("/", " ").replace("-", " ").split()]
    return "-".join(part for part in parts if part)


def classify_status(date_value: str, today_iso: str) -> str:
    if not date_value:
        return "UPCOMING"
    if date_value > today_iso:
        return "UPCOMING"
    if date_value == today_iso:
        return "OPEN"
    return "CLOSED"


@dataclass
class SupportData:
    constituency_by_id: dict[str, dict[str, Any]]
    constituency_by_ons_code: dict[str, dict[str, Any]]
    constituency_by_name: dict[str, dict[str, Any]]
    authority_by_key: dict[str, dict[str, Any]]
    pcon_codes_by_authority_id: dict[str, list[str]]


def load_support_data() -> SupportData:
    constituencies = supabase_get("constituencies", {"select": "id,name,ons_code", "limit": "5000"})
    authorities = supabase_get(
        "local_authorities",
        {"select": "id,name,gss_code,authority_type,tier,region,country", "limit": "2000"},
    )
    links = supabase_get(
        "constituency_council_lookup",
        {"select": "local_authority_id,constituency_id", "limit": "5000"},
    )

    constituency_by_id: dict[str, dict[str, Any]] = {}
    constituency_by_ons_code: dict[str, dict[str, Any]] = {}
    constituency_by_name: dict[str, dict[str, Any]] = {}
    for row in constituencies:
        constituency_id = (row.get("id") or "").strip()
        if constituency_id:
            constituency_by_id[constituency_id] = row
        ons_code = (row.get("ons_code") or "").strip().upper()
        if ons_code:
            constituency_by_ons_code[ons_code] = row
        normalized = normalise_name(row.get("name"))
        if normalized:
            constituency_by_name[normalized] = row

    authority_by_key: dict[str, dict[str, Any]] = {}
    for authority in authorities:
        for key in {normalise_name(authority.get("name")), slugify(authority.get("name"))}:
            if key:
                authority_by_key[key] = authority

    authority_codes: dict[str, set[str]] = {}
    for row in links:
        authority_id = row.get("local_authority_id")
        constituency = constituency_by_id.get((row.get("constituency_id") or "").strip())
        pcon_code = (constituency or {}).get("ons_code", "").strip().upper()
        if not authority_id or not pcon_code:
            continue
        authority_codes.setdefault(authority_id, set()).add(pcon_code)

    return SupportData(
        constituency_by_id=constituency_by_id,
        constituency_by_ons_code=constituency_by_ons_code,
        constituency_by_name=constituency_by_name,
        authority_by_key=authority_by_key,
        pcon_codes_by_authority_id={key: sorted(values) for key, values in authority_codes.items()},
    )


def fetch_democracy_club_rows(start_date: str, end_date: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0

    while True:
        params = {
            "poll_open_date__gte": start_date,
            "poll_open_date__lte": end_date,
            "limit": str(PAGE_SIZE),
            "offset": str(offset),
        }
        url = f"{DEMOCRACY_CLUB_BASE_URL}?{urllib.parse.urlencode(params)}"
        payload = _json_request(url)
        batch = payload.get("results") or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return rows


def is_relevant_row(row: dict[str, Any]) -> bool:
    election_type = ((row.get("election_type") or {}).get("election_type") or "").strip().lower()
    if election_type == "parl":
        return True
    if election_type != "local":
        return False
    territory = (
        ((row.get("organisation") or {}).get("territory_code"))
        or ((row.get("division") or {}).get("territory_code"))
        or ""
    ).strip().upper()
    return territory in {"ENG", "WLS"}


def get_candidate_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not is_relevant_row(row):
            continue
        election_id = row.get("election_id")
        election_type = ((row.get("election_type") or {}).get("election_type") or "").strip().lower()
        identifier_type = (row.get("identifier_type") or "").strip().lower()
        if not election_id:
            continue
        if election_type == "parl" and identifier_type in {"election", "ballot"}:
            seen[election_id] = row
        if election_type == "local" and identifier_type in {"organisation", "ballot"}:
            seen[election_id] = row
    return list(seen.values())


def resolve_authority(support: SupportData, organisation: dict[str, Any]) -> dict[str, Any] | None:
    for candidate in [
        organisation.get("official_name"),
        organisation.get("common_name"),
        organisation.get("slug"),
    ]:
        normalized = normalise_name(candidate)
        if normalized and normalized in support.authority_by_key:
            return support.authority_by_key[normalized]
        slug = slugify(candidate)
        if slug and slug in support.authority_by_key:
            return support.authority_by_key[slug]
    return None


def map_parliamentary_byelection(row: dict[str, Any], support: SupportData) -> list[str]:
    division = row.get("division") or {}
    official_identifier = (division.get("official_identifier") or "").strip()
    if official_identifier.startswith("gss:"):
        code = official_identifier.split(":", 1)[1].strip().upper()
        if code in support.constituency_by_ons_code:
            return [code]

    normalized_name = normalise_name(division.get("name"))
    constituency = support.constituency_by_name.get(normalized_name)
    if constituency and constituency.get("ons_code"):
        return [constituency["ons_code"].strip().upper()]
    return []


def map_local_authority_election(row: dict[str, Any], support: SupportData) -> list[str]:
    authority = resolve_authority(support, row.get("organisation") or {})
    if not authority:
        return []
    return support.pcon_codes_by_authority_id.get(authority["id"], [])


def map_local_ballot_election(row: dict[str, Any], support: SupportData) -> list[str]:
    authority_codes = map_local_authority_election(row, support)
    return authority_codes if len(authority_codes) == 1 else []


def build_unmatched_reason(row: dict[str, Any]) -> str:
    election_type = ((row.get("election_type") or {}).get("election_type") or "").strip().lower()
    identifier_type = (row.get("identifier_type") or "").strip().lower()
    if election_type == "local" and identifier_type == "ballot":
        return "Local ballot-level by-election needs a ward/division-to-constituency lookup before it can be linked safely."
    if election_type == "local":
        return "Local authority could not be matched to local_authorities / constituency_council_lookup."
    if election_type == "parl":
        return "Parliamentary by-election constituency could not be matched to constituencies.ons_code."
    return "Election type not handled by the sync."


def build_record(row: dict[str, Any], pcon_codes: list[str], today_iso: str) -> dict[str, Any]:
    election_type = ((row.get("election_type") or {}).get("election_type") or "").strip().lower()
    identifier_type = (row.get("identifier_type") or "").strip().lower()
    poll_date = (row.get("poll_open_date") or "").strip()
    authority_name = ((row.get("organisation") or {}).get("official_name") or "").strip()
    division_name = ((row.get("division") or {}).get("name") or "").strip()

    is_parliamentary_byelection = election_type == "parl" and identifier_type == "ballot"
    is_local_ballot = election_type == "local" and identifier_type == "ballot"
    is_by_election = is_parliamentary_byelection or is_local_ballot

    normalized_type = "general"
    if is_parliamentary_byelection:
        normalized_type = "by_election"
    elif election_type == "local":
        normalized_type = "local"

    if election_type == "parl" and identifier_type == "election":
        name = f"{poll_date[:4]} General Election"
    elif is_parliamentary_byelection:
        name = f"{division_name or row.get('election_title') or 'Election'} By-Election"
    elif election_type == "local" and authority_name:
        name = (
            f"{authority_name} — {division_name} By-Election"
            if is_local_ballot and division_name
            else f"{authority_name} Elections"
        )
    else:
        name = (row.get("election_title") or "Election").strip()

    return {
        "name": name,
        "date": poll_date,
        "election_type": normalized_type,
        "status": classify_status(poll_date, today_iso),
        "is_by_election": is_by_election,
        "local_authority_name": authority_name or None,
        "ward_name": division_name or None if is_local_ballot else None,
        "democracy_club_id": row.get("election_id"),
        "pcon_codes": pcon_codes,
        "last_synced_at": datetime.now(UTC).isoformat(),
    }


def check_schema_ready() -> tuple[bool, list[str]]:
    issues: list[str] = []

    try:
        supabase_get(
            "elections",
            {
                "select": "id,status,polling_date,democracy_club_id,is_by_election,local_authority_name,ward_name,last_synced_at",
                "limit": "1",
            },
        )
    except Exception as exc:  # noqa: BLE001
        issues.append(f"elections table is missing required sync columns: {exc}")

    try:
        supabase_get("constituency_elections", {"select": "id,election_id,constituency_id,relevance", "limit": "1"})
    except Exception as exc:  # noqa: BLE001
        issues.append(f"constituency_elections table is not available: {exc}")

    return (len(issues) == 0, issues)


def upsert_record(record: dict[str, Any], support: SupportData) -> None:
    existing = supabase_get(
        "elections",
        {
            "select": "id",
            "democracy_club_id": f"eq.{record['democracy_club_id']}",
            "limit": "1",
        },
    )
    election_id = existing[0]["id"] if existing else None
    if election_id is None:
        election_id = str(os.urandom(16).hex())
        election_id = (
            f"{election_id[:8]}-{election_id[8:12]}-{election_id[12:16]}-{election_id[16:20]}-{election_id[20:32]}"
        )

    row = {
        "id": election_id,
        "name": record["name"],
        "election_date": record["date"],
        "polling_date": record["date"],
        "election_type": record["election_type"],
        "status": record["status"],
        "is_by_election": record["is_by_election"],
        "local_authority_name": record["local_authority_name"],
        "ward_name": record["ward_name"],
        "democracy_club_id": record["democracy_club_id"],
        "last_synced_at": record["last_synced_at"],
    }

    supabase_post(
        "elections?on_conflict=id",
        row,
        prefer="resolution=merge-duplicates,return=minimal",
    )

    desired_constituency_ids = [
        support.constituency_by_ons_code[pcon_code]["id"] for pcon_code in record["pcon_codes"] if pcon_code in support.constituency_by_ons_code
    ]
    link_rows = [
        {"election_id": election_id, "constituency_id": constituency_id, "relevance": "direct"}
        for constituency_id in desired_constituency_ids
    ]

    existing_links = supabase_get(
        "constituency_elections",
        {"select": "constituency_id", "election_id": f"eq.{election_id}", "limit": "5000"},
    )
    current_ids = {row["constituency_id"] for row in existing_links}
    next_ids = set(desired_constituency_ids)

    if link_rows:
        supabase_post(
            "constituency_elections?on_conflict=election_id,constituency_id",
            link_rows,
            prefer="resolution=merge-duplicates,return=minimal",
        )

    removed_ids = sorted(current_ids - next_ids)
    if removed_ids:
        supabase_delete(
            "constituency_elections",
            {
                "election_id": f"eq.{election_id}",
                "constituency_id": f"in.({','.join(removed_ids)})",
            },
            prefer="return=minimal",
        )


def run_sync(*, dry_run: bool, months_back: int, months_forward: int) -> dict[str, Any]:
    today = date.today()
    today_iso = today.isoformat()
    start_date = add_months(today, -months_back).isoformat()
    end_date = add_months(today, months_forward).isoformat()

    support = load_support_data()
    rows = fetch_democracy_club_rows(start_date, end_date)
    candidates = get_candidate_rows(rows)

    matched: list[dict[str, Any]] = []
    unmatched: list[dict[str, Any]] = []

    for row in candidates:
        election_type = ((row.get("election_type") or {}).get("election_type") or "").strip().lower()
        identifier_type = (row.get("identifier_type") or "").strip().lower()

        pcon_codes: list[str] = []
        if election_type == "parl" and identifier_type == "election":
            pcon_codes = sorted(support.constituency_by_ons_code.keys())
        elif election_type == "parl" and identifier_type == "ballot":
            pcon_codes = map_parliamentary_byelection(row, support)
        elif election_type == "local" and identifier_type == "organisation":
            pcon_codes = map_local_authority_election(row, support)
        elif election_type == "local" and identifier_type == "ballot":
            pcon_codes = map_local_ballot_election(row, support)

        if not pcon_codes:
            unmatched.append(
                {
                    "election_id": row.get("election_id"),
                    "title": row.get("election_title"),
                    "poll_open_date": row.get("poll_open_date"),
                    "reason": build_unmatched_reason(row),
                }
            )
            continue

        record = build_record(row, pcon_codes, today_iso)
        matched.append(record)
        if not dry_run:
            upsert_record(record, support)

    six_months_out = add_months(today, 6).isoformat()
    upcoming = [
        row
        for row in matched
        if row["date"] and today_iso <= row["date"] <= six_months_out
    ]
    upcoming.sort(key=lambda item: item["date"])

    return {
        "window": {"start_date": start_date, "end_date": end_date},
        "dry_run": dry_run,
        "found_count": len(candidates),
        "matched_count": len(matched),
        "unmatched_count": len(unmatched),
        "synced_count": 0 if dry_run else len(matched),
        "upcoming": upcoming,
        "unmatched": unmatched,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync elections from Democracy Club into Supabase.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and match elections without writing to Supabase.")
    parser.add_argument("--months-back", type=int, default=DEFAULT_MONTHS_BACK, help="Months of historical elections to include.")
    parser.add_argument("--months-forward", type=int, default=DEFAULT_MONTHS_FORWARD, help="Months of upcoming elections to include.")
    parser.add_argument("--show-unmatched-limit", type=int, default=25, help="How many unmatched elections to print.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    load_env()

    schema_ready, schema_issues = check_schema_ready()
    effective_dry_run = args.dry_run or not schema_ready
    if not schema_ready:
        print("Schema is not ready for live writes. Falling back to dry-run.")
        for issue in schema_issues:
            print(f"  - {issue}")
        print("")

    summary = run_sync(
        dry_run=effective_dry_run,
        months_back=max(1, min(24, args.months_back)),
        months_forward=max(1, min(24, args.months_forward)),
    )

    print("Democracy Club election sync")
    print(f"  Window: {summary['window']['start_date']} to {summary['window']['end_date']}")
    print(f"  Dry run: {'yes' if summary['dry_run'] else 'no'}")
    print(f"  Elections found: {summary['found_count']}")
    print(f"  Matched to constituencies: {summary['matched_count']}")
    print(f"  Could not be matched: {summary['unmatched_count']}")
    print(f"  Written to Supabase: {summary['synced_count']}")
    print("")

    if summary["upcoming"]:
        print("Upcoming elections in the next 6 months:")
        for row in summary["upcoming"]:
            print(f"  - {row['date']} :: {row['name']} ({row['status']}, {len(row['pcon_codes'])} constituencies)")
        print("")
    else:
        print("Upcoming elections in the next 6 months: none")
        print("")

    if summary["unmatched"]:
        print("Unmatched elections:")
        for row in summary["unmatched"][: max(0, args.show_unmatched_limit)]:
            print(f"  - {row['poll_open_date']} :: {row['title']} :: {row['reason']}")
        print("")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
