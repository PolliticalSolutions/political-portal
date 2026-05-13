"""
import_council_composition.py — Import English council data from Open Council Data UK.

PRIMARY:   Insert missing English councils into local_authorities (317-council target).
SECONDARY: Write political composition to council_data (requires migration first).

Usage:
    python scripts/import_council_composition.py [--file <path>] [--dry-run] [--skip-new-councils]

    --file <path>           Use local CSV instead of downloading from Open Council Data UK.
    --dry-run               Preview changes; nothing is written to Supabase.
    --skip-new-councils     Update composition for matched councils only; skip new inserts.

Prerequisite for council_data write:
    Run supabase/migrations/20260512_add_council_composition_columns.sql in Supabase SQL Editor.
"""

import csv
import io
import json
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime

# Windows Python may reject certs where an intermediate CA lacks a critical
# Basic Constraints extension. These scripts are local-only data import tools.
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

# ── CLI args ───────────────────────────────────────────────────────────────────

DRY_RUN = "--dry-run" in sys.argv
SKIP_NEW_COUNCILS = "--skip-new-councils" in sys.argv

file_arg = None
for _i, _a in enumerate(sys.argv[1:], 1):
    if _a == "--file" and _i < len(sys.argv) - 1:
        file_arg = sys.argv[_i + 1]
        break

OCD_URL = "https://opencouncildata.co.uk/history2016-2026.csv"
TARGET_COUNCILS = 317
TARGET_YEAR = 2026

# ── Abolished councils (LGR — must not be imported) ───────────────────────────
# Cambridgeshire district/county councils were abolished 1 April 2026 under LGR
# (replaced by Cambridgeshire and Peterborough Mayoral Combined Authority).
# Cross-referenced against Manus Step 1 report. Do not insert or update these.

ABOLISHED_DATE = date(2026, 4, 1)

ABOLISHED_FULL = {
    "cambridge city council",
    "huntingdonshire district council",
    "fenland district council",
    "east cambridgeshire district council",
    "south cambridgeshire district council",
    "cambridgeshire county council",
}

ABOLISHED_NORM = {
    "cambridge city",
    "huntingdonshire",
    "fenland",
    "east cambridgeshire",
    "south cambridgeshire",
    "cambridgeshire",
}


def is_abolished(full_name, norm_name=None):
    if full_name.lower().strip() in ABOLISHED_FULL:
        return True
    if norm_name and norm_name in ABOLISHED_NORM:
        return True
    return False


# ── Exclusion lists (councils outside England) ─────────────────────────────────

SCOTTISH_NORM = {
    "aberdeen city", "aberdeenshire", "angus", "argyll and bute",
    "clackmannanshire", "dumfries and galloway", "dundee city",
    "east ayrshire", "east dunbartonshire", "east lothian",
    "east renfrewshire", "edinburgh", "falkirk", "fife",
    "glasgow city", "highland", "inverclyde", "midlothian",
    "moray", "na h-eileanan siar", "north ayrshire", "north lanarkshire",
    "orkney islands", "perth and kinross", "renfrewshire",
    "scottish borders", "shetland islands", "south ayrshire",
    "south lanarkshire", "stirling", "west dunbartonshire", "west lothian",
}

WELSH_NORM = {
    "blaenau gwent", "bridgend", "caerphilly", "cardiff",
    "carmarthenshire", "ceredigion", "conwy", "denbighshire",
    "flintshire", "gwynedd", "isle of anglesey", "merthyr tydfil",
    "monmouthshire", "neath port talbot", "newport", "pembrokeshire",
    "powys", "rhondda cynon taf", "swansea", "torfaen",
    "vale of glamorgan", "wrexham",
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


def _fetch_all(table, select="*"):
    rows, offset = [], 0
    while True:
        batch = _get(table, f"select={select}&limit=1000&offset={offset}")
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return rows


def _post_one(table, row_data, returning=False):
    """POST a single row. If returning=True, returns the created row dict."""
    if DRY_RUN:
        print(f"    [dry-run] INSERT {table}: {row_data.get('name', list(row_data.items())[:2])}")
        return {"id": "DRY-RUN-UUID", **row_data}
    body = json.dumps([row_data]).encode()
    prefer = "return=representation" if returning else "return=minimal"
    req = urllib.request.Request(url=f"{SUPABASE_URL}/rest/v1/{table}",
                                  data=body,
                                  headers=_headers({"Prefer": prefer}),
                                  method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
            text = resp.read()
            if returning and text:
                result = json.loads(text)
                return result[0] if result else None
            return None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"POST {table} [{exc.code}]: {detail}") from exc


def _post_batch(table, rows, on_conflict=None):
    """POST multiple rows with optional upsert conflict target."""
    if DRY_RUN:
        print(f"    [dry-run] UPSERT {len(rows)} rows into {table}")
        return
    if not rows:
        return
    body = json.dumps(rows).encode()
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={urllib.parse.quote(on_conflict)}"
    req = urllib.request.Request(url=url, data=body,
                                  headers=_headers({"Prefer": "resolution=merge-duplicates,return=minimal"}),
                                  method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"POST {table} [{exc.code}]: {detail}") from exc


def _patch(table, eq_col, eq_val, payload):
    if DRY_RUN:
        print(f"    [dry-run] PATCH {table} where {eq_col}={eq_val}: {list(payload.keys())}")
        return
    body = json.dumps(payload).encode()
    url = f"{SUPABASE_URL}/rest/v1/{table}?{eq_col}=eq.{urllib.parse.quote(str(eq_val))}"
    req = urllib.request.Request(url=url, data=body,
                                  headers=_headers({"Prefer": "return=minimal"}),
                                  method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
            resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"PATCH {table} [{exc.code}]: {detail}") from exc

# ── Name normalisation ─────────────────────────────────────────────────────────

def normalise_name(name):
    """Reduce a council name to its bare geographic identifier for fuzzy matching."""
    n = name.lower().strip()
    # Remove ", City of" / ", Royal Borough of" patterns (e.g. "Kingston upon Hull, City of")
    n = re.sub(r",\s*(city of|royal borough of|borough of)\s*$", "", n).strip()
    # Remove common suffixes (longest first to avoid partial stripping)
    for suffix in [
        " metropolitan borough council",
        " london borough council",
        " borough council",
        " district council",
        " county council",
        " city council",
        " council",
        " metropolitan borough",
        " london borough",
        " borough",
        " district",
        " county",
    ]:
        if n.endswith(suffix):
            n = n[: -len(suffix)].strip()
            break
    # Remove common prefixes
    for prefix in ["city of ", "royal borough of ", "the "]:
        if n.startswith(prefix):
            n = n[len(prefix):].strip()
    return n


def parse_authority_type(name):
    n = name.lower()
    if "metropolitan borough" in n:
        return "Metropolitan Borough"
    if "london borough" in n or "city of london" in n:
        return "London Borough"
    if "county council" in n:
        return "County Council"
    if "city council" in n:
        return "City Council"
    if "borough council" in n:
        return "Borough Council"
    if "district council" in n:
        return "District Council"
    # OCD short names — infer from geography where possible; default unitary
    return "Unitary Authority"


def parse_tier(authority_type):
    return {
        "Metropolitan Borough": "metropolitan",
        "London Borough": "london",
        "County Council": "county",
        "City Council": "unitary",
        "Borough Council": "district",
        "District Council": "district",
        "Unitary Authority": "unitary",
    }.get(authority_type, "unitary")


PARTY_MAP = {
    "CON": "Conservative",
    "LAB": "Labour",
    "LD": "Liberal Democrat",
    "GREEN": "Green",
    "UKIP": "UKIP",
    "REF": "Reform UK",
    "IND": "Independent",
    "OTHER": "Other",
    "SNP": "SNP",
    "PC": "Plaid Cymru",
}


def map_party(code):
    return PARTY_MAP.get(code.upper().strip(), code.strip().title())


def parse_majority(majority_str):
    """Returns (controlling_party, control_type) from OCD majority field."""
    if not majority_str:
        return None, "noc"
    s = majority_str.strip()
    su = s.upper()
    if su in ("NULL", "NOC", ""):
        return None, "noc"
    # Minority: "CON min", "LAB min"
    if su.endswith(" MIN"):
        return map_party(su[:-4].strip()), "minority"
    # Coalition: "LD/GRN", "CON/IND"
    if "/" in su:
        parts = [p.strip() for p in su.split("/")]
        return map_party(parts[0]), "coalition"
    return map_party(su), "majority"


def build_composition(row):
    """Build composition dict from per-party OCD seat columns."""
    party_cols = {
        "con": "Conservative",
        "lab": "Labour",
        "ld": "Liberal Democrat",
        "green": "Green",
        "ukip": "UKIP",
        "ref": "Reform UK",
        "pc": "Plaid Cymru",
        "snp": "SNP",
        "other": "Other",
    }
    comp = {}
    for col, party_name in party_cols.items():
        try:
            val = int(row.get(col, 0) or 0)
            if val > 0:
                comp[party_name] = val
        except (ValueError, TypeError):
            pass
    return comp or None

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    sys.stdout.reconfigure(encoding="utf-8")

    print("=" * 70)
    print("COUNCIL COMPOSITION IMPORT" + ("  [DRY RUN]" if DRY_RUN else ""))
    print(f"Date: {date.today().isoformat()}")
    print("=" * 70)
    print()

    # ── Pre-flight 0: council_data schema ─────────────────────────────────────

    print("Pre-flight 0: Checking council_data schema…")
    REQUIRED_COLS = {
        "local_authority_id", "controlling_party", "control_type",
        "total_seats", "composition", "composition_source", "composition_verified_at",
    }
    council_data_schema_ok = False
    try:
        sample = _get("council_data", "select=*&limit=1")
        if sample:
            present = set(sample[0].keys())
            missing_cols = REQUIRED_COLS - present
            if missing_cols:
                print(f"  Missing columns: {', '.join(sorted(missing_cols))}")
                print("  Run supabase/migrations/20260512_add_council_composition_columns.sql first.")
                print("  Composition write to council_data will be SKIPPED.")
            else:
                print("  council_data schema: OK")
                council_data_schema_ok = True
        else:
            print("  council_data is empty — cannot verify schema. council_data write will be SKIPPED.")
            print("  Run the migration, then re-run this script.")
    except Exception as exc:
        print(f"  WARNING: Could not check council_data: {exc}. council_data write SKIPPED.")
    print()

    # ── Download / load OCD CSV ────────────────────────────────────────────────

    print("Pre-flight B: Downloading OCD UK data + freshness check…")
    dataset_date = None
    dataset_date_str = "unknown"
    csv_text = None

    if file_arg:
        print(f"  Using local file: {file_arg}")
        if not os.path.exists(file_arg):
            print(f"  ERROR: File not found: {file_arg}")
            sys.exit(1)
        with open(file_arg, encoding="utf-8-sig") as fh:
            csv_text = fh.read()
        m = re.search(r"(\d{4}-\d{2}-\d{2})", os.path.basename(file_arg))
        if m:
            try:
                dataset_date = date.fromisoformat(m.group(1))
            except ValueError:
                pass
    else:
        print(f"  Fetching: {OCD_URL}")
        try:
            req = urllib.request.Request(OCD_URL, headers={"User-Agent": "PoliticalSolutions/1.0"})
            with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
                raw = resp.read()
                csv_text = raw.decode("utf-8-sig")
                last_modified = resp.headers.get("Last-Modified", "")
                if last_modified:
                    try:
                        from email.utils import parsedate_to_datetime
                        dataset_date = parsedate_to_datetime(last_modified).date()
                    except Exception:
                        pass
        except urllib.error.HTTPError as exc:
            print(f"  ERROR: HTTP {exc.code}.")
            print("  Download manually from https://opencouncildata.co.uk and pass with --file <path>")
            sys.exit(1)
        except urllib.error.URLError as exc:
            print(f"  ERROR: {exc}")
            print("  Download manually from https://opencouncildata.co.uk and pass with --file <path>")
            sys.exit(1)

    MAY_2025 = date(2025, 5, 1)
    MAY_2026 = date(2026, 5, 1)

    if dataset_date is None:
        print("  WARNING: Cannot verify dataset freshness — no Last-Modified header found.")
        print("  Proceeding, but manually verify data reflects post-May 2025 results.")
    elif dataset_date < MAY_2025:
        print(f"  ABORT: Dataset dated {dataset_date} — pre-dates May 2025 local elections.")
        print("  Composition data likely stale. Obtain a newer dataset before importing.")
        sys.exit(1)
    elif dataset_date < MAY_2026:
        print(f"  NOTE: Dataset dated {dataset_date}. May 2026 results (1 May 2026) may not be reflected.")
        print("  Proceeding — verify against known May 2026 results after import.")
        dataset_date_str = dataset_date.isoformat()
    else:
        print(f"  Dataset dated {dataset_date} — post-May 2026 elections. OK")
        dataset_date_str = dataset_date.isoformat()
    print()

    # ── Parse OCD CSV ──────────────────────────────────────────────────────────

    print("Parsing OCD CSV…")
    ocd_english = []
    skipped_ni = skipped_scot = skipped_welsh = skipped_abolished = 0

    reader = csv.DictReader(io.StringIO(csv_text))
    for row in reader:
        try:
            year = int(row.get("year", 0))
        except (ValueError, TypeError):
            continue
        if year != TARGET_YEAR:
            continue

        council_id_raw = row.get("council id", row.get("council_id", "")).strip()
        try:
            council_id = int(council_id_raw)
        except (ValueError, TypeError):
            continue

        if council_id >= 1000:
            skipped_ni += 1
            continue

        authority = row.get("authority", "").strip()
        if not authority:
            continue

        norm = normalise_name(authority)
        if norm in SCOTTISH_NORM:
            skipped_scot += 1
            continue
        if norm in WELSH_NORM:
            skipped_welsh += 1
            continue
        if is_abolished(authority, norm):
            skipped_abolished += 1
            continue

        try:
            total = int(row.get("total", 0) or 0)
        except (ValueError, TypeError):
            total = 0

        controlling_party, control_type = parse_majority(row.get("majority", ""))
        composition = build_composition(row)
        authority_type = parse_authority_type(authority)

        ocd_english.append({
            "ocd_id": str(council_id),
            "authority": authority,
            "normalised": norm,
            "authority_type": authority_type,
            "tier": parse_tier(authority_type),
            "total_seats": total,
            "controlling_party": controlling_party,
            "control_type": control_type,
            "composition": composition,
            "_matched_row": None,
        })

    print(f"  English councils (year={TARGET_YEAR}): {len(ocd_english)}")
    print(f"  Excluded: {skipped_ni} NI, {skipped_scot} Scottish, {skipped_welsh} Welsh, {skipped_abolished} abolished (LGR)")
    if skipped_abolished:
        print(f"  Abolished councils suppressed (abolished {ABOLISHED_DATE}): {', '.join(sorted(ABOLISHED_FULL))}")
    print()

    # ── Fetch local_authorities ────────────────────────────────────────────────

    print("Loading local_authorities…")
    try:
        auth_rows = _fetch_all(
            "local_authorities",
            "id,gss_code,name,authority_type,tier,country,controlling_party,control_type,total_seats",
        )
    except Exception as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)

    count_before = len(auth_rows)
    print(f"  {count_before} authorities currently in database.")

    # Build lookup maps
    name_norm_map = {}   # normalised → row
    name_exact_map = {}  # lowercase exact → row

    for row in auth_rows:
        n = normalise_name(row.get("name", ""))
        name_norm_map[n] = row
        name_exact_map[row.get("name", "").lower().strip()] = row
    print()

    # ── Pre-flight A: Match OCD vs local_authorities ───────────────────────────

    print("Pre-flight A: Matching OCD English councils against local_authorities…")
    matched = []
    to_insert = []

    for ocd in ocd_english:
        norm = ocd["normalised"]
        db_row = name_norm_map.get(norm) or name_exact_map.get(ocd["authority"].lower().strip())
        if db_row:
            ocd["_matched_row"] = db_row
            matched.append(ocd)
        else:
            to_insert.append(ocd)

    print(f"  Matched (name normalisation): {len(matched)}")
    print(f"  Not matched (new):            {len(to_insert)}")

    if SKIP_NEW_COUNCILS:
        print(f"  --skip-new-councils: {len(to_insert)} new councils will NOT be inserted.")
        to_insert = []
    elif to_insert:
        print(f"\n  New English councils to INSERT into local_authorities:")
        for ocd in to_insert[:30]:
            print(f"    [{ocd['ocd_id']:>3}] {ocd['authority']}")
        if len(to_insert) > 30:
            print(f"    … and {len(to_insert) - 30} more")
    print()

    # ── Phase 1: INSERT new councils into local_authorities ────────────────────

    print("Phase 1 — INSERT new councils into local_authorities (PRIMARY OBJECTIVE)…")
    inserted = 0
    insert_errors = []

    for ocd in to_insert:
        row_data = {
            "gss_code": f"OCD-{ocd['ocd_id']}",
            "name": ocd["authority"],
            "authority_type": ocd["authority_type"],
            "tier": ocd["tier"],
            "country": "England",
        }
        if ocd["total_seats"]:
            row_data["total_seats"] = ocd["total_seats"]
        if ocd["controlling_party"]:
            row_data["controlling_party"] = ocd["controlling_party"]
        if ocd["control_type"]:
            row_data["control_type"] = ocd["control_type"]
        if ocd["composition"]:
            row_data["composition"] = ocd["composition"]

        try:
            new_row = _post_one("local_authorities", row_data, returning=True)
            ocd["_matched_row"] = new_row
            if new_row and new_row.get("id"):
                name_norm_map[ocd["normalised"]] = new_row
            inserted += 1
            print(f"  ✓ Inserted: {ocd['authority']} (gss_code=OCD-{ocd['ocd_id']})")
        except RuntimeError as exc:
            msg = str(exc)
            insert_errors.append((ocd["authority"], msg))
            print(f"  ✗ Error inserting {ocd['authority']}: {msg[:120]}")

    print(f"\n  Inserted {inserted} / {len(to_insert)} new councils.")
    if insert_errors:
        print(f"  {len(insert_errors)} insert error(s) — see above.")
    print()

    # ── Phase 2: UPDATE composition for matched councils ───────────────────────

    print("Phase 2 — UPDATE composition on matched local_authorities (SECONDARY)…")
    updated = 0
    update_errors = []

    for ocd in matched:
        existing = ocd["_matched_row"]
        if not existing or not existing.get("id"):
            continue
        patch = {}
        if ocd["controlling_party"] is not None:
            patch["controlling_party"] = ocd["controlling_party"]
        if ocd["control_type"]:
            patch["control_type"] = ocd["control_type"]
        if ocd["total_seats"]:
            patch["total_seats"] = ocd["total_seats"]
        if ocd["composition"]:
            patch["composition"] = ocd["composition"]
        if not patch:
            continue
        try:
            _patch("local_authorities", "id", existing["id"], patch)
            updated += 1
        except RuntimeError as exc:
            update_errors.append((ocd["authority"], str(exc)))

    print(f"  Updated {updated} matched councils with OCD composition data.")
    if update_errors:
        for name, msg in update_errors:
            print(f"  ✗ PATCH error — {name}: {msg[:100]}")
    print()

    # ── Phase 3: Write composition to council_data ─────────────────────────────

    council_data_written = 0

    if council_data_schema_ok:
        print("Phase 3 — Write composition to council_data (SECONDARY)…")

        # Fetch existing council_data local_authority_ids to decide PATCH vs POST
        try:
            existing_cd = _get("council_data",
                                "select=id,local_authority_id&local_authority_id=not.is.null&limit=1000")
            existing_cd_map = {r["local_authority_id"]: r["id"] for r in existing_cd if r.get("local_authority_id")}
        except Exception as exc:
            print(f"  WARNING: Could not fetch existing council_data rows: {exc}. Skipping phase.")
            existing_cd_map = {}

        now_iso = datetime.utcnow().isoformat() + "Z"
        composition_source = f"Open Council Data UK / CC-BY-SA (dataset date: {dataset_date_str})"
        composition_verified_at = dataset_date.isoformat() + "T00:00:00Z" if dataset_date else None

        cd_inserts = []

        all_councils = matched + [o for o in to_insert if o.get("_matched_row")]
        for ocd in all_councils:
            mr = ocd.get("_matched_row")
            if not mr:
                continue
            auth_id = mr.get("id")
            if not auth_id or auth_id == "DRY-RUN-UUID":
                continue

            cd_payload = {
                "local_authority_id": auth_id,
                "council_name": ocd["authority"],
                "council_tier": ocd.get("tier"),
                "composition_source": composition_source,
            }
            if ocd["controlling_party"]:
                cd_payload["controlling_party"] = ocd["controlling_party"]
            if ocd["control_type"]:
                cd_payload["control_type"] = ocd["control_type"]
            if ocd["total_seats"]:
                cd_payload["total_seats"] = ocd["total_seats"]
            if ocd["composition"]:
                cd_payload["composition"] = ocd["composition"]
            if composition_verified_at:
                cd_payload["composition_verified_at"] = composition_verified_at

            if auth_id in existing_cd_map:
                # PATCH existing row
                try:
                    _patch("council_data", "id", existing_cd_map[auth_id], cd_payload)
                    council_data_written += 1
                except RuntimeError as exc:
                    print(f"  ✗ council_data PATCH failed for {ocd['authority']}: {str(exc)[:100]}")
            else:
                cd_inserts.append(cd_payload)

        # Batch POST new council_data rows
        BATCH = 50
        for start in range(0, len(cd_inserts), BATCH):
            batch = cd_inserts[start: start + BATCH]
            try:
                _post_batch("council_data", batch)
                council_data_written += len(batch)
            except RuntimeError as exc:
                print(f"  ✗ council_data batch insert failed: {str(exc)[:120]}")

        print(f"  council_data rows written/updated: {council_data_written}")
    else:
        print("Phase 3 — SKIPPED (council_data schema not ready — run migration first)")
    print()

    # ── Summary ────────────────────────────────────────────────────────────────

    count_after = count_before + (inserted if not DRY_RUN else len(to_insert))
    still_missing = max(0, TARGET_COUNCILS - count_after)

    print("=" * 70)
    print("IMPORT SUMMARY")
    print("=" * 70)
    print(f"  OCD English councils parsed:          {len(ocd_english):>4}")
    print(f"  Matched in local_authorities:         {len(matched):>4}")
    print(f"  Inserted as new:                      {inserted:>4}  (placeholder GSS codes: OCD-NNN)")
    print(f"  Insert errors:                        {len(insert_errors):>4}")
    print(f"  Composition updates (matched):        {updated:>4}")
    print(f"  council_data rows written:            {council_data_written:>4}")
    print()
    print(f"  local_authorities before import:      {count_before:>4}")
    print(f"  local_authorities after import:       {count_after:>4}")
    print(f"  Target (English councils):            {TARGET_COUNCILS:>4}")
    print(f"  Still missing vs {TARGET_COUNCILS} target:         {still_missing:>4}")

    if still_missing > 0:
        print()
        print(f"  NOTE: {still_missing} councils remain missing. Possible causes:")
        print("    • Council names differ significantly between OCD and existing DB records.")
        print("    • Councils exist in DB under a different country/gss_code.")
        print("    • Councils abolished in LGR not yet removed from the 317 count.")
        print("  OCD-NNN placeholder GSS codes mark all new inserts — replace with real")
        print("  ONS GSS codes (E06/E07/E08/E09/E10 series) before production use.")

    if DRY_RUN:
        print()
        print("  [DRY RUN — no changes were written to Supabase]")

    print("=" * 70)
    sys.exit(0)


if __name__ == "__main__":
    main()
