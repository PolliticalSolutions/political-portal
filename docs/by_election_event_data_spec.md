# By-Election Event Data Specification

## Purpose

This specification defines the canonical row format for politically relevant event-history data used by future:

- By-Election Risk enrichment
- Vulnerability enrichment where appropriate
- audit and provenance review of destabilising events

The format is designed for ingestion from CSV or JSON and for later storage in SQL tables without relying on one-off parsing rules.

## Canonical row fields

Each row should include the following fields.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `event_id` | text | yes | Stable unique identifier from source system or import batch |
| `constituency_identifier` | text | yes | ONS code or other stable constituency identifier |
| `constituency_name` | text | yes | Human-readable constituency name at time of import |
| `event_date` | ISO date | yes | Date the event happened or was first formally recorded |
| `event_type` | text | yes | Must map to the event taxonomy registry |
| `event_severity` | integer or text | yes | Structured severity scale, typically `1-5` |
| `subject_type` | text | yes | One of `mp`, `council`, `association`, `party`, `legal` |
| `subject_name` | text | no | Named MP, council leader, association, party actor, or case |
| `summary` | text | yes | Plain-language summary suitable for analyst review |
| `source_url` | text | no | Canonical source link where available |
| `source_confidence` | text | yes | Suggested values: `high`, `medium`, `low`, `unverified` |
| `structured_tags` | JSON array or delimited text | no | Machine-readable tags for later filtering |
| `affects_by_election_risk` | boolean | yes | Whether the event should be considered by By-Election Risk logic |
| `affects_vulnerability` | boolean | yes | Whether the event should be considered by Vulnerability logic |
| `notes` | text | no | Importer notes, caveats, or classification comments |

## Required validation rules

- `event_id` must be unique within an import batch
- `event_date` must parse as a real date
- `event_type` must exist in the event taxonomy registry
- `subject_type` must be one of the approved values
- `source_confidence` must be a controlled value
- boolean flags must parse cleanly

## Severity guidance

Recommended severity scale:

- `1` = low-salience background signal
- `2` = notable but contained
- `3` = meaningful destabilisation signal
- `4` = major political disruption
- `5` = acute trigger event or immediate crisis

## Source confidence guidance

- `high` = official statement, formal party action, election administrator notice, court record
- `medium` = credible local or national reporting with corroboration
- `low` = single-source reporting or weak attribution
- `unverified` = captured for review but not ready for scored use

## Notes on model usage

- By-Election Risk should treat this dataset primarily as event-history and trigger-context infrastructure, not as automatic prediction proof.
- Vulnerability should only consume event-history rows where the causal relationship is plausible and cycle-safe.
- Event rows must not be used historically if they introduce post-target leakage into backtests.
