# Local Government Intelligence — Build Notes

## What was built

### Database schema (Phase 1)
Six new Supabase tables added alongside the existing `council_data` table:
- **`local_authorities`** — master table for all local authorities (GSS code, name, type, tier, region, country, composition, election dates, control type)
- **`council_elections`** — election events per authority (date, type, seats contested, turnout)
- **`council_results`** — election results by party per election (seats won, change, vote share)
- **`council_wards`** — ward/division level data (controlling party, last election)
- **`constituency_council_lookup`** — many-to-many link between Westminster constituencies and local authorities (overlap type, is_primary flag)
- **`political_alerts`** — live intelligence alerts (risk level, title, summary, detail, is_active)

All tables have RLS enabled with anon SELECT policies.

### Data imported (Phases 2 & 3)
**Phase 2 — 21 English county councils**
- All 21 remaining English county councils after recent LGR reorganisations
- Note: user specified 26; actual count is 21 following dissolution of Cumbria (2023), North Yorkshire (2023), Somerset (2023), Northamptonshire (2021), Buckinghamshire (2020)
- May 2025 election results reflected in `controlling_party`, `control_type`, `composition`
- Data quality caveat: seat counts for non-Warwickshire councils are derived from known May 2025 result patterns; verify against official sources at electoralcalculus.co.uk or Electoral Commission

**Phase 3 — Warwickshire detail**
- 7 Westminster constituency → Warwickshire CC lookup records inserted
- 57 council division (ward) results for May 2025 inserted
- Council election record + party results for 2025 inserted
- Political alert inserted: "Reform UK minority administration under pressure" (high risk)

### Frontend built (Phases 5–7)

**`/portal/local-government`** — LocalGovIndex
- Active intelligence alerts panel at top (red banner, like constituency index)
- Summary stats: total authorities, NOC count, Reform-led count, active alerts
- Search/filter: name, country, region, authority type, control type
- Table with party dot colour, control badge, alert badge

**`/portal/local-government/:gssCode`** — LocalGovDetail
- 5-tab layout: Composition | Election History | Wards | Parliamentary Link | Intelligence
- Composition tab: seat share bars with party colours, majority calculator
- Election History: per-election results tables loaded on demand
- Wards: division breakdown with party summary, sortable table
- Parliamentary Link: linked Westminster constituencies with links to ConstituencyDetail
- Intelligence: active alerts with full detail, colour-coded by risk level
- Demographic synergy panel (Phase 7): correlates composition patterns with known demographic indicators (Reform → post-industrial, LD → graduate/affluent, etc.)

**`ConstituencyDetail.jsx` — CouncilsTab updated (Phase 6)**
- Now queries BOTH `council_data` (legacy Warwickshire data) AND `local_authorities` via `constituency_council_lookup`
- Deduplicates by council name — prefers new schema when available
- Legacy `council_data` shown as fallback if no linked authority exists
- "Full intelligence profile" link added pointing to `/portal/local-government/:gssCode`

**Navigation**
- "Local Government" added to PortalLayout Products nav group
- Routes added to App.jsx as lazy-loaded Suspense wrappers

### APIs
- `src/pages/portal/local-government/localGovApi.js` — 8 functions:
  - `getLocalAuthorities(filters)` — filtered list
  - `getLocalAuthority(gssCode)` — single authority
  - `getAuthorityElections(authorityId)` — election history
  - `getElectionResults(electionId)` — results per election
  - `getAuthorityAlerts(authorityId)` — active alerts
  - `getAllActiveAlerts()` — all active alerts with authority join
  - `getAuthorityWards(authorityId)` — ward data
  - `getLinkedConstituencies(authorityId)` — parliamentary constituencies via lookup
- `constituencyApi.js` — `getLinkedAuthorities(constituencyId)` added

### Scripts
- `scripts/import_county_councils.py` — imports 21 English county councils
- `scripts/import_warwickshire_detail.py` — Warwickshire wards, lookup, election, alert
- `scripts/import_warwickshire_councils.py` — existing (legacy council_data, Phase 3 from previous session)

## What still needs doing

### Data quality
1. **Verify county council seat counts** — the 21 councils imported use estimated seat counts based on known May 2025 result patterns. Verify against: https://www.electoralcalculus.co.uk/electdata_local.html
2. **Add Welsh councils** — no Welsh local authority data imported yet (22 Welsh councils)
3. **Add Scottish councils** — 32 Scottish councils not imported
4. **Add Northern Ireland councils** — 11 NI councils not imported
5. **Add unitary authorities** — England has ~60 unitary authorities not yet in the database
6. **Add metropolitan boroughs** — London boroughs and metropolitan districts not imported
7. **Vote share data** — `council_results.vote_share` is NULL for all imported records; needs party vote share by council

### Phase 4 — Full constituency-council lookup (650 seats)
The ONS Westminster Parliamentary Constituency to Local Authority lookup table is available at:
https://geoportal.statistics.gov.uk/datasets/ons::wards-to-local-authority-districts-to-counties-to-regions-to-countries-december-2024/about

This needs to be downloaded and processed to populate `constituency_council_lookup` for all 650 constituencies. Currently only the 7 Warwickshire constituencies are linked.

### Frontend enhancements
- Add `political_alerts` integration to `ConstituencyIndex.jsx` to show council alerts alongside the existing `byElectionAlerts` from `src/data/byElectionAlerts.js`
- The `byElectionAlerts.js` static file should eventually be migrated to pull from `political_alerts` table
- Add ward-level map visualisation to WardsTab
- Add pagination to LocalGovIndex for when >50 authorities are loaded

## Data quality issues

### May 2025 county council results caveat
The 21 county councils were imported with composition data based on known results patterns from the May 2025 elections. The following were particularly uncertain and should be verified first:
- Cambridgeshire, Derbyshire, Devon, East Sussex — seat splits are estimates
- Essex, Kent, Staffordshire — Reform UK as largest party is likely correct but exact numbers need verification
- Hampshire, Oxfordshire, Surrey — Lib Dem as largest party is likely correct

### Warwickshire data is accurate
The Warwickshire data (57 seats, Reform 19, full division results) was confirmed by the platform owner and is the reliable demo anchor for all local government features.

### GSS codes
The E10-series GSS codes used for county councils are based on known ONS codes. All 21 codes should be verified against the ONS local authority register before production use.
