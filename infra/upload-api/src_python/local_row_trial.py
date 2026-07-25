"""Aggregate-only local comparison for Defect D row classification.

Both modes retain the live Defect C evidence-only gap behaviour. The sole
difference is OCR_ROW_ELIGIBILITY_FILTER=false (current production) versus
true (candidate). No elector rows, OCR text, names, addresses, input paths or
source filenames are written to the report.
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import local_gap_trial as base
from ocr_runtime_versions import collect_ocr_runtime_versions


def _run_mode(pdf_paths, row_filter, chunk_pages):
    evidence_flag = base.process.EVIDENCE_ONLY_GAP_INFERENCE_FLAG
    row_flag = base.process.ROW_ELIGIBILITY_FILTER_FLAG
    previous_evidence = os.environ.get(evidence_flag)
    previous_row = os.environ.get(row_flag)
    os.environ[evidence_flag] = "true"
    os.environ[row_flag] = "true" if row_filter else "false"
    try:
        started = time.monotonic()
        all_rows = []
        range_reports = []
        range_issues = []
        inference_diagnostics = {
            key: 0 for key in base.DIAGNOSTIC_KEYS
        }
        page_count = 0

        for pdf_path in pdf_paths:
            document = base._process_document(pdf_path, chunk_pages)
            all_rows.extend(document["rows"])
            range_reports.extend(document["range_reports"])
            range_issues.extend(document["range_issues"])
            page_count += document["page_count"]
            for key in base.DIAGNOSTIC_KEYS:
                inference_diagnostics[key] += int(
                    document["inference_diagnostics"].get(key, 0)
                )

        pre_dedupe_count = len(all_rows)
        final_rows = base.combine._dedupe_rows(all_rows)
        final_rows.sort(key=base.combine._sort_key)
        return base._summarise_rows(
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
        if previous_evidence is None:
            os.environ.pop(evidence_flag, None)
        else:
            os.environ[evidence_flag] = previous_evidence
        if previous_row is None:
            os.environ.pop(row_flag, None)
        else:
            os.environ[row_flag] = previous_row


def run_trial(pdf_paths, output_path, chunk_pages=20, workers=6):
    base._configure_local_binaries()
    os.environ["OCR_WORKERS"] = str(workers)
    os.environ["OCR_GRAYSCALE"] = "false"
    ocr_runtime = collect_ocr_runtime_versions(
        tesseract_cmd=base.process.TESSERACT_CMD,
        poppler_path=base.process.POPPLER_PATH,
        tessdata_prefix=os.environ.get("TESSDATA_PREFIX"),
    )

    pdf_paths = [Path(path) for path in pdf_paths]
    current = _run_mode(pdf_paths, row_filter=False, chunk_pages=chunk_pages)
    candidate = _run_mode(pdf_paths, row_filter=True, chunk_pages=chunk_pages)
    report = {
        "schema_version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "privacy": (
            "Aggregate-only local report. No elector rows, OCR text, names, "
            "addresses, input path, or source filename are stored."
        ),
        "ocr_runtime": ocr_runtime,
        "settings": {
            "render_dpi": 600,
            "colour": True,
            "skip_pages": 2,
            "chunk_pages": chunk_pages,
            "ocr_workers": workers,
            "gap_candidate_enabled_in_both_modes": True,
            "candidate_flag": base.process.ROW_ELIGIBILITY_FILTER_FLAG,
        },
        "current_production_logic": current,
        "candidate_row_eligibility": candidate,
        "candidate_minus_current": base._numeric_delta(current, candidate),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def _parser():
    parser = argparse.ArgumentParser(
        description=(
            "Compare current and row-eligibility OCR logic locally. "
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
    if any(
        not path.is_file() or path.suffix.lower() != ".pdf"
        for path in args.pdf
    ):
        print(
            "Trial failed: every selected input must be a readable PDF.",
            file=sys.stderr,
        )
        return 2
    if args.chunk_pages < 1 or args.workers < 1:
        print(
            "Trial failed: chunk pages and workers must be positive.",
            file=sys.stderr,
        )
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
        print(
            f"Trial failed: {type(exc).__name__}: {exc}",
            file=sys.stderr,
        )
        return 1

    current = report["current_production_logic"]
    candidate = report["candidate_row_eligibility"]
    print("Local row-classification comparison complete.")
    print(
        "Current: "
        f"{current['rows_after_deduplication']:,} rows; "
        f"{current['voted_y']:,} marked Y."
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
