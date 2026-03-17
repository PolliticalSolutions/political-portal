"""
Feature 3 — By-Election Risk Scorer

Calculates a risk score (0-10) for each constituency based on:
  35% — Majority size (smaller = higher risk)
  25% — Council instability (from council_data alert_level)
  20% — Defection/resign risk (from constituency current status vs elected)
  20% — Polling trend factor (party losing ground nationally)

Risk levels: Low (0-3), Medium (3-5), High (5-7.5), Very High (7.5-10)

DDL — run in Supabase SQL Editor before this script:

  CREATE TABLE IF NOT EXISTS public.by_election_risk (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    constituency_id          uuid REFERENCES constituencies(id),
    risk_score               numeric(4,2),
    risk_level               varchar(20),
    majority_factor          numeric(4,2),
    council_instability_factor numeric(4,2),
    defection_risk_factor    numeric(4,2),
    polling_trend_factor     numeric(4,2),
    risk_summary             text,
    calculated_at            timestamptz DEFAULT now()
  );
  ALTER TABLE public.by_election_risk ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow anon read" ON public.by_election_risk FOR SELECT TO anon USING (true);

Usage:
  python scripts/calculate_by_election_risk.py
"""

import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

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

# Parties with currently declining national poll trend (as of early 2026)
# Higher factor = more at risk from polling trend
PARTY_POLLING_RISK = {
    "Conservative": 8.0,   # historically very low polls
    "Reform UK":    5.0,   # has risen but volatile
    "SNP":          6.0,   # declining in Scotland
    "Labour":       3.5,   # governing, some swing back
    "Liberal Democrat": 2.0,
    "Green":        2.0,
    "Plaid Cymru":  3.0,
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


def risk_level(score):
    if score >= 7.5:
        return "Very High"
    if score >= 5.0:
        return "High"
    if score >= 3.0:
        return "Medium"
    return "Low"


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    print("=" * 65)
    print("FEATURE 3 — BY-ELECTION RISK SCORER")
    print("=" * 65)

    # Verify table
    print("\n--- Checking by_election_risk table ---")
    try:
        fetch_all("by_election_risk", "id", {"limit": "1"})
        print("  Table exists.")
    except RuntimeError as err:
        print(f"ERROR: {err}")
        print("Run the DDL shown at the top of this script in Supabase SQL Editor first.")
        sys.exit(1)

    # Load constituencies
    print("\n--- Loading constituencies ---")
    constituencies = fetch_all("constituencies", "id,ons_code,name")
    print(f"  {len(constituencies)} constituencies")

    # Load latest GE winners
    print("\n--- Loading 2024 winners ---")
    elections = fetch_all(
        "elections", "id,election_date",
        {"election_type": "eq.general", "order": "election_date.desc", "limit": "1"},
    )
    if not elections:
        print("ERROR: No general election found.")
        sys.exit(1)
    latest_id = elections[0]["id"]
    winners = fetch_all(
        "results",
        "constituency_id,majority,electorate,parties(id,name,short_name)",
        {"election_id": f"eq.{latest_id}", "is_winner": "eq.true"},
    )
    winner_map = {w["constituency_id"]: w for w in winners}
    print(f"  {len(winner_map)} winners loaded")

    # Load council data for instability flags
    print("\n--- Loading council instability data ---")
    councils = fetch_all("council_data", "constituency_id,alert_level")
    council_alert = {}
    for c in councils:
        cid = c["constituency_id"]
        level = c.get("alert_level") or "none"
        # Take highest alert level for constituency
        existing = council_alert.get(cid, "none")
        priority = {"none": 0, "low": 1, "medium": 2, "high": 3}
        if priority.get(level, 0) > priority.get(existing, 0):
            council_alert[cid] = level

    # Calculate scores
    print("\n--- Calculating risk scores ---")
    rows = []
    level_counts = {}

    for constituency in constituencies:
        cid = constituency["id"]
        winner = winner_map.get(cid, {})
        majority = winner.get("majority")
        electorate = winner.get("electorate")
        party_data = winner.get("parties", {}) or {}
        party_name = party_data.get("name") or party_data.get("short_name") or ""

        # Factor 1: Majority size (35%)
        # 0% majority → 10, 20% majority → 0
        if majority is not None and electorate:
            maj_pct = (majority / electorate) * 100
            majority_factor = max(0.0, min(10.0, 10.0 - maj_pct * 0.5))
        else:
            majority_factor = 4.0

        # Factor 2: Council instability (25%)
        alert = council_alert.get(cid, "none")
        instability_factor = {"high": 8.0, "medium": 5.0, "low": 2.0, "none": 0.5}.get(alert, 0.5)

        # Factor 3: Defection/resignation risk (20%)
        # Proxy: very small majority (under 1000) in a seat held by Con or Reform
        defection_risk = 0.0
        if majority is not None and majority < 500:
            defection_risk = 9.0
        elif majority is not None and majority < 1000:
            defection_risk = 7.0
        elif majority is not None and majority < 3000:
            defection_risk = 4.0
        elif majority is not None and majority < 5000:
            defection_risk = 2.0

        # Factor 4: Polling trend (20%)
        trend_factor = PARTY_POLLING_RISK.get(party_name, 2.0)

        score = round(
            0.35 * majority_factor +
            0.25 * instability_factor +
            0.20 * defection_risk +
            0.20 * trend_factor,
            2,
        )

        level = risk_level(score)
        level_counts[level] = level_counts.get(level, 0) + 1

        # Summary text
        parts = []
        if majority is not None and majority < 1000:
            parts.append(f"majority of {majority:,}")
        if alert in ("high", "medium"):
            parts.append(f"{alert} council instability")
        if party_name in ("Conservative", "Reform UK", "SNP"):
            parts.append(f"{party_name} seat under national polling pressure")

        summary = "; ".join(parts) if parts else "Standard risk profile"

        rows.append({
            "id": str(uuid.uuid4()),
            "constituency_id": cid,
            "risk_score": score,
            "risk_level": level,
            "majority_factor": round(majority_factor, 2),
            "council_instability_factor": round(instability_factor, 2),
            "defection_risk_factor": round(defection_risk, 2),
            "polling_trend_factor": round(trend_factor, 2),
            "risk_summary": summary,
        })

    print(f"  Calculated {len(rows)} scores")
    print("\n  Risk distribution:")
    for lv in ["Very High", "High", "Medium", "Low"]:
        count = level_counts.get(lv, 0)
        bar = "█" * (count // 5)
        print(f"    {lv:<12} {count:>3}  {bar}")

    # Upsert
    print("\n--- Upserting scores ---")
    try:
        _req("DELETE", "by_election_risk", SERVICE_KEY, params={"id": "not.is.null"})
    except RuntimeError:
        pass
    total = 0
    for i in range(0, len(rows), 500):
        batch = rows[i:i + 500]
        _req("POST", "by_election_risk", SERVICE_KEY, body=batch, prefer="return=minimal")
        total += len(batch)
        print(f"  Inserted {total}/{len(rows)}")

    # Top 10 highest risk
    print("\n--- Top 10 highest by-election risk seats ---")
    con_by_id = {c["id"]: c["name"] for c in constituencies}
    top = sorted(rows, key=lambda r: r["risk_score"], reverse=True)[:10]
    for r in top:
        name = con_by_id.get(r["constituency_id"], "?")
        print(f"  {r['risk_score']:.2f}  {r['risk_level']:<12}  {name}")
        if r["risk_summary"]:
            print(f"         → {r['risk_summary']}")

    print("\n" + "=" * 65)
    print(f"DONE — {len(rows)} by-election risk scores written")
    print("=" * 65)


if __name__ == "__main__":
    main()
