#!/usr/bin/env python3
"""Build an aggregate-only polling-district provenance report.

The input files are the private per-chunk JSON artefacts produced by the marked
register pipeline.  They contain personal data.  This utility deliberately
emits only source labels, district codes, page numbers, counts, and resolver
diagnostics.  It never writes elector numbers, names, addresses, or OCR text.

The boundary replay implements the versioned ``corroborated-header-v1`` policy:
a printed district code is accepted only when it is repeated on the following
physical page, or after exactly one unreadable header page. The caller must
record the exact source commit whose results are being reproduced.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


UNTRUSTED_DISTRICT_LABELS = frozenset(
    {"", "DISTRICT", "DIVISION", "UNKNOWN"}
)
OUTPUT_TOP_LEVEL_KEYS = frozenset(
    {
        "schema_version",
        "privacy",
        "resolver_commit",
        "input",
        "reproduction",
        "districts",
    }
)


def trusted_district_code(value: Any) -> str:
    code = str(value or "").strip().upper()
    if (
        re.fullmatch(r"[A-Z0-9]{2,8}", code)
        and code not in UNTRUSTED_DISTRICT_LABELS
    ):
        return code
    return ""


def parse_job_label(value: str) -> tuple[str, str]:
    job_id, separator, label = value.partition("=")
    if not separator or not job_id.strip() or not label.strip():
        raise argparse.ArgumentTypeError(
            "job labels must use the form JOB_ID=SOURCE_LABEL"
        )
    return job_id.strip(), label.strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_payloads(input_dir: Path) -> dict[str, list[dict[str, Any]]]:
    payloads_by_job: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for path in sorted(input_dir.glob("*.json")):
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        job_id = str(payload.get("jobId") or "").strip()
        if not job_id:
            raise ValueError(f"Missing jobId in {path.name}")
        payload["__input_name"] = path.name
        payloads_by_job[job_id].append(payload)
    for payloads in payloads_by_job.values():
        payloads.sort(
            key=lambda payload: (
                int(payload.get("chunkIndex", 0)),
                payload["__input_name"],
            )
        )
    return dict(payloads_by_job)


def merge_job_payloads(
    job_id: str,
    source_label: str,
    payloads: list[dict[str, Any]],
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    page_districts: dict[str, Any] = {}
    page_declared_ranges: dict[str, Any] = {}
    seeds: list[str] = []
    chunk_indices: list[int] = []
    input_names: list[str] = []
    inference_diagnostics: Counter[str] = Counter()

    for payload in payloads:
        chunk_indices.append(int(payload.get("chunkIndex", 0)))
        input_names.append(str(payload["__input_name"]))
        meta = payload.get("meta") or {}
        seed = str(meta.get("polling_district") or "").strip()
        if seed:
            seeds.append(seed)
        for key, value in (meta.get("inference_diagnostics") or {}).items():
            try:
                inference_diagnostics[str(key)] += int(value)
            except (TypeError, ValueError):
                continue
        source_type = str(meta.get("source_type") or "pdf").strip().lower()
        for original in payload.get("rows") or []:
            row = copy.copy(original)
            row["_source_type"] = source_type
            row["_source_job_id"] = job_id
            row["_source_label"] = source_label
            rows.append(row)
        for page, district in (payload.get("pageDistricts") or {}).items():
            page_districts[str(page)] = district
        for page, ranges in (payload.get("pageDeclaredRanges") or {}).items():
            page_declared_ranges[str(page)] = ranges

    seed_district = seeds[0] if seeds else ""
    return {
        "job_id": job_id,
        "source_label": source_label,
        "rows": rows,
        "page_districts": page_districts,
        "page_declared_ranges": page_declared_ranges,
        "seed_district": seed_district,
        "seed_disagreement": bool(
            seeds and any(seed != seed_district for seed in seeds[1:])
        ),
        "chunk_indices": chunk_indices,
        "input_names": input_names,
        "inference_diagnostics": dict(sorted(inference_diagnostics.items())),
    }


def replay_boundaries(job: dict[str, Any]) -> dict[str, Any]:
    rows = job["rows"]
    headers: dict[int, str] = {}
    for page, value in job["page_districts"].items():
        try:
            headers[int(page)] = trusted_district_code(value)
        except (TypeError, ValueError):
            continue

    rows_by_page: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        try:
            page = int(row.get("page"))
        except (TypeError, ValueError):
            continue
        rows_by_page[page].append(row)

    corroborated_headers: dict[int, str] = {}
    corroborated_by: dict[int, int] = {}
    for page in sorted(headers):
        header = headers.get(page, "")
        if header and headers.get(page + 1) == header:
            corroborated_headers[page] = header
            corroborated_by[page] = page + 1
        elif header and not headers.get(page + 1) and headers.get(page + 2) == header:
            corroborated_headers[page] = header
            corroborated_by[page] = page + 2

    current_district = trusted_district_code(job["seed_district"])
    first_accepted_page: int | None = None
    accepted_districts: set[str] = set()
    boundary_events: list[dict[str, Any]] = []
    row_pages = sorted(rows_by_page)
    last_row_page = row_pages[-1] if row_pages else -1
    event_pages = sorted(
        set(row_pages)
        | {
            page
            for page in corroborated_headers
            if page <= last_row_page
        }
    )

    for page in event_pages:
        header = corroborated_headers.get(page, "")
        if header:
            previous_district = current_district
            current_district = header
            accepted_districts.add(header)
            if first_accepted_page is None:
                first_accepted_page = page
            if header != previous_district:
                boundary_events.append(
                    {
                        "page": page,
                        "from_district": previous_district or None,
                        "to_district": header,
                        "corroborated_by_page": corroborated_by[page],
                    }
                )
        for row in rows_by_page.get(page, []):
            row["polling_district"] = current_district

    recognised_header_pages = sum(bool(headers.get(page)) for page in row_pages)
    unresolved_leading_pages = (
        sum(page < first_accepted_page for page in row_pages)
        if first_accepted_page is not None
        else len(row_pages)
    )
    return {
        "headers": headers,
        "corroborated_headers": corroborated_headers,
        "corroborated_by": corroborated_by,
        "boundary_events": boundary_events,
        "row_pages": row_pages,
        "accepted_districts": sorted(accepted_districts),
        "recognised_header_pages": recognised_header_pages,
        "header_coverage_pct": round(
            recognised_header_pages / len(row_pages) * 100.0, 1
        )
        if row_pages
        else 0.0,
        "unresolved_leading_pages": unresolved_leading_pages,
        "rows_with_untrusted_district": sum(
            not trusted_district_code(row.get("polling_district")) for row in rows
        ),
    }


def declaration_pages(job: dict[str, Any], code: str) -> list[int]:
    pages: list[int] = []
    for page_text, declarations in job["page_declared_ranges"].items():
        declared_codes = {
            trusted_district_code(item.get("district"))
            for item in declarations or []
            if isinstance(item, dict)
        }
        if code in declared_codes:
            try:
                pages.append(int(page_text))
            except (TypeError, ValueError):
                continue
    return sorted(set(pages))


def nearest_header_context(
    headers: dict[int, str], target_pages: list[int]
) -> dict[str, Any]:
    recognised = sorted(
        (page, code) for page, code in headers.items() if code
    )
    if not target_pages:
        return {"previous": None, "next": None}
    first_page = target_pages[0]
    last_page = target_pages[-1]
    previous = next(
        (
            {"page": page, "district": code}
            for page, code in reversed(recognised)
            if page < first_page and code != headers.get(first_page)
        ),
        None,
    )
    following = next(
        (
            {"page": page, "district": code}
            for page, code in recognised
            if page > last_page and code != headers.get(last_page)
        ),
        None,
    )
    return {"previous": previous, "next": following}


def dedupe_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    seen: set[tuple[str, str]] = set()
    output: list[dict[str, Any]] = []
    duplicate_count = 0
    for row in rows:
        district = str(row.get("polling_district") or "").strip().upper()
        elector = str(row.get("elector_number") or "").strip()
        if not elector:
            continue
        key = (district, elector)
        if key in seen:
            duplicate_count += 1
            continue
        seen.add(key)
        output.append(row)
    return output, duplicate_count


def elector_number_integrity(
    rows_before_dedupe: list[dict[str, Any]],
    rows_after_dedupe: list[dict[str, Any]],
) -> dict[str, Any]:
    """Return roll-number diagnostics without returning any roll number value."""
    canonical_pattern = re.compile(r"^[1-9]\d{0,6}(?:/[1-9]\d{0,3})?$")
    date_like_pattern = re.compile(
        r"^(?:0?[1-9]|[12]\d|3[01])[/-]"
        r"(?:0?[1-9]|1[0-2])[/-](?:\d{2}|\d{4})$"
    )
    values = [str(row.get("elector_number") or "").strip() for row in rows_before_dedupe]
    populated = [value for value in values if value]
    canonical = [value for value in populated if canonical_pattern.fullmatch(value)]
    main_numbers = [int(value.split("/", 1)[0]) for value in canonical]
    unique_main_numbers = set(main_numbers)
    main_number_counts = Counter(main_numbers)
    span_size = (
        max(unique_main_numbers) - min(unique_main_numbers) + 1
        if unique_main_numbers
        else 0
    )
    return {
        "rows_checked_before_dedupe": len(rows_before_dedupe),
        "rows_checked_after_dedupe": len(rows_after_dedupe),
        "duplicate_rows_removed": len(rows_before_dedupe) - len(rows_after_dedupe),
        "blank_or_missing_count": len(values) - len(populated),
        "canonical_text_count": len(canonical),
        "noncanonical_count": len(populated) - len(canonical),
        "date_like_count": sum(bool(date_like_pattern.fullmatch(value)) for value in populated),
        "slash_suffix_count": sum("/" in value for value in canonical),
        "unique_main_number_count": len(unique_main_numbers),
        "main_numbers_with_multiple_records": sum(
            count > 1 for count in main_number_counts.values()
        ),
        "main_number_span_size": span_size,
        "unobserved_positions_within_span": max(
            span_size - len(unique_main_numbers), 0
        ),
        "observed_span_pct": round(
            len(unique_main_numbers) / span_size * 100.0, 1
        )
        if span_size
        else 0.0,
        "interpretation": (
            "Structural diagnostic only; gaps may be legitimate and destination "
            "matching is not assessed."
        ),
    }


def build_report(
    input_dir: Path,
    job_labels: dict[str, str],
    targets: list[str],
    resolver_commit: str,
) -> dict[str, Any]:
    resolver_commit = str(resolver_commit or "").strip().lower()
    if not re.fullmatch(r"[0-9a-f]{40}", resolver_commit):
        raise ValueError("An exact 40-character resolver commit is required")
    payloads_by_job = load_payloads(input_dir)
    missing_jobs = sorted(set(job_labels) - set(payloads_by_job))
    if missing_jobs:
        raise ValueError("No chunk artefacts found for job(s): " + ", ".join(missing_jobs))

    jobs: list[dict[str, Any]] = []
    all_rows: list[dict[str, Any]] = []
    input_files: list[dict[str, Any]] = []
    for job_id, source_label in sorted(job_labels.items(), key=lambda item: item[1]):
        payloads = payloads_by_job[job_id]
        job = merge_job_payloads(job_id, source_label, payloads)
        job["resolution"] = replay_boundaries(job)
        jobs.append(job)
        all_rows.extend(job["rows"])
        for payload in payloads:
            path = input_dir / payload["__input_name"]
            input_files.append(
                {
                    "name": path.name,
                    "bytes": path.stat().st_size,
                    "sha256": sha256_file(path),
                }
            )

    final_rows, duplicate_count = dedupe_rows(all_rows)
    final_counts = Counter(
        str(row.get("polling_district") or "").strip().upper()
        for row in final_rows
    )
    all_counts = Counter(
        str(row.get("polling_district") or "").strip().upper()
        for row in all_rows
    )
    districts: list[dict[str, Any]] = []

    for code in targets:
        target_rows_before_dedupe = [
            row
            for row in all_rows
            if str(row.get("polling_district") or "").strip().upper() == code
        ]
        target_rows_after_dedupe = [
            row
            for row in final_rows
            if str(row.get("polling_district") or "").strip().upper() == code
        ]
        source_entries: list[dict[str, Any]] = []
        for job in jobs:
            rows = [
                row
                for row in job["rows"]
                if str(row.get("polling_district") or "").strip().upper() == code
            ]
            headers = job["resolution"]["headers"]
            header_pages = sorted(page for page, value in headers.items() if value == code)
            if not rows and not header_pages:
                continue
            rows_per_page = Counter(int(row["page"]) for row in rows if row.get("page") is not None)
            row_pages = sorted(rows_per_page)
            corroborated_pages = sorted(
                page
                for page, value in job["resolution"]["corroborated_headers"].items()
                if value == code
            )
            boundary_events = [
                event
                for event in job["resolution"]["boundary_events"]
                if event["to_district"] == code
            ]
            source_entries.append(
                {
                    "source": job["source_label"],
                    "job_id": job["job_id"],
                    "resolved_rows_before_global_dedupe": len(rows),
                    "row_pages": [
                        {"page": page, "rows": rows_per_page[page]}
                        for page in row_pages
                    ],
                    "detected_header_pages": header_pages,
                    "corroborated_header_pages": corroborated_pages,
                    "accepted_boundary_events": boundary_events,
                    "declared_range_pages": declaration_pages(job, code),
                    "nearest_other_header": nearest_header_context(headers, header_pages),
                    "source_fidelity_status": (
                        "corroborated_printed_header"
                        if corroborated_pages and boundary_events
                        else "not_established"
                    ),
                }
            )
        districts.append(
            {
                "district": code,
                "rows_before_global_dedupe": all_counts.get(code, 0),
                "rows_in_reproduced_final_output": final_counts.get(code, 0),
                "elector_number_integrity": elector_number_integrity(
                    target_rows_before_dedupe,
                    target_rows_after_dedupe,
                ),
                "sources": source_entries,
                "destination_compatibility": "not_assessed_without_cchq_reference",
            }
        )

    job_summaries = []
    for job in jobs:
        resolution = job["resolution"]
        job_summaries.append(
            {
                "source": job["source_label"],
                "job_id": job["job_id"],
                "chunks": len(job["chunk_indices"]),
                "chunk_indices": job["chunk_indices"],
                "rows_before_global_dedupe": len(job["rows"]),
                "seed_district": trusted_district_code(job["seed_district"]) or None,
                "seed_disagreement": job["seed_disagreement"],
                "row_page_count": len(resolution["row_pages"]),
                "recognised_header_pages": resolution["recognised_header_pages"],
                "header_coverage_pct": resolution["header_coverage_pct"],
                "accepted_district_count": len(resolution["accepted_districts"]),
                "unresolved_leading_pages": resolution["unresolved_leading_pages"],
                "rows_with_untrusted_district": resolution["rows_with_untrusted_district"],
                "inference_diagnostics": job["inference_diagnostics"],
            }
        )

    report = {
        "schema_version": 1,
        "privacy": {
            "classification": "aggregate-only",
            "contains_elector_numbers": False,
            "contains_elector_names": False,
            "contains_elector_addresses": False,
            "contains_ocr_text": False,
        },
        "resolver_commit": resolver_commit,
        "input": {
            "directory_label": input_dir.name,
            "file_count": len(input_files),
            "files": sorted(input_files, key=lambda item: item["name"]),
        },
        "reproduction": {
            "source_jobs": job_summaries,
            "rows_before_global_dedupe": len(all_rows),
            "duplicate_rows_removed": duplicate_count,
            "rows_after_global_dedupe": len(final_rows),
            "polling_district_count": len(final_counts),
        },
        "districts": districts,
    }
    if set(report) != OUTPUT_TOP_LEVEL_KEYS:
        raise AssertionError("Unexpected top-level report structure")
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--resolver-commit",
        required=True,
        help="Exact source commit whose resolver output is being reproduced.",
    )
    parser.add_argument(
        "--job-label",
        action="append",
        default=[],
        type=parse_job_label,
        metavar="JOB_ID=SOURCE_LABEL",
        help="Include one production job under a privacy-safe source label.",
    )
    parser.add_argument(
        "--district",
        action="append",
        default=[],
        help="District code to include; may be repeated.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_dir = args.input_dir.resolve()
    if not input_dir.is_dir():
        raise SystemExit(f"Input directory does not exist: {input_dir}")
    job_labels = dict(args.job_label)
    if not job_labels:
        raise SystemExit("At least one --job-label is required")
    targets = [trusted_district_code(code) for code in args.district]
    if not targets or any(not code for code in targets):
        raise SystemExit("At least one valid --district is required")
    if len(targets) != len(set(targets)):
        raise SystemExit("Duplicate --district values are not allowed")

    report = build_report(
        input_dir,
        job_labels,
        targets,
        resolver_commit=args.resolver_commit,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(report, handle, indent=2, sort_keys=False)
        handle.write("\n")
    print(
        json.dumps(
            {
                "output": str(args.output),
                "rows_after_global_dedupe": report["reproduction"][
                    "rows_after_global_dedupe"
                ],
                "polling_district_count": report["reproduction"][
                    "polling_district_count"
                ],
                "districts": {
                    item["district"]: item["rows_in_reproduced_final_output"]
                    for item in report["districts"]
                },
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
