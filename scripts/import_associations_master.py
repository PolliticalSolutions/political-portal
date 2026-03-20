"""
import_associations_master.py
Imports the full Conservative Party association structure from the Excel master file.

Columns: Nation | Region | PartyArea | Association | Constituency

Import order:
  1. party_regions  (unique Nation+Region combos)
  2. party_areas    (unique PartyArea ->region_id)
  3. associations   (unique Association name ->area_id, region_id, nation, region, party_area)
  4. association_constituencies (link each row's Constituency to its Association)
  5. annual_price update on each association (500 + (n-1)*250)

Usage:
  py scripts/import_associations_master.py
"""

import os
import re
import sys
from pathlib import Path

import openpyxl
from dotenv import load_dotenv
from supabase import create_client

# --Config ──────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent.parent
load_dotenv(BASE_DIR / ".env")

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("ERROR: VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env")

EXCEL_PATH = BASE_DIR / "scripts" / "Association_Pricing_Sheet-_aggregated_prices.xlsx"
UNMATCHED_LOG = BASE_DIR / "scripts" / "unmatched_constituencies.txt"

# --Helpers ──────────────────────────────────────────────────────────────────

def normalise(s):
    """Lowercase, strip, collapse whitespace for fuzzy matching."""
    if not s:
        return ""
    import unicodedata
    # Decompose Unicode so accented chars (e.g. Welsh w-circumflex) become base + combining
    s = unicodedata.normalize("NFD", s)
    # Strip combining diacritical marks
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.strip().lower()
    s = re.sub(r"[&]", "and", s)
    s = re.sub(r"[-]", " ", s)      # hyphens become spaces (Cwm-Tawe -> Cwm Tawe)
    s = re.sub(r"[^\w\s]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s


def calc_price(n):
    return 500 + max(0, n - 1) * 250


# --Load Excel ───────────────────────────────────────────────────────────────

print(f"Loading {EXCEL_PATH.name}…")
wb = openpyxl.load_workbook(EXCEL_PATH)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))

# Row 0 = headers
headers = [str(h).strip() for h in rows[0]]
print(f"Headers: {headers}")
data = []
for row in rows[1:]:
    if all(v is None for v in row):
        continue
    data.append({
        "nation":       (row[0] or "").strip(),
        "region":       (row[1] or "").strip(),
        "party_area":   (row[2] or "").strip(),
        "association":  (row[3] or "").strip(),
        "constituency": (row[4] or "").strip(),
    })

print(f"Data rows: {len(data)}")

# --Connect to Supabase ──────────────────────────────────────────────────────

db = create_client(SUPABASE_URL, SUPABASE_KEY)

# --Phase 1: party_regions ───────────────────────────────────────────────────

print("\n-- party_regions --")
unique_regions = {}
for row in data:
    key = (row["nation"], row["region"])
    if key not in unique_regions:
        unique_regions[key] = {"nation": row["nation"], "name": row["region"]}

region_id_map = {}  # region_name ->uuid

for region in unique_regions.values():
    res = db.table("party_regions").upsert(
        {"name": region["name"], "nation": region["nation"]},
        on_conflict="name"
    ).execute()
    # fetch back to get id
    rec = db.table("party_regions").select("id").eq("name", region["name"]).single().execute()
    region_id_map[region["name"]] = rec.data["id"]
    print(f"  region: {region['name']} ->{rec.data['id']}")

print(f"Regions upserted: {len(region_id_map)}")

# --Phase 2: party_areas ─────────────────────────────────────────────────────

print("\n--party_areas --")
unique_areas = {}
for row in data:
    if row["party_area"] not in unique_areas:
        unique_areas[row["party_area"]] = row["region"]

area_id_map = {}  # area_name ->uuid

for area_name, region_name in unique_areas.items():
    region_id = region_id_map.get(region_name)
    db.table("party_areas").upsert(
        {"name": area_name, "region_id": region_id},
        on_conflict="name"
    ).execute()
    rec = db.table("party_areas").select("id").eq("name", area_name).single().execute()
    area_id_map[area_name] = rec.data["id"]

print(f"Areas upserted: {len(area_id_map)}")

# --Phase 3: associations ────────────────────────────────────────────────────

print("\n--associations --")
unique_assocs = {}
for row in data:
    name = row["association"]
    if name not in unique_assocs:
        unique_assocs[name] = {
            "name":       name,
            "nation":     row["nation"],
            "region":     row["region"],
            "party_area": row["party_area"],
            "area_id":    area_id_map.get(row["party_area"]),
            "region_id":  region_id_map.get(row["region"]),
        }

assoc_id_map = {}  # assoc_name ->uuid

for assoc in unique_assocs.values():
    existing = db.table("associations").select("id").eq("name", assoc["name"]).execute()
    if existing.data:
        assoc_id = existing.data[0]["id"]
        db.table("associations").update({
            "nation":     assoc["nation"],
            "region":     assoc["region"],
            "party_area": assoc["party_area"],
            "area_id":    assoc["area_id"],
            "region_id":  assoc["region_id"],
        }).eq("id", assoc_id).execute()
    else:
        res = db.table("associations").insert({
            "name":       assoc["name"],
            "nation":     assoc["nation"],
            "region":     assoc["region"],
            "party_area": assoc["party_area"],
            "area_id":    assoc["area_id"],
            "region_id":  assoc["region_id"],
        }).execute()
        assoc_id = res.data[0]["id"]
    assoc_id_map[assoc["name"]] = assoc_id

print(f"Associations upserted: {len(assoc_id_map)}")

# --Phase 4: constituency matching ──────────────────────────────────────────

print("\n--constituencies lookup --")
# Paginate to get all rows (table has 1954 rows with historical duplicates)
all_cons = []
page_size = 1000
offset = 0
while True:
    res = db.table("constituencies").select("id, name, ons_code").range(offset, offset + page_size - 1).execute()
    batch = res.data or []
    all_cons.extend(batch)
    if len(batch) < page_size:
        break
    offset += page_size

# Filter to PCON24 boundaries only (E14001xxx = England 2024, W07xxx = Wales 2024)
all_cons = [
    c for c in all_cons
    if (c.get("ons_code") or "").startswith("E14001")
    or (c.get("ons_code") or "").startswith("W07")
]
print(f"  PCON24 constituencies loaded: {len(all_cons)}")

exact_map = {c["name"].strip().lower(): c for c in all_cons}
fuzzy_map = {normalise(c["name"]): c for c in all_cons}

# --Phase 5: association_constituencies ─────────────────────────────────────

print("\n--association_constituencies --")
links_created = 0
unmatched = []

for row in data:
    assoc_name = row["association"]
    con_name   = row["constituency"]
    assoc_id   = assoc_id_map.get(assoc_name)

    if not assoc_id:
        unmatched.append(f"NO_ASSOC_ID | {assoc_name} | {con_name}")
        continue

    # Try exact match
    con = exact_map.get(con_name.strip().lower())

    # Try fuzzy match
    if not con:
        con = fuzzy_map.get(normalise(con_name))

    if not con:
        unmatched.append(f"UNMATCHED | {assoc_name} | {con_name}")
        continue

    db.table("association_constituencies").upsert(
        {"association_id": assoc_id, "constituency_id": con["id"]},
        on_conflict="association_id,constituency_id"
    ).execute()
    links_created += 1

print(f"Links created: {links_created}")
print(f"Unmatched: {len(unmatched)}")

# --Phase 6: update annual_price ─────────────────────────────────────────────

print("\n--annual_price update --")
for assoc_name, assoc_id in assoc_id_map.items():
    count_res = db.table("association_constituencies")\
        .select("id", count="exact")\
        .eq("association_id", assoc_id)\
        .execute()
    n = count_res.count or 0
    price = calc_price(n)
    db.table("associations").update({"annual_price": price}).eq("id", assoc_id).execute()

print("annual_price updated on all associations.")

# --Write unmatched log ──────────────────────────────────────────────────────

UNMATCHED_LOG.write_text("\n".join(unmatched) if unmatched else "All constituencies matched.", encoding="utf-8")
print(f"\nUnmatched log ->{UNMATCHED_LOG}")

# --Summary ───────────────────────────────────────────────────────────────────

print("\n== IMPORT SUMMARY ==")
print(f"  party_regions:            {len(region_id_map)}")
print(f"  party_areas:              {len(area_id_map)}")
print(f"  associations:             {len(assoc_id_map)}")
print(f"  constituency links:       {links_created}")
print(f"  unmatched constituencies: {len(unmatched)}")

if unmatched:
    print("\nUnmatched constituencies:")
    for u in unmatched:
        print(f"  {u}")
