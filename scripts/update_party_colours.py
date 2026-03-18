"""
Task 8 — Populate party colour_hex in database.

Fetches all parties from Supabase, matches by name/short_name,
and PATCHes colour_hex where null or different.

Usage:
  python scripts/update_party_colours.py
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"
ANON_KEY = "sb_publishable_A7AT-20ghVjk_BNk8ZnH0A_vKJKIxh-"

SERVICE_KEY = None
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
if os.path.exists(env_path):
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            if line.strip().startswith("SUPABASE_SERVICE_KEY="):
                SERVICE_KEY = line.strip().split("=", 1)[1]
                break
if not SERVICE_KEY:
    SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_KEY not found.")
    sys.exit(1)

PARTY_COLOURS = {
    "Labour": "#E4003B",
    "Conservative": "#0087DC",
    "Liberal Democrat": "#FAA61A",
    "Reform UK": "#12B6CF",
    "Scottish National Party": "#FDF38E",
    "SNP": "#FDF38E",
    "Green Party": "#00B140",
    "Green": "#00B140",
    "Plaid Cymru": "#005B54",
    "Democratic Unionist Party": "#D46A4C",
    "DUP": "#D46A4C",
    "Sinn Féin": "#326760",
    "SDLP": "#006B54",
    "Social Democratic and Labour Party": "#006B54",
    "Alliance": "#F6CB2F",
    "Ulster Unionist Party": "#48A5EE",
    "UUP": "#48A5EE",
    "Traditional Unionist Voice": "#0C3A6A",
    "TUV": "#0C3A6A",
}

SHORT_NAME_COLOURS = {
    "Lab": "#E4003B",
    "Con": "#0087DC",
    "LD": "#FAA61A",
    "RUK": "#12B6CF",
    "SNP": "#FDF38E",
    "Green": "#00B140",
    "PC": "#005B54",
    "DUP": "#D46A4C",
    "SF": "#326760",
    "SDLP": "#006B54",
    "APNI": "#F6CB2F",
    "UUP": "#48A5EE",
    "TUV": "#0C3A6A",
}


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
        raise RuntimeError(f"HTTP {e.code} {method} {path}: {e.read().decode()}") from e


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


def resolve_colour(name, short_name):
    """Try matching by full name first, then short_name."""
    if name and name in PARTY_COLOURS:
        return PARTY_COLOURS[name]
    if short_name and short_name in SHORT_NAME_COLOURS:
        return SHORT_NAME_COLOURS[short_name]
    if short_name and short_name in PARTY_COLOURS:
        return PARTY_COLOURS[short_name]
    return None


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 65)
    print("TASK 8 — UPDATE PARTY COLOUR_HEX")
    print("=" * 65)

    parties = fetch_all("parties", "id,name,short_name,colour_hex")
    print(f"\n  {len(parties)} parties fetched from database")

    updated = 0
    already_correct = 0
    not_matched = 0

    for party in parties:
        pid = party["id"]
        name = (party.get("name") or "").strip()
        short_name = (party.get("short_name") or "").strip()
        current_hex = (party.get("colour_hex") or "").strip().upper()

        target_hex = resolve_colour(name, short_name)

        if target_hex is None:
            not_matched += 1
            print(f"  NOT MATCHED: {name!r} ({short_name!r})")
            continue

        target_hex_upper = target_hex.upper()

        if current_hex == target_hex_upper:
            already_correct += 1
            continue

        # Need to update
        try:
            _req(
                "PATCH",
                f"parties?id=eq.{pid}",
                SERVICE_KEY,
                body={"colour_hex": target_hex},
                prefer="return=minimal",
            )
            updated += 1
            print(f"  UPDATED: {name!r} ({short_name!r}): {current_hex or 'null'!r} → {target_hex!r}")
        except RuntimeError as err:
            print(f"  ERROR updating {name!r}: {err}")

    print(f"\n  Total parties: {len(parties)}")
    print(f"  Updated:        {updated}")
    print(f"  Already correct:{already_correct}")
    print(f"  Not matched:    {not_matched}")
    print("\n" + "=" * 65)
    print("DONE — party colour_hex update complete")
    print("=" * 65)


if __name__ == "__main__":
    main()
