"""Run a privacy-safe local comparison of legacy and evidence-only OCR.

The register is processed entirely inside the local container. Elector rows
exist only in memory and are never printed or written to disk. The sole output
is an aggregate JSON report suitable for comparing the default legacy parser
with the Defect C candidate.
"""

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import sys
import time
import types


# The Lambda modules create boto3 clients at import time. These local-only
# values prevent credential discovery or metadata calls; no AWS method is used.
os.environ.setdefault("AWS_REGION", "eu-west-2")
os.environ.setdefault("AWS_DEFAULT_REGION", "eu-west-2")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "local-trial")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "local-trial")
os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")
os.environ.setdefault("JOBS_TABLE", "local-trial")
os.environ.setdefault("UPLOADS_BUCKET", "local-trial")
os.environ.setdefault("OCR_GRAYSCALE", "false")


def _install_local_aws_stubs():
    """Satisfy Lambda-only imports without credentials, SDK calls, or a network."""
    if os.environ.get("LOCAL_OCR_TRIAL_STUB_AWS", "false").lower() != "true":
        return

    class _UnusedAwsClient:
        def __getattr__(self, name):
            raise RuntimeError(f"AWS operation {name} is disabled in the local trial")

    class _UnusedKey:
        def __init__(self, *args, **kwargs):
            pass

        def eq(self, value):
            raise RuntimeError("DynamoDB expressions are disabled in the local trial")

    class _ClientError(Exception):
        pass

    boto3 = types.ModuleType("boto3")
    boto3.client = lambda *args, **kwargs: _UnusedAwsClient()
    boto3.resource = lambda *args, **kwargs: _UnusedAwsClient()
    boto3_dynamodb = types.ModuleType("boto3.dynamodb")
    boto3_conditions = types.ModuleType("boto3.dynamodb.conditions")
    boto3_conditions.Key = _UnusedKey
    botocore = types.ModuleType("botocore")
    botocore_exceptions = types.ModuleType("botocore.exceptions")
    botocore_exceptions.ClientError = _ClientError
    sys.modules.update({
        "boto3": boto3,
        "boto3.dynamodb": boto3_dynamodb,
        "boto3.dynamodb.conditions": boto3_conditions,
        "botocore": botocore,
        "botocore.exceptions": botocore_exceptions,
    })


_install_local_aws_stubs()

from combine_register import handler as combine  # noqa: E402
from process_register import handler as process  # noqa: E402


DIAGNOSTIC_KEYS = process._INFERENCE_DIAGNOSTIC_KEYS


def _configure_local_binaries():
    poppler_path = os.environ.get("LOCAL_POPPLER_PATH", "/usr/bin")
    tesseract_cmd = os.environ.get("LOCAL_TESSERACT_CMD", "/usr/bin/tesseract")
    process.POPPLER_PATH = poppler_path
    process.TESSERACT_CMD = tesseract_cmd
    if not process.OCR_AVAILABLE:
        raise RuntimeError("OCR Python dependencies are unavailable")
    process.pytesseract.pytesseract.tesseract_cmd = tesseract_cmd


def _marked_run_metrics(rows, minimum_run=5):
    """Count unique marked bases in numeric Y-runs without returning numbers."""
    marked_by_base = {}
    for row in rows:
        main_number = combine._elector_main_number(row.get("elector_number"))
        if main_number is None:
            continue
        key = (row.get("polling_district") or "", main_number)
        marked_by_base[key] = marked_by_base.get(key, False) or row.get("voted") == "Y"

    bases_by_district = defaultdict(list)
    for (district, main_number), marked in marked_by_base.items():
        bases_by_district[district].append((main_number, marked))

    qualifying_bases = 0
    longest_run = 0
    for district_rows in bases_by_district.values():
        run_length = 0
        previous_number = None
        for main_number, marked in sorted(district_rows):
            if marked:
                if previous_number is not None and main_number == previous_number + 1:
                    run_length += 1
                else:
                    if run_length >= minimum_run:
                        qualifying_bases += run_length
                    longest_run = max(longest_run, run_length)
                    run_length = 1
                previous_number = main_number
            else:
                if run_length >= minimum_run:
                    qualifying_bases += run_length
                longest_run = max(longest_run, run_length)
                run_length = 0
                previous_number = None
        if run_length >= minimum_run:
            qualifying_bases += run_length
        longest_run = max(longest_run, run_length)

    return {
        "marked_bases_in_runs_of_five_or_more": qualifying_bases,
        "longest_consecutive_marked_base_run": longest_run,
    }


def _safe_range_summary(range_reports, range_issues):
    return {
        "districts": [
            {
                "district": report["district"],
                "declared_start": report["start"],
                "declared_end": report["end"],
                "unique_bases_observed_within_span": report["captured_count"],
                "numbers_not_observed_count": report["missing_count"],
                "observed_outside_span_count": report["out_of_range_count"],
                "unparseable_count": report["unparseable_count"],
            }
            for report in range_reports
        ],
        "issue_count": len(range_issues),
    }


def _summarise_rows(rows, pre_dedupe_count, range_reports, range_issues,
                    inference_diagnostics, document_count, page_count,
                    elapsed_seconds):
    voted_y = sum(row.get("voted") == "Y" for row in rows)
    postal_y = sum(row.get("postal_vote") == "Y" for row in rows)
    unique_bases = {
        (
            row.get("polling_district") or "",
            combine._elector_main_number(row.get("elector_number")),
        )
        for row in rows
        if combine._elector_main_number(row.get("elector_number")) is not None
    }
    district_counts = defaultdict(int)
    for row in rows:
        district_counts[row.get("polling_district") or "(none)"] += 1

    summary = {
        "document_count": document_count,
        "page_count": page_count,
        "rows_before_deduplication": pre_dedupe_count,
        "rows_after_deduplication": len(rows),
        "duplicate_rows_removed": pre_dedupe_count - len(rows),
        "voted_y": voted_y,
        "voted_n": len(rows) - voted_y,
        "postal_y": postal_y,
        "postal_n": len(rows) - postal_y,
        "unique_base_number_count": len(unique_bases),
        "polling_district_row_counts": dict(sorted(district_counts.items())),
        "inference_diagnostics": {
            key: int(inference_diagnostics.get(key, 0))
            for key in DIAGNOSTIC_KEYS
        },
        "declared_numbering_review": _safe_range_summary(
            range_reports, range_issues
        ),
        "elapsed_seconds": round(elapsed_seconds, 1),
    }
    summary.update(_marked_run_metrics(rows))
    return summary


def _process_document(pdf_path, chunk_pages):
    total_pages = process._count_pages(str(pdf_path))
    if total_pages < 1:
        raise RuntimeError("The PDF page count could not be read")

    payloads = []
    for page_start, page_end in process._build_chunk_ranges(total_pages, chunk_pages):
        rows, meta, page_districts, page_declared_ranges = process.ocr_pdf(
            str(pdf_path),
            constituency_name="Local trial",
            election_name="Local trial",
            page_start=page_start,
            page_end=page_end,
        )
        payloads.append({
            "rows": rows,
            "meta": meta,
            "pageDistricts": page_districts,
            "pageDeclaredRanges": page_declared_ranges,
        })

    job_rows = []
    page_districts = {}
    page_declared_ranges = {}
    cover_declared_ranges = []
    inference_diagnostics = {key: 0 for key in DIAGNOSTIC_KEYS}
    seeds = []
    for payload in payloads:
        job_rows.extend(payload["rows"])
        page_districts.update(payload["pageDistricts"])
        page_declared_ranges.update(payload["pageDeclaredRanges"])
        meta = payload["meta"]
        meta_ranges = meta.get("declared_ranges") or []
        if isinstance(meta_ranges, dict):
            meta_ranges = [meta_ranges]
        cover_declared_ranges.extend(meta_ranges)
        if meta.get("polling_district"):
            seeds.append(meta["polling_district"])
        for key in DIAGNOSTIC_KEYS:
            inference_diagnostics[key] += int(
                (meta.get("inference_diagnostics") or {}).get(key, 0)
            )

    seed_district = seeds[0] if seeds else ""
    if any("page" in row for row in job_rows):
        combine.resolve_job_districts(job_rows, page_districts, seed_district)

    trusted_ranges, range_issues = combine.resolve_declared_ranges(
        cover_declared_ranges, page_declared_ranges
    )
    validation_rows = combine._dedupe_rows(job_rows)
    range_reports, validation_issues = combine.validate_rows_against_declared_ranges(
        validation_rows, trusted_ranges
    )
    range_issues.extend(validation_issues)

    return {
        "rows": job_rows,
        "range_reports": range_reports,
        "range_issues": range_issues,
        "inference_diagnostics": inference_diagnostics,
        "page_count": total_pages,
    }


def _run_mode(pdf_paths, evidence_only, chunk_pages):
    flag = process.EVIDENCE_ONLY_GAP_INFERENCE_FLAG
    previous_flag = os.environ.get(flag)
    os.environ[flag] = "true" if evidence_only else "false"
    try:
        started = time.monotonic()
        all_rows = []
        range_reports = []
        range_issues = []
        inference_diagnostics = {key: 0 for key in DIAGNOSTIC_KEYS}
        page_count = 0

        for pdf_path in pdf_paths:
            document = _process_document(pdf_path, chunk_pages)
            all_rows.extend(document["rows"])
            range_reports.extend(document["range_reports"])
            range_issues.extend(document["range_issues"])
            page_count += document["page_count"]
            for key in DIAGNOSTIC_KEYS:
                inference_diagnostics[key] += int(
                    document["inference_diagnostics"].get(key, 0)
                )

        pre_dedupe_count = len(all_rows)
        final_rows = combine._dedupe_rows(all_rows)
        final_rows.sort(key=combine._sort_key)
        return _summarise_rows(
            final_rows,
            pre_dedupe_count,
            range_reports,
            range_issues,
            inference_diagnostics,
            len(pdf_paths),
            page_count,
            time.monotonic() - started,
        )
    finally:
        if previous_flag is None:
            os.environ.pop(flag, None)
        else:
            os.environ[flag] = previous_flag


def _numeric_delta(baseline, candidate):
    fields = (
        "rows_before_deduplication",
        "rows_after_deduplication",
        "duplicate_rows_removed",
        "voted_y",
        "voted_n",
        "postal_y",
        "postal_n",
        "unique_base_number_count",
        "marked_bases_in_runs_of_five_or_more",
        "longest_consecutive_marked_base_run",
    )
    return {
        field: candidate[field] - baseline[field]
        for field in fields
    }


def run_trial(pdf_paths, output_path, chunk_pages=20, workers=6):
    _configure_local_binaries()
    os.environ["OCR_WORKERS"] = str(workers)
    os.environ["OCR_GRAYSCALE"] = "false"

    if isinstance(pdf_paths, (str, Path)):
        pdf_paths = [Path(pdf_paths)]
    else:
        pdf_paths = [Path(path) for path in pdf_paths]

    baseline = _run_mode(pdf_paths, evidence_only=False, chunk_pages=chunk_pages)
    candidate = _run_mode(pdf_paths, evidence_only=True, chunk_pages=chunk_pages)
    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "privacy": (
            "Aggregate-only local report. No elector rows, OCR text, names, "
            "addresses, input path, or source filename are stored."
        ),
        "settings": {
            "render_dpi": 600,
            "colour": True,
            "skip_pages": 2,
            "chunk_pages": chunk_pages,
            "ocr_workers": workers,
            "candidate_flag": process.EVIDENCE_ONLY_GAP_INFERENCE_FLAG,
        },
        "baseline_legacy": baseline,
        "candidate_evidence_only": candidate,
        "candidate_minus_baseline": _numeric_delta(baseline, candidate),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def _parser():
    parser = argparse.ArgumentParser(
        description=(
            "Compare legacy and evidence-only gap inference locally. "
            "Only aggregate results are written."
        )
    )
    parser.add_argument("--pdf", action="append", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--chunk-pages", type=int, default=20)
    parser.add_argument("--workers", type=int, default=6)
    return parser


def main(argv=None):
    args = _parser().parse_args(argv)
    if any(not path.is_file() or path.suffix.lower() != ".pdf" for path in args.pdf):
        print("Trial failed: every selected input must be a readable PDF.", file=sys.stderr)
        return 2
    if args.chunk_pages < 1 or args.workers < 1:
        print("Trial failed: chunk pages and workers must be positive.", file=sys.stderr)
        return 2

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        report = run_trial(
            args.pdf,
            args.output,
            chunk_pages=args.chunk_pages,
            workers=args.workers,
        )
    except Exception as exc:
        print(f"Trial failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    baseline = report["baseline_legacy"]
    candidate = report["candidate_evidence_only"]
    print("Local OCR comparison complete.")
    print(
        "Legacy: "
        f"{baseline['rows_after_deduplication']:,} rows; "
        f"{baseline['voted_y']:,} marked Y."
    )
    print(
        "Candidate: "
        f"{candidate['rows_after_deduplication']:,} rows; "
        f"{candidate['voted_y']:,} marked Y."
    )
    print(f"Aggregate report written to: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
