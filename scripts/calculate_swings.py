"""
Phase 2 — Calculate and populate the swings table.

Uses notional 2019 (2024 boundaries) vs actual 2024 results.
Safe to re-run: clears existing swings for this election pair before inserting.

Swing formula (UK standard two-party swing):
  Swing(A→B) = ((B_2024 - B_2019) - (A_2024 - A_2019)) / 2
  Positive value = swing TO the to_party.

Party pairings calculated:
  Con → Lab    (national battleground)
  Con → LD     (South England / Lib Dem targets)
  Con → RUK    (right flank; uses Brexit Party as 2019 proxy for Reform UK)
  Lab → LD     (tactical / London commuter belt)
  Lab → SNP    (Scotland)
  Con → SNP    (Scotland)

Usage:
    python scripts/calculate_swings.py
"""

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
    print("ERROR: SUPABASE_SERVICE_KEY not found.")
    sys.exit(1)

# ── Election IDs ──────────────────────────────────────────────────────────────
ELECTION_2024_ID    = "2f1f78cf-8ce0-41ad-ae37-7510f280deb1"
ELECTION_NOTIONAL_ID = "79aa6e94-c3a6-4aa7-a6d0-79159c5e63a1"

# ── Party IDs ─────────────────────────────────────────────────────────────────
LAB_ID    = "7cf90c7d-1540-4737-b581-48613d4715c2"   # Labour
LAB_COOP  = "69dbde7a-4ff0-4cd8-af39-742fd6477c3d"   # Labour and Co-operative (combined into LAB)
CON_ID    = "a4f20caf-ba89-4fb0-9ae3-313a7f937719"   # Conservative
LD_ID     = "fcd69d3d-d445-428e-87e4-09adf95a4a1e"   # Liberal Democrat
RUK_ID    = "a2b82e7c-5f8d-425d-a1b2-36db57c7268e"   # Reform UK (2024)
BRX_ID    = "58458f9f-81af-4e43-9e5a-54948f809132"   # Brexit Party (2019 proxy for Reform UK)
SNP_ID    = "a72cbc23-e79e-4868-9e70-61b3460acbc9"   # Scottish National Party
GREEN_ID  = "d521f935-07cf-4772-bad3-ef0b27eda4b1"   # Green

# Pairings: (from_party_id, to_party_id, label, 2019_proxy_for_to)
# 2019_proxy_for_to = party_id to use for "to_party" in the 2019 data where it differed
PAIRINGS = [
    (CON_ID,  LAB_ID,  "Con->Lab",  LAB_ID),
    (CON_ID,  LD_ID,   "Con->LD",   LD_ID),
    (CON_ID,  RUK_ID,  "Con->RUK",  BRX_ID),   # Reform UK didn't exist in 2019; use Brexit Party
    (LAB_ID,  LD_ID,   "Lab->LD",   LD_ID),
    (LAB_ID,  SNP_ID,  "Lab->SNP",  SNP_ID),
    (CON_ID,  SNP_ID,  "Con->SNP",  SNP_ID),
]


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
        data = _req("GET", table, k, params=params) or []
        results.extend(data)
        if len(data) < 1000:
            break
        offset += 1000
    return results


def delete_where(table, filters, key=None):
    k = key or SERVICE_KEY
    return _req("DELETE", table, k, params=filters)


def insert_many(table, rows, key=None):
    k = key or SERVICE_KEY
    total = 0
    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i: i + batch_size]
        _req("POST", table, k, body=batch, prefer="return=minimal")
        total += len(batch)
        print(f"  Batch {i // batch_size + 1}: {len(batch)} rows ({total}/{len(rows)})")
    return total


# ── Build vote-share index ────────────────────────────────────────────────────

def build_share_index(election_id, party_ids_to_combine=None):
    """
    Returns: { constituency_id: { party_id: vote_share } }

    party_ids_to_combine: list of party_ids whose vote_shares should be
    summed into the first entry of the list.
    e.g. [LAB_ID, LAB_COOP] → Lab+Co-op combined under LAB_ID.
    """
    rows = fetch_all(
        "results",
        "constituency_id,party_id,vote_share",
        {"election_id": f"eq.{election_id}"},
    )

    index = {}
    for r in rows:
        cid = r["constituency_id"]
        pid = r["party_id"]
        share = r["vote_share"]
        if share is None:
            continue

        # Combine co-op into main Labour
        if party_ids_to_combine:
            combo_target = party_ids_to_combine[0]
            combo_sources = party_ids_to_combine[1:]
            if pid in combo_sources:
                pid = combo_target

        if cid not in index:
            index[cid] = {}
        index[cid][pid] = index[cid].get(pid, 0.0) + float(share)

    return index


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 65)
    print("PHASE 2 — CALCULATE SWINGS")
    print("  Notional 2019 (2024 boundaries) -> Actual 2024")
    print("=" * 65)

    # ── 1. Load vote shares for both elections ────────────────────────────────
    print("\n--- Loading 2024 results ---")
    shares_2024 = build_share_index(
        ELECTION_2024_ID,
        party_ids_to_combine=[LAB_ID, LAB_COOP],
    )
    print(f"  Constituencies with 2024 data: {len(shares_2024)}")

    print("\n--- Loading notional 2019 results ---")
    shares_2019 = build_share_index(ELECTION_NOTIONAL_ID)
    print(f"  Constituencies with notional 2019 data: {len(shares_2019)}")

    # Constituencies in both
    both = set(shares_2024.keys()) & set(shares_2019.keys())
    print(f"\n  Constituencies in both elections: {len(both)}")

    # ── 2. Clear existing swings for this election pair (idempotency) ─────────
    print("\n--- Clearing existing swings for this election pair ---")
    try:
        delete_where("swings", {
            "from_election_id": f"eq.{ELECTION_NOTIONAL_ID}",
            "to_election_id":   f"eq.{ELECTION_2024_ID}",
        })
        print("  Cleared.")
    except RuntimeError as e:
        # If DELETE fails (e.g. empty table or RLS), continue
        print(f"  Note: {e}")

    # ── 3. Calculate swings ───────────────────────────────────────────────────
    print("\n--- Calculating constituency swings ---")
    swing_rows = []
    pairing_stats = {label: [] for _, _, label, _ in PAIRINGS}
    skipped_per_pairing = {label: 0 for _, _, label, _ in PAIRINGS}

    for cid in sorted(both):
        s24 = shares_2024[cid]
        s19 = shares_2019[cid]

        for from_pid, to_pid, label, to_proxy_2019 in PAIRINGS:
            # Need both parties' shares in both elections
            from_2024 = s24.get(from_pid)
            to_2024   = s24.get(to_pid)
            from_2019 = s19.get(from_pid)
            to_2019   = s19.get(to_proxy_2019)

            # Skip if any share is missing (party didn't stand)
            if any(v is None for v in [from_2024, to_2024, from_2019, to_2019]):
                skipped_per_pairing[label] += 1
                continue

            # UK two-party swing formula
            swing = ((to_2024 - to_2019) - (from_2024 - from_2019)) / 2.0
            swing = round(swing, 6)

            pairing_stats[label].append(swing)
            swing_rows.append({
                "id":               str(uuid.uuid4()),
                "constituency_id":  cid,
                "from_election_id": ELECTION_NOTIONAL_ID,
                "to_election_id":   ELECTION_2024_ID,
                "from_party_id":    from_pid,
                "to_party_id":      to_pid,
                "swing_value":      swing,
            })

    print(f"  Total swing records to insert: {len(swing_rows)}")

    # ── 4. National average swings (stored with constituency_id = NULL) ───────
    # If the DB schema requires constituency_id, we'll catch and warn.
    print("\n--- National average swings ---")
    national_rows = []
    for from_pid, to_pid, label, _ in PAIRINGS:
        values = pairing_stats[label]
        if not values:
            continue
        national_avg = round(sum(values) / len(values), 6)
        national_rows.append({
            "id":               str(uuid.uuid4()),
            "constituency_id":  None,
            "from_election_id": ELECTION_NOTIONAL_ID,
            "to_election_id":   ELECTION_2024_ID,
            "from_party_id":    from_pid,
            "to_party_id":      to_pid,
            "swing_value":      national_avg,
        })
        skipped = skipped_per_pairing[label]
        print(f"  {label:<15}: avg={national_avg:+.2%}  n={len(values)}  skipped={skipped}")

    # ── 5. Insert constituency swings ─────────────────────────────────────────
    print(f"\n--- Inserting {len(swing_rows)} constituency swing records ---")
    insert_many("swings", swing_rows)

    # ── 6. Insert national averages ───────────────────────────────────────────
    print(f"\n--- Inserting {len(national_rows)} national average records ---")
    try:
        insert_many("swings", national_rows)
        national_inserted = True
    except RuntimeError as e:
        print(f"  WARNING: Could not insert national averages (constituency_id=NULL may not be allowed): {e}")
        national_inserted = False

    # ── 7. Verification ───────────────────────────────────────────────────────
    print("\n--- Verification ---")
    all_swings = fetch_all("swings", "id", {
        "from_election_id": f"eq.{ELECTION_NOTIONAL_ID}",
        "to_election_id":   f"eq.{ELECTION_2024_ID}",
    })
    print(f"  Swing records in DB: {len(all_swings)}")

    # Sample: top 5 Con→Lab swings
    print("\n--- Sample: top 10 Con→Lab swings ---")
    con_lab = fetch_all("swings", "constituency_id,swing_value", {
        "from_election_id": f"eq.{ELECTION_NOTIONAL_ID}",
        "to_election_id":   f"eq.{ELECTION_2024_ID}",
        "from_party_id":    f"eq.{CON_ID}",
        "to_party_id":      f"eq.{LAB_ID}",
        "order":            "swing_value.desc",
        "limit":            "10",
        "not.constituency_id": "is.null",
    })
    # Build constituency name lookup for sample
    if con_lab:
        cids = [r["constituency_id"] for r in con_lab[:10]]
        name_lookup = {}
        for cid in cids:
            rows = fetch_all("constituencies", "id,name", {"id": f"eq.{cid}"})
            if rows:
                name_lookup[cid] = rows[0]["name"]
        for r in con_lab[:10]:
            name = name_lookup.get(r["constituency_id"], r["constituency_id"][:8])
            print(f"  {name:<45} swing={r['swing_value']:+.2%}")

    print("\n" + "=" * 65)
    print("PHASE 2 COMPLETE")
    print(f"  Constituency swings inserted: {len(swing_rows)}")
    print(f"  National averages inserted:   {'yes' if national_inserted else 'no (see warning)'}")
    print(f"  Total in DB:                  {len(all_swings)}")
    print("=" * 65)


if __name__ == "__main__":
    main()
