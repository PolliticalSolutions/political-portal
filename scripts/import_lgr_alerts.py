"""
Import LGR political alerts into the political_alerts table.

Creates alerts for:
- Councils with Structural Changes Orders made (highest risk — abolition confirmed)
- Councils with consultation closed (medium risk — decision imminent)
- Councils with consultation open (low risk — in process)

These alerts appear in LocalGovDetail intelligence tab and any alert feeds.

Usage:
  python scripts/import_lgr_alerts.py
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


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 65)
    print("LGR POLITICAL ALERTS IMPORT")
    print("=" * 65)

    # Load lgr_authorities
    try:
        lgr_records = fetch_all(
            "lgr_authorities",
            "id,authority_name,area_name,lgr_status,lgr_wave,abolition_date,local_authority_id",
        )
    except RuntimeError as err:
        print(f"ERROR: lgr_authorities table not found. Run docs/lgr_authorities_ddl.sql first.")
        print(f"Detail: {err}")
        sys.exit(1)

    print(f"\n  {len(lgr_records)} LGR records loaded")

    # Load local_authorities to find IDs for councils in our DB
    las = fetch_all("local_authorities", "id,name")
    la_name_map = {row["name"].strip().lower(): row["id"] for row in las}

    # Load existing LGR alerts to avoid duplicates
    existing_alerts = fetch_all(
        "political_alerts",
        "id,local_authority_id,alert_type,title",
        {"alert_type": "eq.lgr"},
    )
    existing_keys = {(a["local_authority_id"], a["title"]) for a in existing_alerts}

    inserted = 0
    skipped = 0
    no_la = 0

    for lgr in lgr_records:
        # Find local_authority_id (either from lgr record or by name match)
        la_id = lgr.get("local_authority_id")
        if not la_id:
            la_id = la_name_map.get(lgr["authority_name"].strip().lower())
        if not la_id:
            no_la += 1
            continue  # Can't create alert without a local_authority_id

        status = lgr["lgr_status"]
        area = lgr.get("area_name", lgr["authority_name"])
        abolition_year = lgr["abolition_date"][:4] if lgr.get("abolition_date") else "2028"

        if status == "Order made":
            risk_level = "high"
            title = f"LGR — Abolition confirmed ({abolition_year})"
            summary = (
                f"{lgr['authority_name']} is being abolished as part of the {area} "
                f"Local Government Reorganisation. The Structural Changes Order has been made; "
                f"abolition is legally confirmed for {abolition_year}."
            )
        elif status == "Consultation closed":
            risk_level = "high"
            title = f"LGR — Decision imminent ({area})"
            summary = (
                f"{lgr['authority_name']} is subject to Local Government Reorganisation in {area}. "
                f"The MHCLG public consultation closed January 2026. Government decision expected "
                f"spring/summer 2026; abolition target {abolition_year}."
            )
        elif status in ("Consultation open", "Shadow authority"):
            risk_level = "medium"
            title = f"LGR — Under consultation ({area})"
            summary = (
                f"{lgr['authority_name']} is subject to Local Government Reorganisation consultation. "
                f"MHCLG Wave 2 consultation closes 26 March 2026. Decision expected summer 2026; "
                f"abolition target {abolition_year}."
            )
        else:
            continue  # Skip completed/unknown statuses

        if (la_id, title) in existing_keys:
            skipped += 1
            continue

        payload = {
            "local_authority_id": la_id,
            "alert_type": "lgr",
            "risk_level": risk_level,
            "title": title,
            "summary": summary,
            "detail": lgr.get("political_context"),
            "is_active": True,
        }

        try:
            _req("POST", "political_alerts", SERVICE_KEY, body=payload, prefer="return=minimal")
            inserted += 1
            print(f"  INSERTED: [{risk_level.upper()}] {lgr['authority_name']} — {title}")
        except RuntimeError as err:
            print(f"  ERROR: {lgr['authority_name']}: {err}")

    print(f"\n  Inserted: {inserted}")
    print(f"  Skipped (duplicate): {skipped}")
    print(f"  No LA match: {no_la}")
    print("\n" + "=" * 65)
    print("DONE — LGR alerts import complete")
    print("=" * 65)


if __name__ == "__main__":
    main()
