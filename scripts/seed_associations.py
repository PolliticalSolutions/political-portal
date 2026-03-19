"""
Seed initial associations data.

Creates:
  1. Newcastle Under Lyme Conservative Association
  2. Links it to the Newcastle-under-Lyme constituency
  3. Optionally creates a test user permission

Usage:
  SUPABASE_SERVICE_KEY=<key> python scripts/seed_associations.py

To also create a user permission for yourself:
  COGNITO_SUB=<your-sub> USER_EMAIL=<your-email> SUPABASE_SERVICE_KEY=<key> python scripts/seed_associations.py

To find your Cognito sub, check:
  - The JWT payload in your browser sessionStorage (key: cognito_tokens),
    decode the id_token, read the "sub" field.
  - Or check AWS Cognito user pool in the AWS Console.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = "https://pkpeevhmrjizvxkgvwhr.supabase.co"

SERVICE_KEY = None
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
if os.path.exists(env_path):
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            if line.strip().startswith("SUPABASE_SERVICE_KEY="):
                SERVICE_KEY = line.strip().split("=", 1)[1].strip()
                break
if not SERVICE_KEY:
    SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
if not SERVICE_KEY:
    print("ERROR: SUPABASE_SERVICE_KEY not found in .env or environment.")
    sys.exit(1)


def _req(method, path, body=None, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "return=representation",
    }
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            text = r.read().decode()
            return json.loads(text) if text else []
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} {method} {path}: {e.read().decode()}") from e


def fetch_all(table, select, filters=None):
    params = {"select": select}
    if filters:
        params.update(filters)
    return _req("GET", table, params=params) or []


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 65)
    print("SEED ASSOCIATIONS DATA")
    print("=" * 65)

    cognito_sub = os.environ.get("COGNITO_SUB", "").strip()
    user_email = os.environ.get("USER_EMAIL", "").strip()
    create_user_perm = bool(cognito_sub and user_email)

    if create_user_perm:
        print(f"\n  Will create user permission for: {user_email} ({cognito_sub[:8]}...)")
    else:
        print("\n  No COGNITO_SUB/USER_EMAIL set — skipping user permission creation.")
        print("  Set COGNITO_SUB and USER_EMAIL env vars to also seed a user permission.")

    # ── 1. Find Newcastle-under-Lyme constituency ──────────────────────────
    print("\n--- Looking up Newcastle-under-Lyme constituency ---")
    cons = fetch_all(
        "constituencies",
        "id,name,ons_code",
        {"name": "ilike.*Newcastle*under*Lyme*"},
    )
    if not cons:
        # Try alternate name formats
        cons = fetch_all(
            "constituencies",
            "id,name,ons_code",
            {"name": "ilike.*Newcastle*Lyme*"},
        )
    if not cons:
        print("  ERROR: Could not find Newcastle-under-Lyme constituency.")
        print("  Available constituencies with 'Newcastle' in name:")
        all_newcastle = fetch_all("constituencies", "id,name,ons_code", {"name": "ilike.*Newcastle*"})
        for c in all_newcastle:
            print(f"    - {c['name']} ({c['ons_code']}) [{c['id']}]")
        sys.exit(1)

    constituency = cons[0]
    print(f"  Found: {constituency['name']} ({constituency['ons_code']}) [{constituency['id']}]")

    # ── 2. Create or find association ──────────────────────────────────────
    print("\n--- Creating/finding Newcastle Under Lyme Conservative Association ---")
    existing = fetch_all(
        "associations",
        "id,name",
        {"name": "eq.Newcastle Under Lyme Conservative Association"},
    )
    if existing:
        association = existing[0]
        print(f"  Already exists: {association['name']} [{association['id']}]")
    else:
        result = _req("POST", "associations", body={
            "name": "Newcastle Under Lyme Conservative Association",
            "region": "West Midlands",
            "country": "England",
            "notes": "Created by seed script",
        })
        association = result[0] if isinstance(result, list) else result
        print(f"  Created: {association['name']} [{association['id']}]")

    # ── 3. Link constituency to association ────────────────────────────────
    print("\n--- Linking constituency to association ---")
    existing_link = fetch_all(
        "association_constituencies",
        "id",
        {
            "association_id": f"eq.{association['id']}",
            "constituency_id": f"eq.{constituency['id']}",
        },
    )
    if existing_link:
        print(f"  Link already exists (id: {existing_link[0]['id']})")
    else:
        link = _req("POST", "association_constituencies", body={
            "association_id": association["id"],
            "constituency_id": constituency["id"],
        })
        link = link[0] if isinstance(link, list) else link
        print(f"  Linked [{link['id']}]")

    # ── 4. Optionally create user permission ───────────────────────────────
    if create_user_perm:
        print(f"\n--- Creating user permission for {user_email} ---")
        existing_perm = fetch_all(
            "user_permissions",
            "id",
            {
                "cognito_sub": f"eq.{cognito_sub}",
                "association_id": f"eq.{association['id']}",
            },
        )
        if existing_perm:
            print(f"  Permission already exists (id: {existing_perm[0]['id']})")
        else:
            perm = _req("POST", "user_permissions", body={
                "cognito_sub": cognito_sub,
                "user_email": user_email,
                "association_id": association["id"],
                "granted_by": "seed_script",
                "is_active": True,
                "notes": "Seeded by seed_associations.py",
            })
            perm = perm[0] if isinstance(perm, list) else perm
            print(f"  Created permission [{perm['id']}]")
            print(f"  Grants access to: {constituency['name']}")

    print("\n" + "=" * 65)
    print("DONE")
    print("=" * 65)
    print(f"\nAssociation ID : {association['id']}")
    print(f"Constituency ID: {constituency['id']} ({constituency['name']})")


if __name__ == "__main__":
    main()
