"""
Import priority LGR political alerts — Surrey shadow elections, DPP decisions, Wave 2 deadline.

Inserts specifically structured alerts for the three active LGR milestones:
  - Surrey shadow authority elections 7 May 2026 (critical)
  - DPP area decisions spring/summer 2026 (high)
  - Wave 2 consultation deadline 26 March 2026 (medium)

Idempotent: skips records where (local_authority_id, title) already exists.
If local_authority_id cannot be matched, alert is still inserted with null LA link
to ensure it appears in any area-wide alert feeds.

Usage:
  python scripts/import_surrey_lgr_priority_alerts.py
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
    print("ERROR: SUPABASE_SERVICE_KEY not found in .env or environment.")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Alert definitions
# Each entry maps to one row in political_alerts.
# authority_name is used to resolve local_authority_id; null is acceptable.
# ---------------------------------------------------------------------------

PRIORITY_ALERTS = [
    # ── CRITICAL: Surrey shadow authority elections ────────────────────────
    {
        "authority_name": "Surrey County Council",
        "alert_type": "lgr_shadow_election",
        "risk_level": "critical",
        "title": "Surrey LGR — Shadow Authority Elections 7 May 2026",
        "summary": (
            "Surrey County Council and 11 district councils abolished 1 April 2027. "
            "Shadow elections for East Surrey Council and West Surrey Council on 7 May 2026 "
            "— six weeks away. First elections for two brand new unitary authorities."
        ),
        "detail": (
            "The Surrey (Structural Changes) Order 2026 was made on 10 March 2026. "
            "All 11 Surrey district/borough councils and Surrey County Council are abolished "
            "on 1 April 2027 and replaced by two new unitary authorities: "
            "East Surrey Council (covering Elmbridge, Epsom and Ewell, Mole Valley, "
            "Reigate and Banstead, Tandridge) and West Surrey Council (covering Guildford, "
            "Runnymede, Spelthorne, Surrey Heath, Waverley, Woking). "
            "Shadow authority councillor elections on 7 May 2026. "
            "These are the first elections for these new institutions — "
            "all seats are contested for the first time with no incumbency advantage."
        ),
    },
    # ── HIGH: DPP area — Norfolk and Suffolk ─────────────────────────────
    {
        "authority_name": "Norfolk County Council",
        "alert_type": "lgr_decision_imminent",
        "risk_level": "high",
        "title": "LGR Decision Imminent — Norfolk and Suffolk (DPP)",
        "summary": (
            "Norfolk and Suffolk are in the Devolution Priority Programme. "
            "MHCLG consultation closed 11 January 2026. Government decision on unitary "
            "structure expected spring 2026. Abolition target 1 April 2028. "
            "Norfolk and Suffolk Mayoral Combined Authority to be created."
        ),
        "detail": (
            "Both county councils are Conservative-controlled. Suffolk has two competing "
            "proposals: county (1 unitary) vs district coalition (3 unitaries). "
            "Norfolk has proposals for 1, 2 or 3 unitaries. "
            "DPP status means government decisions are prioritised ahead of Wave 2."
        ),
    },
    {
        "authority_name": "Suffolk County Council",
        "alert_type": "lgr_decision_imminent",
        "risk_level": "high",
        "title": "LGR Decision Imminent — Norfolk and Suffolk (DPP)",
        "summary": (
            "Norfolk and Suffolk are in the Devolution Priority Programme. "
            "MHCLG consultation closed 11 January 2026. Government decision on unitary "
            "structure expected spring 2026. Abolition target 1 April 2028."
        ),
        "detail": (
            "Suffolk has two competing proposals: county council prefers 1 unitary; "
            "district coalition prefers 3 unitaries. Decision is MHCLG's to make."
        ),
    },
    # ── HIGH: DPP area — Essex ────────────────────────────────────────────
    {
        "authority_name": "Essex County Council",
        "alert_type": "lgr_decision_imminent",
        "risk_level": "high",
        "title": "LGR Decision Imminent — Essex, Southend-on-Sea and Thurrock (DPP)",
        "summary": (
            "Essex is in the Devolution Priority Programme. MHCLG consultation closed "
            "11 January 2026. Four competing proposals submitted (3 or 5 unitaries). "
            "Government decision expected spring 2026. Greater Essex Mayoral CA to be created."
        ),
        "detail": (
            "Conservative-controlled county. Southend-on-Sea and Thurrock are existing unitaries "
            "both in special financial measures (S114 notices). All three authorities being "
            "restructured into new Essex unitary structure. Abolition target 1 April 2028."
        ),
    },
    # ── HIGH: DPP area — Hampshire ────────────────────────────────────────
    {
        "authority_name": "Hampshire County Council",
        "alert_type": "lgr_decision_imminent",
        "risk_level": "high",
        "title": "LGR Decision Imminent — Hampshire, IoW, Portsmouth and Southampton (DPP)",
        "summary": (
            "Hampshire is in the Devolution Priority Programme. MHCLG consultation closed "
            "11 January 2026. Multiple competing proposals (4 or 5 unitaries). "
            "Hampshire and Solent Mayoral Combined Authority to be created."
        ),
        "detail": (
            "Conservative-controlled county. Government decision expected spring/summer 2026. "
            "Abolition target 1 April 2028."
        ),
    },
    # ── HIGH: DPP area — East Sussex ──────────────────────────────────────
    {
        "authority_name": "East Sussex County Council",
        "alert_type": "lgr_decision_imminent",
        "risk_level": "high",
        "title": "LGR Decision Imminent — East Sussex, West Sussex and Brighton (DPP)",
        "summary": (
            "East Sussex and West Sussex are in the Devolution Priority Programme. "
            "MHCLG consultation closed 11 January 2026. Proposals for 2 or 5 Sussex unitaries. "
            "Sussex and Brighton Mayoral Combined Authority to be created."
        ),
        "detail": (
            "Both county councils Conservative-controlled. "
            "County councils and districts have submitted competing proposals. "
            "Government decision expected spring/summer 2026. Abolition target 1 April 2028."
        ),
    },
    {
        "authority_name": "West Sussex County Council",
        "alert_type": "lgr_decision_imminent",
        "risk_level": "high",
        "title": "LGR Decision Imminent — East Sussex, West Sussex and Brighton (DPP)",
        "summary": (
            "East Sussex and West Sussex are in the Devolution Priority Programme. "
            "MHCLG consultation closed 11 January 2026. West Sussex: county proposes 1 unitary; "
            "districts propose 2. Sussex and Brighton Mayoral Combined Authority to be created."
        ),
        "detail": "Conservative-controlled county. Abolition target 1 April 2028.",
    },
    # ── MEDIUM: Wave 2 — Consultation open (deadline 26 March 2026) ───────
    *[
        {
            "authority_name": authority_name,
            "alert_type": "lgr_consultation",
            "risk_level": "medium",
            "title": f"LGR Consultation Closing — {area} (Wave 2)",
            "summary": summary,
            "detail": (
                "Wave 2 MHCLG consultation closes 26 March 2026. "
                "Government decisions expected summer 2026. Abolition target 1 April 2028."
            ),
        }
        for authority_name, area, summary in [
            (
                "Cambridgeshire County Council",
                "Cambridgeshire and Peterborough",
                "Wave 2 LGR consultation closes 26 March 2026. MHCLG considering 2 or 3 unitaries. Existing CPCA with Mayor Paul Bristow. Decision expected summer 2026.",
            ),
            (
                "Derbyshire County Council",
                "Derbyshire and Derby",
                "Wave 2 LGR consultation closes 26 March 2026. 1 or 2 unitaries proposed. Part of EMCCA. Decision expected summer 2026.",
            ),
            (
                "Devon County Council",
                "Devon, Plymouth and Torbay",
                "Wave 2 LGR consultation closes 26 March 2026. 3 or 4 unitaries proposed. Conservative-controlled county. Decision expected summer 2026.",
            ),
            (
                "Gloucestershire County Council",
                "Gloucestershire",
                "Wave 2 LGR consultation closes 26 March 2026. 1 or 2 unitaries proposed. Conservative-controlled county. Decision expected summer 2026.",
            ),
            (
                "Hertfordshire County Council",
                "Hertfordshire",
                "Wave 2 LGR consultation closes 26 March 2026. 2, 3 or 4 unitaries proposed. Conservative-controlled county. Thames Valley MSA expression of interest submitted Dec 2025.",
            ),
            (
                "Kent County Council",
                "Kent and Medway",
                "Wave 2 LGR consultation closes 26 March 2026. Five competing proposals (1, 3, 4 or 5 unitaries). Conservative-controlled county. Applied for DPP — rejected Feb 2025.",
            ),
            (
                "Lancashire County Council",
                "Lancashire, Blackburn with Darwen and Blackpool",
                "Wave 2 LGR consultation closes 26 March 2026. 2–5 unitaries proposed. No Overall Control county. Non-mayoral Lancashire CCA established February 2025.",
            ),
            (
                "Leicestershire County Council",
                "Leicestershire, Leicester and Rutland",
                "Wave 2 LGR consultation closes 26 March 2026. 2 or 3 unitaries proposed. Conservative-controlled county. No mayoral CA planned.",
            ),
            (
                "Lincolnshire County Council",
                "Lincolnshire",
                "Wave 2 LGR consultation closes 26 March 2026. 2–4 unitaries proposed. Conservative-controlled. Greater Lincolnshire Mayoral CCA with Mayor Dame Andrea Jenkyns.",
            ),
            (
                "Nottinghamshire County Council",
                "Nottinghamshire and Nottingham",
                "Wave 2 LGR consultation closes 26 March 2026. 2 unitaries proposed (City / County). Conservative-controlled county. Part of EMCCA.",
            ),
            (
                "Oxfordshire County Council",
                "Oxfordshire",
                "Wave 2 LGR consultation closes 26 March 2026. 1–3 unitaries proposed. No Overall Control. Thames Valley MSA expression of interest submitted Dec 2025.",
            ),
            (
                "Staffordshire County Council",
                "Staffordshire and Stoke-on-Trent",
                "Wave 2 LGR consultation closes 26 March 2026. 2 or 3 unitaries proposed. Conservative-controlled county. Proposed Mayoral Strategic Authority for Staffordshire and Stoke-on-Trent.",
            ),
            (
                "Warwickshire County Council",
                "Warwickshire",
                "Wave 2 LGR consultation closes 26 March 2026. 1 or 2 unitaries proposed. Conservative-controlled. County prefers single unitary seeking WMCA membership; district coalition prefers North/South split.",
            ),
            (
                "Worcestershire County Council",
                "Worcestershire",
                "Wave 2 LGR consultation closes 26 March 2026. 1 or 2 unitaries proposed. Conservative-controlled. County prefers 1 unitary; districts prefer 2. No mayoral CA planned.",
            ),
        ]
    ],
]


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
    print("SURREY LGR PRIORITY ALERTS IMPORT")
    print("=" * 65)

    # Load local_authorities for ID matching
    las = fetch_all("local_authorities", "id,name")
    la_name_map = {row["name"].strip().lower(): row["id"] for row in las}
    print(f"\n  {len(la_name_map)} local authorities available for linking")

    # Load existing alerts to detect duplicates
    existing_alerts = fetch_all("political_alerts", "id,local_authority_id,title")
    existing_keys = {(a["local_authority_id"], a["title"]) for a in existing_alerts}
    print(f"  {len(existing_alerts)} existing alerts in political_alerts")

    inserted = 0
    skipped = 0
    errors = 0

    for alert in PRIORITY_ALERTS:
        authority_name = alert.pop("authority_name")
        la_id = la_name_map.get(authority_name.strip().lower())

        key = (la_id, alert["title"])
        if key in existing_keys:
            skipped += 1
            print(f"  SKIP [{alert['risk_level'].upper()}]: {alert['title']} ({authority_name})")
            continue

        payload = {**alert, "local_authority_id": la_id, "is_active": True}
        if la_id:
            print(f"  LINKED [{alert['risk_level'].upper()}]: {authority_name} → {alert['title']}")
        else:
            print(f"  UNLINKED [{alert['risk_level'].upper()}]: {authority_name} not in local_authorities — inserting with null LA")

        try:
            _req("POST", "political_alerts", SERVICE_KEY, body=payload, prefer="return=minimal")
            inserted += 1
        except RuntimeError as err:
            errors += 1
            msg = str(err)
            print(f"  ERROR: {authority_name}: {msg}")
            if "critical" in msg.lower() or "check" in msg.lower():
                print("         → Possible CHECK constraint on risk_level. May need: ALTER TABLE political_alerts DROP CONSTRAINT IF EXISTS political_alerts_risk_level_check;")

    print(f"\n  Total alerts defined: {len(PRIORITY_ALERTS)}")
    print(f"  Inserted: {inserted}")
    print(f"  Skipped (duplicate): {skipped}")
    print(f"  Errors: {errors}")
    print("\n" + "=" * 65)
    print("DONE")
    print("=" * 65)


if __name__ == "__main__":
    main()
