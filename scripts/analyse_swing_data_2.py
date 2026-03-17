"""
Phase 1 extended — check ons_code overlap and swings table schema.
"""
import os, json, urllib.request, urllib.parse

SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"
SUPABASE_KEY = "sb_publishable_A7AT-20ghVjk_BNk8ZnH0A_vKJKIxh-"

def get(path, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

def fetch_all(table, select, filters=None, page_size=1000):
    results, offset = [], 0
    while True:
        params = {"select": select, "limit": page_size, "offset": offset}
        if filters:
            params.update(filters)
        data = get(table, params)
        results.extend(data)
        if len(data) < page_size:
            break
        offset += page_size
    return results

ELECTION_2024 = "2f1f78cf-8ce0-41ad-ae37-7510f280deb1"
ELECTION_2019 = "032f30e2-322d-4f94-9771-50d6bad0a93f"

print("=== ons_code overlap check ===")
# Get all constituency_ids used in each election, then map to ons_codes
res2024 = fetch_all("results", "constituency_id", {"election_id": f"eq.{ELECTION_2024}", "is_winner": "eq.true"})
res2019 = fetch_all("results", "constituency_id", {"election_id": f"eq.{ELECTION_2019}", "is_winner": "eq.true"})

ids2024 = {r["constituency_id"] for r in res2024}
ids2019 = {r["constituency_id"] for r in res2019}
print(f"Distinct constituency_ids in 2024: {len(ids2024)}")
print(f"Distinct constituency_ids in 2019: {len(ids2019)}")
print(f"ID overlap: {len(ids2024 & ids2019)}")

# Now fetch ons_codes for all constituencies in both elections
all_con = fetch_all("constituencies", "id,ons_code,name")
ons_by_id = {c["id"]: c["ons_code"] for c in all_con}
name_by_id = {c["id"]: c["name"] for c in all_con}

codes2024 = {ons_by_id[i] for i in ids2024 if i in ons_by_id}
codes2019 = {ons_by_id[i] for i in ids2019 if i in ons_by_id}
overlap_codes = codes2024 & codes2019
print(f"\nDistinct ons_codes in 2024: {len(codes2024)}")
print(f"Distinct ons_codes in 2019: {len(codes2019)}")
print(f"ons_code overlap: {len(overlap_codes)}")

if len(overlap_codes) < 10:
    print("\nSample overlapping ons_codes:")
    for c in list(overlap_codes)[:5]:
        print(f"  {c}")
    print("\nSample 2024 ons_codes:")
    for c in list(codes2024)[:5]:
        print(f"  {c}")
    print("\nSample 2019 ons_codes:")
    for c in list(codes2019)[:5]:
        print(f"  {c}")

print("\n=== swings table schema (sample) ===")
swings = get("swings", {"select": "*", "limit": 1})
if swings:
    print("Columns:", list(swings[0].keys()))
else:
    # Try to get schema via OPTIONS or just insert a dummy to see error
    print("Table is empty — checking via known columns from constituencyApi.js")
    # Based on context, expected columns: id, constituency_id, from_election_id, to_election_id,
    # from_party_id, to_party_id, swing_value
    print("Expected columns based on codebase context:")
    print("  id, constituency_id, from_election_id, to_election_id, from_party_id, to_party_id, swing_value")

print("\n=== Party detail (two 'Lab' entries) ===")
parties = fetch_all("parties", "id,name,short_name,colour_hex")
lab_parties = [p for p in parties if "labour" in (p.get("name") or "").lower() or p["short_name"] in ("Lab", "Lab Co-op")]
for p in lab_parties:
    print(f"  id={p['id']}  short={p['short_name']}  name={p['name']}")

print("\n=== All parties with 2024 seats ===")
winners = fetch_all("results", "party_id", {"election_id": f"eq.{ELECTION_2024}", "is_winner": "eq.true"})
party_seats = {}
for r in winners:
    party_seats[r["party_id"]] = party_seats.get(r["party_id"], 0) + 1
party_map = {p["id"]: p for p in parties}
print(f"  {'Short':<12} {'Name':<35} {'Seats':>6}")
for pid, seats in sorted(party_seats.items(), key=lambda x: -x[1]):
    p = party_map.get(pid, {})
    print(f"  {p.get('short_name','?'):<12} {p.get('name','?'):<35} {seats:>6}")
