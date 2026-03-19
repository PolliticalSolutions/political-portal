"""
Import Local Government Reorganisation (LGR) data.

Sources:
  - Surrey (Structural Changes) Order 2026 — legally enacted 10 March 2026
  - MHCLG Devolution Priority Programme consultations (closed 11 Jan 2026)
  - MHCLG Wave 2 consultations (running until 26 Mar 2026)
  - English Devolution White Paper, December 2024

Coverage: 19 two-tier areas. County-level and key district entries.
Entries at county level capture the area-wide reorganisation context.
Individual district entries added for high-profile or already-confirmed cases.

DDL: Run docs/lgr_authorities_ddl.sql in Supabase SQL Editor first.

Usage:
  python scripts/import_lgr_data.py
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

# ---------------------------------------------------------------------------
# LGR data — as of March 2026
# lgr_status values:
#   "Order made"          — Structural Changes Order laid in Parliament
#   "Consultation closed" — MHCLG consultation completed; decision pending
#   "Consultation open"   — Consultation currently running
#   "Shadow authority"    — Shadow authority elections held/planned
#   "Completed"           — Reorganisation vested (already happened)
#
# lgr_wave:
#   "DPP"     — Devolution Priority Programme (4 areas, decisions ~mid 2026)
#   "Wave 2"  — Non-DPP areas (decisions expected summer 2026)
#   "Surrey"  — First confirmed order (March 2026)
# ---------------------------------------------------------------------------

LGR_RECORDS = [
    # ── SURREY — legally confirmed ──────────────────────────────────────────
    {
        "authority_name": "Surrey County Council",
        "area_name": "Surrey",
        "lgr_status": "Order made",
        "lgr_wave": "Surrey",
        "proposed_unitary_name": "East Surrey Council / West Surrey Council",
        "lgr_submission_date": None,
        "lgr_decision_date": "2026-03-10",
        "abolition_date": "2027-04-01",
        "replacement_authority": "East Surrey Council and West Surrey Council",
        "mayoral_combined_authority": False,
        "mayoral_ca_name": None,
        "political_context": "Conservative-controlled county. Surrey (Structural Changes) Order 2026 made 10 March 2026. Shadow authority elections 7 May 2026. 11 district/borough councils abolished; 2 new unitaries created.",
        "source_url": "https://www.legislation.gov.uk/uksi/2026/Surrey-structural-changes",
    },
    {
        "authority_name": "Elmbridge Borough Council",
        "area_name": "Surrey",
        "lgr_status": "Order made",
        "lgr_wave": "Surrey",
        "proposed_unitary_name": "East Surrey Council",
        "lgr_decision_date": "2026-03-10",
        "abolition_date": "2027-04-01",
        "replacement_authority": "East Surrey Council",
        "mayoral_combined_authority": False,
        "political_context": "Conservative-controlled district. Abolished under Surrey (Structural Changes) Order 2026.",
        "source_url": "https://www.legislation.gov.uk/uksi/2026/Surrey-structural-changes",
    },
    {
        "authority_name": "Reigate and Banstead Borough Council",
        "area_name": "Surrey",
        "lgr_status": "Order made",
        "lgr_wave": "Surrey",
        "proposed_unitary_name": "East Surrey Council",
        "lgr_decision_date": "2026-03-10",
        "abolition_date": "2027-04-01",
        "replacement_authority": "East Surrey Council",
        "mayoral_combined_authority": False,
        "political_context": "Conservative-controlled district.",
        "source_url": "https://www.legislation.gov.uk/uksi/2026/Surrey-structural-changes",
    },
    {
        "authority_name": "Guildford Borough Council",
        "area_name": "Surrey",
        "lgr_status": "Order made",
        "lgr_wave": "Surrey",
        "proposed_unitary_name": "West Surrey Council",
        "lgr_decision_date": "2026-03-10",
        "abolition_date": "2027-04-01",
        "replacement_authority": "West Surrey Council",
        "mayoral_combined_authority": False,
        "political_context": "Liberal Democrat-controlled district. Abolished under Surrey Order.",
        "source_url": "https://www.legislation.gov.uk/uksi/2026/Surrey-structural-changes",
    },
    {
        "authority_name": "Woking Borough Council",
        "area_name": "Surrey",
        "lgr_status": "Order made",
        "lgr_wave": "Surrey",
        "proposed_unitary_name": "West Surrey Council",
        "lgr_decision_date": "2026-03-10",
        "abolition_date": "2027-04-01",
        "replacement_authority": "West Surrey Council",
        "mayoral_combined_authority": False,
        "political_context": "In special measures following £1.7bn financial collapse. Abolished under Surrey Order.",
        "source_url": "https://www.legislation.gov.uk/uksi/2026/Surrey-structural-changes",
    },

    # ── DPP AREA 1 — Norfolk and Suffolk ───────────────────────────────────
    {
        "authority_name": "Norfolk County Council",
        "area_name": "Norfolk and Suffolk",
        "lgr_status": "Consultation closed",
        "lgr_wave": "DPP",
        "proposed_unitary_name": "TBC — 1, 2 or 3 unitaries for Norfolk",
        "lgr_submission_date": "2025-09-26",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": True,
        "mayoral_ca_name": "Norfolk and Suffolk Mayoral Combined Authority",
        "political_context": "Conservative-controlled county. MHCLG consultation closed 11 January 2026. Government decision expected spring 2026. Mayoral CA election May 2028.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-norfolk-and-suffolk",
    },
    {
        "authority_name": "Suffolk County Council",
        "area_name": "Norfolk and Suffolk",
        "lgr_status": "Consultation closed",
        "lgr_wave": "DPP",
        "proposed_unitary_name": "TBC — 1 or 3 unitaries for Suffolk",
        "lgr_submission_date": "2025-09-26",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": True,
        "mayoral_ca_name": "Norfolk and Suffolk Mayoral Combined Authority",
        "political_context": "Conservative-controlled county. Two competing proposals: county (1 unitary) vs district coalition (3 unitaries). Government decision expected spring 2026.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-norfolk-and-suffolk",
    },

    # ── DPP AREA 2 — Essex, Southend-on-Sea and Thurrock ──────────────────
    {
        "authority_name": "Essex County Council",
        "area_name": "Essex, Southend-on-Sea and Thurrock",
        "lgr_status": "Consultation closed",
        "lgr_wave": "DPP",
        "proposed_unitary_name": "TBC — 3 or 5 unitaries for Essex",
        "lgr_submission_date": "2025-09-26",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": True,
        "mayoral_ca_name": "Greater Essex Mayoral Combined Authority",
        "political_context": "Conservative-controlled county. Four competing proposals submitted. Consultation closed 11 January 2026.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-essex-southend-on-sea-and-thurrock",
    },
    {
        "authority_name": "Southend-on-Sea City Council",
        "area_name": "Essex, Southend-on-Sea and Thurrock",
        "lgr_status": "Consultation closed",
        "lgr_wave": "DPP",
        "proposed_unitary_name": "TBC — being absorbed into new Essex structure",
        "lgr_submission_date": "2025-09-26",
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": True,
        "mayoral_ca_name": "Greater Essex Mayoral Combined Authority",
        "political_context": "Existing small unitary. Bankrupt — issued Section 114 notice 2023. Being restructured as part of Essex LGR.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-essex-southend-on-sea-and-thurrock",
    },
    {
        "authority_name": "Thurrock Council",
        "area_name": "Essex, Southend-on-Sea and Thurrock",
        "lgr_status": "Consultation closed",
        "lgr_wave": "DPP",
        "proposed_unitary_name": "TBC",
        "lgr_submission_date": "2025-09-26",
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": True,
        "mayoral_ca_name": "Greater Essex Mayoral Combined Authority",
        "political_context": "Existing small unitary. Issued Section 114 notice 2022 after £1.5bn investment losses.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-essex-southend-on-sea-and-thurrock",
    },

    # ── DPP AREA 3 — Hampshire, IoW, Portsmouth, Southampton ──────────────
    {
        "authority_name": "Hampshire County Council",
        "area_name": "Hampshire, Isle of Wight, Portsmouth and Southampton",
        "lgr_status": "Consultation closed",
        "lgr_wave": "DPP",
        "proposed_unitary_name": "TBC — 4 or 5 unitaries",
        "lgr_submission_date": "2025-09-26",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": True,
        "mayoral_ca_name": "Hampshire and Solent Mayoral Combined Authority",
        "political_context": "Conservative-controlled county. Multiple competing proposals. Consultation closed 11 January 2026.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-hampshire-isle-of-wight-portsmouth-and-southampton",
    },

    # ── DPP AREA 4 — East Sussex, West Sussex, Brighton ───────────────────
    {
        "authority_name": "East Sussex County Council",
        "area_name": "East Sussex, West Sussex and Brighton and Hove",
        "lgr_status": "Consultation closed",
        "lgr_wave": "DPP",
        "proposed_unitary_name": "TBC — 2 or 5 unitaries for Sussex",
        "lgr_submission_date": "2025-09-26",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": True,
        "mayoral_ca_name": "Sussex and Brighton Mayoral Combined Authority",
        "political_context": "Conservative-controlled county. Consultation closed 11 January 2026.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-east-sussex-and-brighton-and-hove-and-west-sussex",
    },
    {
        "authority_name": "West Sussex County Council",
        "area_name": "East Sussex, West Sussex and Brighton and Hove",
        "lgr_status": "Consultation closed",
        "lgr_wave": "DPP",
        "proposed_unitary_name": "TBC — 1 or 2 unitaries for West Sussex",
        "lgr_submission_date": "2025-09-26",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": True,
        "mayoral_ca_name": "Sussex and Brighton Mayoral Combined Authority",
        "political_context": "Conservative-controlled county. County proposes 1 unitary; districts propose 2.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-east-sussex-and-brighton-and-hove-and-west-sussex",
    },

    # ── WAVE 2 ─────────────────────────────────────────────────────────────
    {
        "authority_name": "Cambridgeshire County Council",
        "area_name": "Cambridgeshire and Peterborough",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 2 or 3 unitaries",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": True,
        "mayoral_ca_name": "Cambridgeshire and Peterborough Combined Authority",
        "political_context": "No Overall Control. MHCLG consultation open until 26 March 2026. Existing CPCA with Mayor Paul Bristow.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-cambridgeshire-and-peterborough",
    },
    {
        "authority_name": "Derbyshire County Council",
        "area_name": "Derbyshire and Derby",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 1 or 2 unitaries",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": True,
        "mayoral_ca_name": "East Midlands Combined County Authority",
        "political_context": "Labour-controlled county. EMCCA exists with Mayor Claire Ward. Consultation open until 26 March 2026.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-derbyshire-and-derby",
    },
    {
        "authority_name": "Devon County Council",
        "area_name": "Devon, Plymouth and Torbay",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 3 or 4 unitaries",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "mayoral_ca_name": "Devon and Torbay Combined County Authority (non-mayoral)",
        "political_context": "Conservative-controlled county. Non-mayoral Devon and Torbay CCA established February 2025.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-devon-plymouth-and-torbay",
    },
    {
        "authority_name": "Gloucestershire County Council",
        "area_name": "Gloucestershire",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 1 or 2 unitaries",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "political_context": "Conservative-controlled county. No mayoral CA planned. Consultation open until 26 March 2026.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-gloucestershire",
    },
    {
        "authority_name": "Hertfordshire County Council",
        "area_name": "Hertfordshire",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 2, 3 or 4 unitaries",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "mayoral_ca_name": "Thames Valley Mayoral Strategic Authority (expression of interest submitted Dec 2025)",
        "political_context": "Conservative-controlled county. Thames Valley MSA expression of interest submitted December 2025.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-hertfordshire",
    },
    {
        "authority_name": "Kent County Council",
        "area_name": "Kent and Medway",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 1, 3, 4 or 5 unitaries",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "political_context": "Conservative-controlled county. Applied for DPP but rejected February 2025. Five competing proposals submitted.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-kent-and-medway",
    },
    {
        "authority_name": "Lancashire County Council",
        "area_name": "Lancashire, Blackburn with Darwen and Blackpool",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 2, 3, 4 or 5 unitaries",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "mayoral_ca_name": "Lancashire Combined County Authority (non-mayoral, est. February 2025)",
        "political_context": "No Overall Control. Non-mayoral Lancashire CCA established February 2025.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-lancashire-blackburn-with-darwen-and-blackpool",
    },
    {
        "authority_name": "Leicestershire County Council",
        "area_name": "Leicestershire, Leicester and Rutland",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 2 or 3 unitaries",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "political_context": "Conservative-controlled county. No mayoral CA planned.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-leicestershire-leicester-and-rutland",
    },
    {
        "authority_name": "Lincolnshire County Council",
        "area_name": "Lincolnshire",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 2, 3 or 4 unitaries",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": True,
        "mayoral_ca_name": "Greater Lincolnshire Mayoral Combined County Authority",
        "political_context": "Conservative-controlled county. Greater Lincolnshire Mayoral CCA exists with Mayor Dame Andrea Jenkyns.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-lincolnshire-north-lincolnshire-and-north-east-lincolnshire",
    },
    {
        "authority_name": "Nottinghamshire County Council",
        "area_name": "Nottinghamshire and Nottingham",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 2 unitaries (City / Nottinghamshire)",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": True,
        "mayoral_ca_name": "East Midlands Combined County Authority",
        "political_context": "Conservative-controlled county. Part of EMCCA with Mayor Claire Ward.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-nottinghamshire-and-nottingham",
    },
    {
        "authority_name": "Oxfordshire County Council",
        "area_name": "Oxfordshire",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 1, 2 or 3 unitaries",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "mayoral_ca_name": "Thames Valley Mayoral Strategic Authority (expression of interest submitted Dec 2025)",
        "political_context": "No Overall Control. Thames Valley MSA expression of interest submitted December 2025.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-oxfordshire",
    },
    {
        "authority_name": "Staffordshire County Council",
        "area_name": "Staffordshire and Stoke-on-Trent",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 2 or 3 unitaries",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "mayoral_ca_name": "Staffordshire and Stoke-on-Trent Mayoral Strategic Authority (proposed)",
        "political_context": "Conservative-controlled county. All Staffordshire councils jointly pursuing a proposed Mayoral Strategic Authority.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-staffordshire-and-stoke-on-trent",
    },
    {
        "authority_name": "Warwickshire County Council",
        "area_name": "Warwickshire",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 1 or 2 unitaries",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "mayoral_ca_name": None,
        "political_context": "Conservative-controlled county. Two competing proposals: county prefers 1 unitary (seeking WMCA membership); district coalition prefers 2 unitaries (North/South). Consultation closes 26 March 2026.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-warwickshire",
    },
    {
        "authority_name": "North Warwickshire Borough Council",
        "area_name": "Warwickshire",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "North Warwickshire Unitary (coalition proposal)",
        "lgr_submission_date": "2026-01-09",
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "political_context": "Conservative-controlled district. Supports 2-unitary proposal alongside Nuneaton and Bedworth.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-warwickshire",
    },
    {
        "authority_name": "Nuneaton and Bedworth Borough Council",
        "area_name": "Warwickshire",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "North Warwickshire Unitary (coalition proposal)",
        "lgr_submission_date": "2026-01-09",
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "political_context": "Labour-controlled district. Supports 2-unitary proposal.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-warwickshire",
    },
    {
        "authority_name": "Rugby Borough Council",
        "area_name": "Warwickshire",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "South Warwickshire Unitary (coalition proposal)",
        "lgr_submission_date": "2026-01-09",
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "political_context": "Conservative-controlled district. With Stratford and Warwick districts supports 2-unitary option.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-warwickshire",
    },
    {
        "authority_name": "Stratford-on-Avon District Council",
        "area_name": "Warwickshire",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "South Warwickshire Unitary (coalition proposal)",
        "lgr_submission_date": "2026-01-09",
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "political_context": "Conservative-controlled district. Supports 2-unitary option.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-warwickshire",
    },
    {
        "authority_name": "Warwick District Council",
        "area_name": "Warwickshire",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "South Warwickshire Unitary (coalition proposal)",
        "lgr_submission_date": "2026-01-09",
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "political_context": "Labour-controlled district. Supports 2-unitary option.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-warwickshire",
    },
    {
        "authority_name": "Worcestershire County Council",
        "area_name": "Worcestershire",
        "lgr_status": "Consultation open",
        "lgr_wave": "Wave 2",
        "proposed_unitary_name": "TBC — 1 or 2 unitaries",
        "lgr_submission_date": "2026-01-09",
        "lgr_decision_date": None,
        "abolition_date": "2028-04-01",
        "replacement_authority": "TBC",
        "mayoral_combined_authority": False,
        "political_context": "Conservative-controlled county. County prefers 1 unitary (with Wyre Forest); districts prefer 2. No mayoral CA planned.",
        "source_url": "https://www.gov.uk/government/consultations/local-government-reorganisation-in-worcestershire",
    },
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
    print("LGR DATA IMPORT — Local Government Reorganisation")
    print("=" * 65)

    # Check table exists
    try:
        fetch_all("lgr_authorities", "id", {"limit": "1"})
    except RuntimeError as err:
        print("\nERROR: lgr_authorities table not found.")
        print("Run docs/lgr_authorities_ddl.sql in Supabase SQL Editor first.")
        print(f"Original error: {err}")
        sys.exit(1)

    # Load existing local_authorities for ID matching
    existing_las = fetch_all("local_authorities", "id,name")
    la_name_map = {row["name"].strip().lower(): row["id"] for row in existing_las}
    print(f"\n  {len(la_name_map)} existing local authorities available for linking")

    # Check what's already in lgr_authorities
    existing_lgr = fetch_all("lgr_authorities", "id,authority_name")
    existing_names = {row["authority_name"].strip() for row in existing_lgr}
    print(f"  {len(existing_names)} existing LGR records")

    inserted = 0
    skipped = 0
    errors = 0

    for record in LGR_RECORDS:
        name = record["authority_name"]
        if name in existing_names:
            skipped += 1
            print(f"  SKIP: {name}")
            continue

        # Try to link to local_authorities
        la_id = la_name_map.get(name.lower())
        if la_id:
            print(f"  LINKED: {name} → local_authority_id={la_id}")
        else:
            print(f"  UNLINKED: {name} (not in local_authorities yet)")

        payload = {
            "authority_name": name,
            "area_name": record.get("area_name"),
            "lgr_status": record["lgr_status"],
            "lgr_wave": record.get("lgr_wave"),
            "proposed_unitary_name": record.get("proposed_unitary_name"),
            "lgr_submission_date": record.get("lgr_submission_date"),
            "lgr_decision_date": record.get("lgr_decision_date"),
            "abolition_date": record.get("abolition_date"),
            "replacement_authority": record.get("replacement_authority"),
            "mayoral_combined_authority": record.get("mayoral_combined_authority", False),
            "mayoral_ca_name": record.get("mayoral_ca_name"),
            "political_context": record.get("political_context"),
            "source_url": record.get("source_url"),
            "local_authority_id": la_id,
        }

        try:
            _req("POST", "lgr_authorities", SERVICE_KEY, body=payload, prefer="return=minimal")
            inserted += 1
        except RuntimeError as err:
            errors += 1
            print(f"  ERROR inserting {name}: {err}")

    print(f"\n  Total records: {len(LGR_RECORDS)}")
    print(f"  Inserted: {inserted}")
    print(f"  Skipped:  {skipped}")
    print(f"  Errors:   {errors}")
    print("\n" + "=" * 65)
    print("DONE — LGR data import complete")
    print("=" * 65)


if __name__ == "__main__":
    main()
