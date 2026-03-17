"""
Phase 4 — Import notional 2019 election results on 2024 boundaries.

Source: UK Parliament Election Results portal
  https://electionresults.parliament.uk/general-elections/5/candidacies.csv

Creates election record:
  name        = "2019 Notional (2024 Boundaries)"
  election_date = 2019-12-12
  election_type = notional

Then inserts one results row per party per constituency.

Safe to re-run: will skip if the election record already exists.

Usage:
    python scripts/import_notional_2019.py
"""

import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

# ── Credentials ──────────────────────────────────────────────────────────────
SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"
ANON_KEY = "sb_publishable_A7AT-20ghVjk_BNk8ZnH0A_vKJKIxh-"

# Load service key from .env
SERVICE_KEY = None
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
if os.path.exists(env_path):
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("SUPABASE_SERVICE_KEY="):
                SERVICE_KEY = line.split("=", 1)[1].strip()
                break

if not SERVICE_KEY:
    SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_KEY not found in .env or environment.")
    sys.exit(1)

NOTIONAL_CSV = os.path.join(os.path.dirname(__file__), "notional-2019-candidacies.csv")
NOTIONAL_ELECTION_DATE = "2019-12-12"
NOTIONAL_ELECTION_NAME = "2019 Notional (2024 Boundaries)"
NOTIONAL_ELECTION_TYPE = "notional"

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _req(method, path, key, body=None, params=None, prefer=None):
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
        msg = e.read().decode()
        raise RuntimeError(f"HTTP {e.code} {method} {path}: {msg}") from e


def fetch_all(table, select, filters=None, key=None):
    k = key or ANON_KEY
    results, offset = [], 0
    while True:
        params = {"select": select, "limit": 1000, "offset": offset}
        if filters:
            params.update(filters)
        data = _req("GET", table, k, params=params)
        results.extend(data or [])
        if len(data or []) < 1000:
            break
        offset += 1000
    return results


def insert_one(table, row, key=None):
    k = key or SERVICE_KEY
    return _req("POST", table, k, body=row, prefer="return=representation")


def insert_many(table, rows, key=None):
    """Insert in batches of 500."""
    k = key or SERVICE_KEY
    total = 0
    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        _req("POST", table, k, body=batch, prefer="return=minimal")
        total += len(batch)
        print(f"  Inserted batch {i // batch_size + 1}: {len(batch)} rows ({total}/{len(rows)} total)")
    return total


# ── Party mapping: CSV abbreviation → DB party_id ────────────────────────────
# Duplicates in DB (e.g. two "Con" parties): always prefer the one used in 2024.
MANUAL_ABBR_MAP = {
    "Con":   "a4f20caf-ba89-4fb0-9ae3-313a7f937719",  # Conservative (2024)
    "Lab":   "7cf90c7d-1540-4737-b581-48613d4715c2",  # Labour (2024, incl. Co-op)
    "LD":    "fcd69d3d-d445-428e-87e4-09adf95a4a1e",  # Liberal Democrat (2024)
    "Green": None,                                      # resolved per constituency country below
    "SNP":   "a72cbc23-e79e-4868-9e70-61b3460acbc9",  # Scottish National Party
    "PC":    "e0619f22-753d-47b9-8d71-093b8d7a0035",  # Plaid Cymru
    "SF":    "0a823344-c7ed-4148-8435-7f0fe2992aaf",  # Sinn Fein
    "DUP":   "96ec49c8-0b69-488f-b2df-dc8f266e8306",  # Democratic Unionist Party
    "APNI":  "6303ee5f-4f66-4905-ac60-0a418458fcf6",  # Alliance
    "SDLP":  "645ee274-952c-4c3e-bb1e-8ef402ae533c",  # Social Democratic and Labour Party
    "UUP":   "ca2228d7-3831-44af-a56b-345d95a4c383",  # Ulster Unionist Party
    "TUV":   "1dfc9457-20d6-47e8-b3e1-0298b030145b",  # Traditional Unionist Voice
    "UKIP":  "2b0faaf8-173b-4279-9abb-21de1333321c",  # UK Independence Party
    "CPA":   "56950798-376a-40b0-a9bf-15aac8949012",  # Christian Peoples Alliance
    "MRLP":  "73cc2099-9739-4f8a-a91e-b00c06057580",  # Official Monster Raving Loony Party
    "SDP":   "7638a6a9-502e-4783-b73c-25cf600aa71c",  # Social Democratic Party
    "Lib":   "0e417d09-1a37-4739-8fab-df917ef4ce24",  # Liberal
    "Yrks":  "0431ef32-6ccb-402f-8aca-7e353d76d23a",  # Yorkshire Party
    "BRX":   "58458f9f-81af-4e43-9e5a-54948f809132",  # Brexit (→ Brexit Party)
    "Alba":  "60ef47a1-43a2-4f39-a7a6-a25fe92df314",  # Alba Party
    "TUSC":  "4e829a39-60f9-4ff2-ada5-56af387a6e75",  # Trade Unionist and Socialist Coalition
    "WEP":   "92336003-471b-4b1c-8d7e-c9b76128952a",  # Women's Equality Party
    "ED":    "40143ac1-1b8e-4cfa-80f7-7216dc5ff8c9",  # English Democrats
    "NHAP":  "79ff189b-0389-4cf7-a078-055b5046fb58",  # National Health Action Party
    "PBPA":  "4ba13099-35f6-44b2-9546-6c20086bc5df",  # People Before Profit Alliance
    "SL":    "a6eb2259-a330-45bc-8cf9-07297dea8720",  # Socialist Labour Party
    "SPGB":  "0972984c-20cd-43ee-b252-3c5f7884eb8b",  # Socialist Party of Great Britain
    "SSP":   "aca3eaa8-9466-450f-9091-d93afbab06ee",  # Scottish Socialist Party
}

GREEN_ENG_WAL = "d521f935-07cf-4772-bad3-ef0b27eda4b1"   # Green (England/Wales)
GREEN_SCO     = "c05fd56c-e8c0-4e33-b19a-f7533a2df09f"   # Scottish Green Party


def resolve_party_id(abbr, ons_code, party_name, db_abbr_map, dynamic_cache):
    """Return a party_id for the given CSV abbreviation, creating a new record if needed."""
    if not abbr:
        return None  # Skip blank-party rows

    # Green: split by nation
    if abbr == "Green":
        return GREEN_SCO if ons_code.startswith("S") else GREEN_ENG_WAL

    # Manual map first
    if abbr in MANUAL_ABBR_MAP:
        return MANUAL_ABBR_MAP[abbr]

    # Dynamic lookup from DB (built at startup)
    if abbr in db_abbr_map:
        return db_abbr_map[abbr]

    # Cache from this session
    if abbr in dynamic_cache:
        return dynamic_cache[abbr]

    # Create a new party record
    new_id = str(uuid.uuid4())
    print(f"  Creating new party: abbr={abbr!r} name={party_name!r} id={new_id}")
    insert_one("parties", {
        "id": new_id,
        "name": party_name or abbr,
        "short_name": abbr,
        "colour_hex": None,
    })
    dynamic_cache[abbr] = new_id
    return new_id


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 65)
    print("PHASE 4 — IMPORT NOTIONAL 2019 RESULTS (2024 BOUNDARIES)")
    print("=" * 65)

    # ── 1. Check CSV exists ───────────────────────────────────────────────────
    if not os.path.exists(NOTIONAL_CSV):
        print(f"ERROR: CSV not found at {NOTIONAL_CSV}")
        print("Run the download step first.")
        sys.exit(1)

    with open(NOTIONAL_CSV, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    print(f"\nCSV loaded: {len(rows)} rows")

    # ── 2. Idempotency check — has this election already been imported? ────────
    print("\n--- Checking for existing notional election ---")
    existing = fetch_all("elections", "id,name,election_date,election_type", {
        "election_type": f"eq.{NOTIONAL_ELECTION_TYPE}",
        "election_date": f"eq.{NOTIONAL_ELECTION_DATE}",
    })
    if existing:
        elec = existing[0]
        print(f"Election already exists: id={elec['id']}  name={elec['name']}")
        count_check = fetch_all("results", "id", {"election_id": f"eq.{elec['id']}"})
        print(f"Results already in DB: {len(count_check)}")
        if len(count_check) > 0:
            print("Import already complete. Run again only if you want to verify counts.")
            print("To reimport: delete the election record and all its results first.")
            sys.exit(0)
        election_id = elec["id"]
    else:
        # ── 3. Create election record ─────────────────────────────────────────
        print("\n--- Creating election record ---")
        election_id = str(uuid.uuid4())
        insert_one("elections", {
            "id": election_id,
            "name": NOTIONAL_ELECTION_NAME,
            "election_date": NOTIONAL_ELECTION_DATE,
            "election_type": NOTIONAL_ELECTION_TYPE,
        })
        print(f"Created election: id={election_id}  name={NOTIONAL_ELECTION_NAME}")

    # ── 4. Build lookups ──────────────────────────────────────────────────────
    print("\n--- Building constituency lookup ---")
    all_con = fetch_all("constituencies", "id,ons_code")
    ons_to_id = {c["ons_code"]: c["id"] for c in all_con}
    print(f"Constituencies in DB: {len(ons_to_id)}")

    print("\n--- Building party lookup ---")
    all_parties = fetch_all("parties", "id,short_name,name")
    # Build abbreviation→id map; prefer the MANUAL_ABBR_MAP entries when there are duplicates
    db_abbr_map = {}
    for p in all_parties:
        abbr = p["short_name"]
        if abbr and abbr not in db_abbr_map and abbr not in MANUAL_ABBR_MAP:
            db_abbr_map[abbr] = p["id"]
    print(f"Parties in DB: {len(all_parties)}, auto-mapped: {len(db_abbr_map)}")

    dynamic_cache = {}  # newly created parties this session

    # ── 5. Process CSV rows ───────────────────────────────────────────────────
    print("\n--- Processing CSV rows ---")
    result_rows = []
    skipped_no_party = 0
    skipped_no_constituency = 0
    ons_not_found = set()

    for row in rows:
        abbr = row["Main party abbreviation"].strip()
        party_name = row["Main party name"].strip()
        ons_code = row["Constituency geographic code"].strip()

        # Skip blank-party rows
        if not abbr and not party_name:
            skipped_no_party += 1
            continue

        # Look up constituency
        constituency_id = ons_to_id.get(ons_code)
        if not constituency_id:
            ons_not_found.add(ons_code)
            skipped_no_constituency += 1
            continue

        # Resolve party
        party_id = resolve_party_id(abbr, ons_code, party_name, db_abbr_map, dynamic_cache)
        if not party_id:
            skipped_no_party += 1
            continue

        # Parse numeric fields
        def num(val, cast=float, default=None):
            v = val.strip() if val else ""
            if not v:
                return default
            try:
                return cast(v)
            except ValueError:
                return default

        votes      = num(row["Candidate vote count"], int, None)
        vote_share = num(row["Candidate vote share"], float, None)
        majority   = num(row["Majority"], int, None)
        electorate = num(row["Electorate"], int, None)
        valid_votes = num(row["Election valid vote count"], int, None)
        position   = num(row["Candidate result position"], int, None)

        turnout = None
        if electorate and valid_votes and electorate > 0:
            turnout = round(valid_votes / electorate, 6)

        is_winner = (position == 1)

        result_rows.append({
            "id":              str(uuid.uuid4()),
            "constituency_id": constituency_id,
            "party_id":        party_id,
            "election_id":     election_id,
            "votes":           votes,
            "vote_share":      vote_share,
            "votes_change":    None,
            "vote_share_change": None,
            "is_winner":       is_winner,
            "majority":        majority if is_winner else None,
            "turnout":         turnout,
            "electorate":      electorate,
        })

    print(f"  Rows to insert: {len(result_rows)}")
    print(f"  Skipped (no party): {skipped_no_party}")
    print(f"  Skipped (constituency not in DB): {skipped_no_constituency}")
    if ons_not_found:
        print(f"  ONS codes not found in DB ({len(ons_not_found)}): {sorted(ons_not_found)[:10]}")

    # ── 6. Insert results ─────────────────────────────────────────────────────
    print(f"\n--- Inserting {len(result_rows)} result rows ---")
    inserted = insert_many("results", result_rows)

    # ── 7. Verification ───────────────────────────────────────────────────────
    print("\n--- Verification ---")
    verify = fetch_all("results", "id", {"election_id": f"eq.{election_id}"})
    print(f"Results now in DB for this election: {len(verify)}")

    winners = fetch_all("results", "constituency_id", {
        "election_id": f"eq.{election_id}",
        "is_winner": "eq.true",
    })
    print(f"Winner rows: {len(winners)}")

    print("\n" + "=" * 65)
    print("PHASE 4 COMPLETE")
    print(f"  Election id:  {election_id}")
    print(f"  Results rows: {len(verify)}")
    print(f"  Winners:      {len(winners)}")
    print("=" * 65)


if __name__ == "__main__":
    main()
