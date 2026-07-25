"""Run the revised marked-register pipeline and persist aggregate evidence only.

The selected PDFs are processed inside a network-disabled local container.
Elector rows and OCR text exist only in memory and are never printed or written
to disk. The JSON report contains document indexes, counts, district codes, and
quality-gate results; it deliberately excludes paths, filenames, elector
numbers, names, addresses, and raw OCR text.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import sys
import time

import local_gap_trial as base
from ocr_runtime_versions import collect_ocr_runtime_versions


def _restore_environment(previous):
    for key, value in previous.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


def _safe_row_summary(rows):
    district_counts = base.combine._count_districts(rows)
    voted_y = sum(row.get("voted") == "Y" for row in rows)
    postal_y = sum(row.get("postal_vote") == "Y" for row in rows)
    return {
        "rows": len(rows),
        "voted_y": voted_y,
        "voted_n": len(rows) - voted_y,
        "postal_y": postal_y,
        "postal_n": len(rows) - postal_y,
        "polling_district_count": len(district_counts),
        "polling_district_row_counts": dict(sorted(district_counts.items())),
    }


def _safe_duplicate_shape(rows):
    """Describe duplicate behaviour without exposing any elector key."""
    by_district = {}
    for row in rows:
        district = str(row.get("polling_district") or "(none)")
        elector = str(row.get("elector_number") or "").strip()
        if not elector:
            continue
        bucket = by_district.setdefault(district, {})
        item = bucket.setdefault(elector, {
            "occurrences": 0,
            "pages": set(),
            "voted": set(),
            "has_subnumber": "/" in elector,
        })
        item["occurrences"] += 1
        try:
            item["pages"].add(int(row.get("page")))
        except (TypeError, ValueError):
            pass
        item["voted"].add(str(row.get("voted") or ""))

    district_reports = {}
    for district, electors in sorted(by_district.items()):
        input_rows = sum(item["occurrences"] for item in electors.values())
        duplicate_items = [
            item for item in electors.values()
            if item["occurrences"] > 1
        ]
        duplicates_removed = input_rows - len(electors)
        cross_page_keys = 0
        adjacent_page_keys = 0
        distant_page_keys = 0
        for item in duplicate_items:
            pages = sorted(item["pages"])
            if len(pages) <= 1:
                continue
            cross_page_keys += 1
            gaps = [
                right - left
                for left, right in zip(pages, pages[1:])
            ]
            if gaps and min(gaps) <= 1:
                adjacent_page_keys += 1
            if gaps and max(gaps) > 2:
                distant_page_keys += 1
        district_reports[district] = {
            "input_rows": input_rows,
            "unique_elector_keys": len(electors),
            "duplicates_removed": duplicates_removed,
            "deduplication_pct": round(
                duplicates_removed / input_rows * 100.0,
                2,
            ) if input_rows else 0.0,
            "duplicate_key_count": len(duplicate_items),
            "duplicate_keys_on_multiple_pages": cross_page_keys,
            "duplicate_keys_on_adjacent_pages": adjacent_page_keys,
            "duplicate_keys_with_page_gap_over_two": distant_page_keys,
            "duplicate_keys_with_subnumbers": sum(
                item["has_subnumber"] for item in duplicate_items
            ),
            "duplicate_keys_with_voted_conflict": sum(
                len(item["voted"]) > 1 for item in duplicate_items
            ),
            "maximum_occurrences_for_one_key": max(
                (item["occurrences"] for item in duplicate_items),
                default=1,
            ),
        }
    return district_reports


def _process_document(pdf_path, document_index, chunk_pages):
    started = time.monotonic()
    total_pages = base.process._count_pages(str(pdf_path))
    if total_pages < 1:
        raise RuntimeError("The PDF page count could not be read")

    payloads = []
    for page_start, page_end in base.process._build_chunk_ranges(
        total_pages,
        chunk_pages,
    ):
        rows, meta, page_districts, page_declared_ranges = (
            base.process.ocr_pdf(
                str(pdf_path),
                constituency_name="Local validation",
                election_name="Local validation",
                page_start=page_start,
                page_end=page_end,
            )
        )
        payloads.append({
            "rows": rows,
            "meta": meta,
            "page_districts": page_districts,
            "page_declared_ranges": page_declared_ranges,
        })

    rows = []
    page_districts = {}
    page_declared_ranges = {}
    cover_declared_ranges = []
    seeds = []
    vote_types = Counter()
    inference_diagnostics = {
        key: 0 for key in base.DIAGNOSTIC_KEYS
    }
    for payload in payloads:
        meta = payload["meta"]
        for row in payload["rows"]:
            row["_source_type"] = "pdf"
        rows.extend(payload["rows"])
        page_districts.update(payload["page_districts"])
        page_declared_ranges.update(payload["page_declared_ranges"])
        meta_ranges = meta.get("declared_ranges") or []
        if isinstance(meta_ranges, dict):
            meta_ranges = [meta_ranges]
        cover_declared_ranges.extend(meta_ranges)
        if meta.get("polling_district"):
            seeds.append(meta["polling_district"])
        vote_types[str(meta.get("vote_type") or "(none)")] += 1
        for key in base.DIAGNOSTIC_KEYS:
            inference_diagnostics[key] += int(
                (meta.get("inference_diagnostics") or {}).get(key, 0)
            )

    seed_district = seeds[0] if seeds else ""
    _synthetic, resolution = (
        base.combine._resolve_job_districts_with_report(
            rows,
            page_districts,
            seed_district,
        )
    )
    resolution["source"] = f"Document {document_index}"

    trusted_ranges, range_issues = base.combine.resolve_declared_ranges(
        cover_declared_ranges,
        page_declared_ranges,
    )
    unique_rows = base.combine._dedupe_rows(rows)
    range_reports, validation_issues = (
        base.combine.validate_rows_against_declared_ranges(
            unique_rows,
            trusted_ranges,
        )
    )

    source_counts = base.combine._dedupe_source_counts(rows)
    pre_dedupe_count = len(rows)
    dedupe_pct = (
        source_counts["within_source"] / pre_dedupe_count * 100.0
        if pre_dedupe_count else 0.0
    )
    summary = {
        "document": document_index,
        "page_count": total_pages,
        "rows_before_deduplication": pre_dedupe_count,
        "rows_after_deduplication": len(unique_rows),
        "within_source_duplicates_removed": source_counts["within_source"],
        "within_source_deduplication_pct": round(dedupe_pct, 2),
        "duplicate_shape_by_district": _safe_duplicate_shape(rows),
        "vote_type_chunk_classifications": dict(sorted(vote_types.items())),
        "district_resolution": resolution,
        "declared_numbering_review": {
            "trusted_range_count": len(trusted_ranges),
            "range_report_count": len(range_reports),
            "issue_count": len(range_issues) + len(validation_issues),
        },
        "inference_diagnostics": inference_diagnostics,
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }
    summary.update(_safe_row_summary(unique_rows))
    return rows, summary, resolution


def run_validation(pdf_paths, output_path, chunk_pages=20, workers=6):
    base._configure_local_binaries()
    settings = {
        base.process.EVIDENCE_ONLY_GAP_INFERENCE_FLAG: "true",
        base.process.ROW_ELIGIBILITY_FILTER_FLAG: "true",
        "OCR_GRAYSCALE": "false",
        "OCR_WORKERS": str(workers),
        "DISTRICT_HEADER_MIN_PCT": "20",
        "DEDUPE_WARN_PCT": "2",
    }
    previous = {key: os.environ.get(key) for key in settings}
    os.environ.update(settings)
    try:
        runtime = collect_ocr_runtime_versions(
            tesseract_cmd=base.process.TESSERACT_CMD,
            poppler_path=base.process.POPPLER_PATH,
            tessdata_prefix=os.environ.get("TESSDATA_PREFIX"),
        )
        started = time.monotonic()
        all_rows = []
        documents = []
        resolutions = []
        for index, pdf_path in enumerate(pdf_paths, start=1):
            rows, summary, resolution = _process_document(
                Path(pdf_path),
                index,
                chunk_pages,
            )
            all_rows.extend(rows)
            documents.append(summary)
            resolutions.append(resolution)

        pre_dedupe_count = len(all_rows)
        source_counts = base.combine._dedupe_source_counts(all_rows)
        unique_rows = base.combine._dedupe_rows(all_rows)
        unique_rows.sort(key=base.combine._sort_key)
        warning_base = pre_dedupe_count - source_counts["cross_source"]
        dedupe_pct = (
            source_counts["within_source"] / warning_base * 100.0
            if warning_base else 0.0
        )
        district_counts = base.combine._count_districts(unique_rows)
        blockers = base.combine._quality_blockers(
            dedupe_pct,
            2.0,
            district_counts,
            resolutions,
        )
        aggregate = {
            "document_count": len(documents),
            "page_count": sum(item["page_count"] for item in documents),
            "rows_before_deduplication": pre_dedupe_count,
            "rows_after_deduplication": len(unique_rows),
            "within_source_duplicates_removed": source_counts["within_source"],
            "within_source_deduplication_pct": round(dedupe_pct, 2),
            "cross_source_records_merged": source_counts["cross_source"],
            "quality_gate": "PASS" if not blockers else "WITHHOLD",
            "quality_blocker_count": len(blockers),
            "quality_blockers": blockers,
            "elapsed_seconds": round(time.monotonic() - started, 1),
        }
        aggregate.update(_safe_row_summary(unique_rows))

        report = {
            "schema_version": 1,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "privacy": (
                "Aggregate-only local report. No elector rows, OCR text, "
                "elector numbers, names, addresses, input paths, or source "
                "filenames are stored."
            ),
            "settings": {
                "render_dpi": 600,
                "colour": True,
                "skip_pages": 2,
                "chunk_pages": chunk_pages,
                "ocr_workers": workers,
                "evidence_only_gap_inference": True,
                "row_eligibility_filter": True,
                "district_header_minimum_pct": 20,
                "deduplication_warning_pct": 2,
                "network_access": False,
                "source_mount": "read_only",
            },
            "ocr_runtime": runtime,
            "aggregate": aggregate,
            "documents": documents,
        }
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(report, indent=2) + "\n",
            encoding="utf-8",
        )
        return report
    finally:
        _restore_environment(previous)


def _parser():
    parser = argparse.ArgumentParser(
        description=(
            "Run the revised marked-register logic locally and write only an "
            "aggregate quality report."
        )
    )
    parser.add_argument("--pdf", action="append", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--chunk-pages", type=int, default=20)
    parser.add_argument("--workers", type=int, default=6)
    return parser


def main(argv=None):
    args = _parser().parse_args(argv)
    if any(
        not path.is_file() or path.suffix.lower() != ".pdf"
        for path in args.pdf
    ):
        print(
            "Validation failed: every selected input must be a readable PDF.",
            file=sys.stderr,
        )
        return 2
    if args.chunk_pages < 1 or args.workers < 1:
        print(
            "Validation failed: chunk pages and workers must be positive.",
            file=sys.stderr,
        )
        return 2

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        report = run_validation(
            args.pdf,
            args.output,
            chunk_pages=args.chunk_pages,
            workers=args.workers,
        )
    except Exception as exc:
        print(
            f"Validation failed: {type(exc).__name__}: {exc}",
            file=sys.stderr,
        )
        return 1

    aggregate = report["aggregate"]
    print("Revised marked-register validation complete.")
    print(
        f"Quality gate: {aggregate['quality_gate']}; "
        f"{aggregate['rows_after_deduplication']:,} candidate rows; "
        f"{aggregate['within_source_deduplication_pct']:.2f}% "
        "within-source deduplication."
    )
    print(f"Aggregate-only report written to: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
