# Councillor Attendance — Data Specification

**Version:** 1.0
**Date:** 2026-03-19
**Status:** Scaffold — data collection in progress

---

## Purpose

Councillor attendance records serve two analytical functions:

1. **Council stability signal** — Low attendance by multiple councillors within an authority indicates dysfunction, potential resignations, or health issues that can destabilise political control. This feeds the By-Election Watch and council instability scoring.

2. **By-Election Watch criterion** — A councillor with <50% attendance in the most recent reporting year is flagged as a potential vacancy risk at ward level. At Westminster constituency level, this is aggregated across all wards overlapping the constituency.

---

## Table: `councillor_attendance`

See `docs/councillor_attendance_ddl.sql` for the full schema.

### Key fields

| Field | Type | Notes |
|---|---|---|
| `local_authority_id` | UUID FK | Links to `local_authorities` table |
| `councillor_name` | VARCHAR(200) | Full name as published by the council |
| `ward` | VARCHAR(200) | Ward name as published |
| `party` | VARCHAR(100) | Party affiliation at time of period |
| `meeting_type` | VARCHAR(50) | `full_council`, `committee`, `scrutiny`, `executive`, `combined`, or NULL (aggregated) |
| `meetings_eligible` | INTEGER | Number of meetings the councillor was eligible to attend |
| `meetings_attended` | INTEGER | Number actually attended (including substitutions if council counts them) |
| `attendance_pct` | NUMERIC(5,2) | **Computed column** — `(attended / eligible) * 100`. Do not supply; DB computes. |
| `period_start` | DATE | First day of reporting year (usually 01 April) |
| `period_end` | DATE | Last day of reporting year (usually 31 March) |
| `source_url` | VARCHAR(500) | Direct link to the council attendance page |

### Unique constraint

`(local_authority_id, councillor_name, meeting_type, period_start, period_end)` — prevents duplicate imports. Re-running an import script will fail on duplicates unless rows are upserted with `ON CONFLICT DO UPDATE`.

---

## Data sources

### Priority councils for initial import (linked to By-Election Watch watchlist constituencies)

| Council | Source type | URL pattern |
|---|---|---|
| Warwickshire County Council | Modern.gov | `democracy.warwickshire.gov.uk/mgAttendance.aspx` |
| Surrey County Council | Civica | `mycouncil.surreycc.gov.uk/mgAttendance.aspx` |
| Lincolnshire County Council | Modern.gov | `lincolnshire.moderngov.co.uk/mgAttendance.aspx` |
| North Yorkshire Council | Modern.gov | `edemocracy.northyorks.gov.uk/mgAttendance.aspx` |

### Common source formats

**Modern.gov** (used by ~60% of English councils):
- URL pattern: `{council-domain}/mgAttendance.aspx?FN=ATTENDANCE&VW=TABLE`
- Returns HTML table: Councillor Name | Party | Ward | Eligible | Attended | %
- Data is usually updated within 4 weeks of the period end

**Civica / OpenAccess**:
- URL pattern: `{council-domain}/cmis/Members/tabid/62/ctl/ViewCMIS_Person/` — per-councillor pages
- No aggregated table; requires scraping individual pages

**Bespoke systems**:
- Download link via Freedom of Information if not online
- Annual publication schedule varies

---

## Import process

### CSV template

Use `scripts/templates/councillor_attendance_template.csv` for manual imports.

Required columns:
```
local_authority_name, councillor_name, ward, party, meeting_type,
meetings_eligible, meetings_attended, period_start, period_end, source_url, import_notes
```

Notes:
- `meeting_type` can be blank (treated as NULL / aggregated)
- `attendance_pct` is **not** a CSV column — it is computed by the database
- `local_authority_name` is matched against `local_authorities.name` by the import script

### Scripted import

1. Run `docs/councillor_attendance_ddl.sql` in Supabase SQL Editor
2. Populate CSV using the template
3. Run: `python scripts/import_councillor_attendance.py --file your_data.csv`

The import script should:
- Match `local_authority_name` → `local_authority_id` via ilike on `local_authorities.name`
- Skip rows where the council is not found in the DB (log warning)
- Upsert on the unique constraint (update `meetings_attended`, `meetings_eligible`, `source_url`)
- Log a summary of inserted, updated, and skipped rows

---

## By-Election Watch criterion

A constituency is flagged **"Low councillor attendance"** when:

> At least one councillor whose ward **overlaps the Westminster constituency** has recorded <50% attendance at formal council meetings in the **most recent available reporting year**.

### Implementation status

- `councillor_attendance` table: DDL created (run manually in Supabase)
- `low_attendance_councillors` view: defined in DDL
- `constituency_council_lookup` table: already exists; provides ward-to-constituency mapping
- Frontend criterion: **scaffolded in ByElectionWatchPage.jsx** — evaluates to `null` (unknown) until data is populated
- API function: `getLowAttendanceConstituencies()` — **to be added** to `constituencyApi.js`

### Thresholds and rationale

| Threshold | Rationale |
|---|---|
| <50% | Statutory minimum in most council standing orders; triggers formal notice |
| Latest year only | Older data may reflect illness now resolved |
| Aggregated across meeting types | Some councils only publish aggregate figures |

---

## Warwickshire — 2025 data attempt

Attempted fetch of attendance data from `democracy.warwickshire.gov.uk` on 2026-03-19.

See import notes in the commit for results. If the Modern.gov portal was accessible, data will be in `scripts/warwickshire_attendance_2025.csv`. If blocked, the CSV template provides a structure for manual completion via FOI request to Warwickshire County Council (contact: democracy@warwickshire.gov.uk).

---

## Analytical interpretation

### What low attendance signals

- **Health/personal circumstances** — The most common cause; councillor may be considering resignation
- **Disengagement** — Councillor has lost interest or is in dispute with group; may defect or resign
- **Dual mandate conflict** — Councillor also holds another elected office (rare at county level)
- **Local party dysfunction** — If multiple councillors in the same group have low attendance, it suggests a wider group crisis

### What it does NOT signal

- **Imminent vacancy** — Most councils issue a notice of disqualification after 6 consecutive months of non-attendance; this is a lagging indicator
- **Electoral vulnerability** — A safe ward can still produce a vacancy; a marginal ward can have a fully engaged councillor
- **Party-level trend** — Low attendance by one councillor is noise; a cluster within a party group in a constituency is signal

---

## Update cadence

- **Annual** — Import after each municipal year closes (June, covering April–March)
- **Mid-year** — Flag if a council publishes mid-year absence data (e.g. for a Standards investigation)
- **Event-triggered** — Import immediately if a council announces a vacancy or disqualification

---

## Future enhancements

1. **Scripted Modern.gov scraper** — `scripts/scrape_moderngov_attendance.py` to fetch from any Modern.gov council automatically
2. **MP Commons attendance** — Parliament publishes division lobby records; deferred penders on a parallel `mp_commons_attendance` table
3. **Councillor profile linkage** — Link `councillor_name` to a `councillors` master table for deduplication and party history tracking
4. **Ward-to-constituency mapping** — Full population of `constituency_council_lookup` will enable automated overlap detection
