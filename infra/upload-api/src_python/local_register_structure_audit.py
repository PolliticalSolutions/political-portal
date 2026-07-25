"""Audit marked-register document structure without persisting personal data.

The selected PDFs are expected to be mounted read-only in a network-disabled
local container. Pages are rendered only long enough to OCR their top header
band. Full images and OCR text are never printed or written to disk.

The sole output is aggregate JSON containing document indexes, page counts,
recognised polling-district codes, declared numbering ranges, and header-run
boundaries. It deliberately excludes input paths, filenames, raw OCR text,
elector rows, elector numbers, names, and addresses.
"""

import argparse
from collections import Counter
import concurrent.futures
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
import time
import types


# The Lambda handler creates boto3 clients at import time. Local stubs prevent
# credential discovery and make accidental AWS access fail closed.
os.environ.setdefault("AWS_REGION", "eu-west-2")
os.environ.setdefault("AWS_DEFAULT_REGION", "eu-west-2")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "local-structure-audit")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "local-structure-audit")
os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")
os.environ.setdefault("JOBS_TABLE", "local-structure-audit")
os.environ.setdefault("UPLOADS_BUCKET", "local-structure-audit")


def _install_local_aws_stubs():
    if os.environ.get("LOCAL_OCR_TRIAL_STUB_AWS", "false").lower() != "true":
        return

    class _UnusedAwsClient:
        def __getattr__(self, name):
            raise RuntimeError(f"AWS operation {name} is disabled")

    class _UnusedKey:
        def __init__(self, *args, **kwargs):
            pass

        def eq(self, value):
            raise RuntimeError("DynamoDB expressions are disabled")

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

from process_register import handler as process  # noqa: E402


_SAFE_DISTRICT = re.compile(r"[A-Z0-9]{2,8}")
_SAFE_VOTE_TYPES = frozenset({"Postal", "In Person"})


def _configure_local_binaries():
    poppler_path = os.environ.get("LOCAL_POPPLER_PATH", "/usr/bin")
    tesseract_cmd = os.environ.get("LOCAL_TESSERACT_CMD", "/usr/bin/tesseract")
    process.POPPLER_PATH = poppler_path
    process.TESSERACT_CMD = tesseract_cmd
    if not process.OCR_AVAILABLE:
        raise RuntimeError("OCR Python dependencies are unavailable")
    process.pytesseract.pytesseract.tesseract_cmd = tesseract_cmd


def _safe_district(value):
    candidate = str(value or "").strip().upper()
    return candidate if _SAFE_DISTRICT.fullmatch(candidate) else None


def _safe_ranges(ranges):
    safe = []
    seen = set()
    for item in ranges or []:
        district = _safe_district(item.get("district"))
        try:
            start = int(item.get("start"))
            end = int(item.get("end"))
        except (TypeError, ValueError):
            continue
        if not district or start < 1 or end < start or end > 10_000_000:
            continue
        key = (district, start, end)
        if key not in seen:
            seen.add(key)
            safe.append({
                "district": district,
                "declared_start": start,
                "declared_end": end,
            })
    return safe


def _render_page(pdf_path, page_number, dpi):
    images = process.convert_from_path(
        str(pdf_path),
        dpi=dpi,
        first_page=page_number,
        last_page=page_number,
        poppler_path=process.POPPLER_PATH,
        grayscale=True,
    )
    return images[0] if images else None


def _scan_cover(pdf_path, dpi):
    image = _render_page(pdf_path, 1, dpi)
    if image is None:
        return {
            "polling_district": None,
            "vote_type": None,
            "declared_ranges": [],
        }
    try:
        text = process.pytesseract.image_to_string(image)
        ranges = process._extract_declared_ranges(text)
        district = process._extract_polling_district_from_text(text, ranges)
        vote_type = process._classify_pdf_vote_type(text)
        return {
            "polling_district": _safe_district(district),
            "vote_type": vote_type if vote_type in _SAFE_VOTE_TYPES else None,
            "declared_ranges": _safe_ranges(ranges),
            "document_type_signals": {
                "contains_postal_word": "postal" in text.lower(),
                "explicit_postal_list_title": bool(re.search(
                    r"\b(?:marked\s+)?(?:absent\s+voter|postal\s+voter)"
                    r"\s+(?:postal\s+)?list\b"
                    r"|\blist\s+of\s+postal\s+voters\b",
                    text,
                    re.IGNORECASE,
                )),
                "register_of_electors": bool(re.search(
                    r"\bregister\s+of\s+electors\b",
                    text,
                    re.IGNORECASE,
                )),
                "marked_register": bool(re.search(
                    r"\bmarked\s+register\b",
                    text,
                    re.IGNORECASE,
                )),
            },
        }
    finally:
        image.close()


def _scan_header(pdf_path, page_number, dpi):
    image = _render_page(pdf_path, page_number, dpi)
    if image is None:
        return {
            "page": page_number,
            "polling_district": None,
            "declared_ranges": [],
            "error": "render_unavailable",
        }
    try:
        district, ranges = process._extract_page_header(image)
        return {
            "page": page_number,
            "polling_district": _safe_district(district),
            "declared_ranges": _safe_ranges(ranges),
            "error": None,
        }
    except Exception as exc:
        return {
            "page": page_number,
            "polling_district": None,
            "declared_ranges": [],
            "error": type(exc).__name__,
        }
    finally:
        image.close()


def _district_runs(headers):
    runs = []
    current = None
    for item in headers:
        district = item["polling_district"]
        if current and current["polling_district"] == district:
            current["end_page"] = item["page"]
            current["page_count"] += 1
            continue
        current = {
            "polling_district": district,
            "start_page": item["page"],
            "end_page": item["page"],
            "page_count": 1,
        }
        runs.append(current)
    return runs


def _content_page_numbers(page_count, skip_pages, sample_pages_per_document):
    pages = list(range(skip_pages + 1, page_count + 1))
    if (
        sample_pages_per_document <= 0
        or sample_pages_per_document >= len(pages)
    ):
        return pages
    if sample_pages_per_document == 1:
        return [pages[len(pages) // 2]]
    last_index = len(pages) - 1
    indexes = {
        round(position * last_index / (sample_pages_per_document - 1))
        for position in range(sample_pages_per_document)
    }
    return [pages[index] for index in sorted(indexes)]


def _audit_document(pdf_path, document_index, dpi, workers, skip_pages,
                    sample_pages_per_document):
    started = time.monotonic()
    page_count = process._count_pages(str(pdf_path))
    if page_count < 1:
        return {
            "document": document_index,
            "page_count": 0,
            "error": "page_count_unavailable",
        }

    cover = _scan_cover(pdf_path, dpi)
    content_pages = _content_page_numbers(
        page_count,
        skip_pages,
        sample_pages_per_document,
    )
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        headers = list(pool.map(
            lambda page: _scan_header(pdf_path, page, dpi),
            content_pages,
        ))

    district_counts = Counter(
        item["polling_district"]
        for item in headers
        if item["polling_district"]
    )
    declared_ranges = []
    seen_ranges = set()
    for item in headers:
        for declared in item["declared_ranges"]:
            key = (
                declared["district"],
                declared["declared_start"],
                declared["declared_end"],
            )
            if key not in seen_ranges:
                seen_ranges.add(key)
                declared_ranges.append(declared)

    scanned = len(headers)
    recognised = sum(item["polling_district"] is not None for item in headers)
    pages_with_ranges = sum(bool(item["declared_ranges"]) for item in headers)
    error_counts = Counter(item["error"] for item in headers if item["error"])
    return {
        "document": document_index,
        "page_count": page_count,
        "content_pages_scanned": scanned,
        "cover": cover,
        "recognised_district_pages": recognised,
        "recognised_district_page_pct": (
            round(recognised / scanned * 100, 1) if scanned else 0.0
        ),
        "pages_with_declared_ranges": pages_with_ranges,
        "unique_polling_districts": sorted(district_counts),
        "polling_district_page_counts": dict(sorted(district_counts.items())),
        "district_runs": _district_runs(headers),
        "declared_ranges": declared_ranges,
        "header_error_counts": dict(sorted(error_counts.items())),
        "elapsed_seconds": round(time.monotonic() - started, 1),
        "error": None,
    }


def run_audit(pdf_paths, output_path, dpi=200, workers=6, skip_pages=2,
              sample_pages_per_document=0):
    _configure_local_binaries()
    documents = []
    for index, pdf_path in enumerate(pdf_paths, start=1):
        print(f"Scanning anonymous header structure for document {index}...")
        documents.append(
            _audit_document(
                Path(pdf_path),
                document_index=index,
                dpi=dpi,
                workers=workers,
                skip_pages=skip_pages,
                sample_pages_per_document=sample_pages_per_document,
            )
        )

    all_districts = Counter()
    for document in documents:
        all_districts.update(document.get("polling_district_page_counts", {}))

    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "privacy": (
            "Header-only aggregate local report. No filename, input path, raw "
            "OCR text, elector row, elector number, name, address, or rendered "
            "page is stored."
        ),
        "settings": {
            "header_render_dpi": dpi,
            "grayscale": True,
            "skip_pages": skip_pages,
            "workers": workers,
            "sample_pages_per_document": sample_pages_per_document,
        },
        "document_count": len(documents),
        "page_count": sum(item.get("page_count", 0) for item in documents),
        "unique_polling_districts": sorted(all_districts),
        "polling_district_page_counts": dict(sorted(all_districts.items())),
        "documents": documents,
    }
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def _parser():
    parser = argparse.ArgumentParser(
        description="Create a privacy-safe header-only marked-register audit."
    )
    parser.add_argument("--pdf", action="append", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--dpi", type=int, default=200)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--skip-pages", type=int, default=2)
    parser.add_argument("--sample-pages-per-document", type=int, default=0)
    return parser


def main(argv=None):
    args = _parser().parse_args(argv)
    if any(not path.is_file() or path.suffix.lower() != ".pdf" for path in args.pdf):
        print("Audit failed: every input must be a readable PDF.", file=sys.stderr)
        return 2
    if args.dpi < 100 or args.dpi > 600:
        print("Audit failed: DPI must be between 100 and 600.", file=sys.stderr)
        return 2
    if (
        args.workers < 1
        or args.workers > 32
        or args.skip_pages < 0
        or args.sample_pages_per_document < 0
    ):
        print("Audit failed: invalid worker or skipped-page setting.", file=sys.stderr)
        return 2

    try:
        report = run_audit(
            args.pdf,
            args.output,
            dpi=args.dpi,
            workers=args.workers,
            skip_pages=args.skip_pages,
            sample_pages_per_document=args.sample_pages_per_document,
        )
    except Exception as exc:
        print(f"Audit failed: {type(exc).__name__}", file=sys.stderr)
        return 1

    recognised = sum(
        item.get("recognised_district_pages", 0)
        for item in report["documents"]
    )
    scanned = sum(
        item.get("content_pages_scanned", 0)
        for item in report["documents"]
    )
    print(
        f"Header audit complete: {recognised:,} of {scanned:,} content pages "
        "had a recognised polling-district code."
    )
    print(f"Aggregate report written to: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
