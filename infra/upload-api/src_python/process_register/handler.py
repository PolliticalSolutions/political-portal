"""
ProcessRegisterFunction — Marked Register OCR Lambda

Triggered by SQS (ProcessQueue). Dispatches on message shape:

  {jobId, bucket, s3Key}                                   → Splitter role.
      Counts pages, writes a JOB_CHUNKS# tracker, and enqueues one chunk
      message per page range back onto ProcessQueue. (If CHUNK_PAGES=0 it
      instead runs the original serial path unchanged — the rollback switch.)

  {jobId, bucket, s3Key, pageStart, pageEnd, chunkIndex,   → Worker role.
   totalChunks}
      OCRs that page range only (parallel across pages within the chunk),
      writes a per-chunk JSON output, and finalises the job once every chunk
      of the job has settled.

The splitter message shape is identical to what uploadCompleteHandler.mjs and
ScanResultHandlerFunction already enqueue, so those handlers need no changes.
"""

import concurrent.futures
import json
import os
import re
import sys
import tempfile
import logging
from decimal import Decimal
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

# ── Tesseract / pdf2image setup ───────────────────────────────────────────────
# The Lambda layer places binaries at /opt/bin and tessdata at /opt/tessdata.
os.environ.setdefault("TESSDATA_PREFIX", "/opt/tessdata")
# Tesseract uses OpenMP internally. With several Tesseract processes running
# concurrently (OCR_WORKERS threads), each spawning its own OpenMP pool would
# oversubscribe the vCPUs and thrash — often slower than serial. Pin to 1.
os.environ.setdefault("OMP_THREAD_LIMIT", "1")
POPPLER_PATH = "/opt/bin"
TESSERACT_CMD = "/opt/bin/tesseract"

try:
    import pytesseract
    from pdf2image import convert_from_path
    from pdf2image.pdf2image import pdfinfo_from_path
    from PIL import Image, ImageOps, ImageEnhance
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False

# ── Config ────────────────────────────────────────────────────────────────────
JOBS_TABLE = os.environ.get("JOBS_TABLE", "")
UPLOADS_BUCKET = os.environ.get("UPLOADS_BUCKET", "")
COMBINE_FUNCTION_ARN = os.environ.get("COMBINE_FUNCTION_ARN", "")
PROCESS_QUEUE_URL = os.environ.get("PROCESS_QUEUE_URL", "")
REGION = os.environ.get("AWS_REGION", "eu-west-2")

dynamo = boto3.resource("dynamodb", region_name=REGION)
s3_client = boto3.client("s3", region_name=REGION)
lambda_client = boto3.client("lambda", region_name=REGION)
sqs_client = boto3.client("sqs", region_name=REGION)

logger = logging.getLogger()
logger.setLevel(logging.INFO)


# ════════════════════════════════════════════════════════════════════════════════
# OCR logic — ported from marked_register_processor.py
# ════════════════════════════════════════════════════════════════════════════════

_MARK_CHARS = set("—–-_.~=<>+")
_SKIP_KEYWORDS = {
    "staffordshire", "station", "register", "parliamentary", "page",
    "election", "polling", "a-1045", "cont", "index", "district council",
    "station no", "street", "general", "county",
}
_STRIKETHROUGH_SKIP = {
    "manchester", "station", "register", "parliamentary", "page",
    "election", "polling", "district", "county", "cont", "road",
    "street", "avenue", "lane", "drive",
}
_MONTH_MAP = {
    "january": "01", "february": "02", "march": "03", "april": "04",
    "may": "05", "june": "06", "july": "07", "august": "08",
    "september": "09", "october": "10", "november": "11", "december": "12",
    "jan": "01", "feb": "02", "mar": "03", "apr": "04",
    "jun": "06", "jul": "07", "aug": "08",
    "sep": "09", "oct": "10", "nov": "11", "dec": "12",
}
MAX_GAP_TO_FILL = 10

# Header patterns that identify a page's polling district. Shared by the page-1
# metadata parse (_extract_metadata) and the per-page detection (§6.2).
_DISTRICT_PATTERNS = [
    r"Polling\s+District\s+([A-Z0-9]{2,8})",
    r"(?:Council|Borough|Hamlets)\s*-\s*([A-Z0-9]{2,8})\b",
    r"Electors\s+([A-Z0-9]{2,8})-\d+\s+to",
    r"\(([A-Z0-9]{2,8})-\d+\s*/\s*[A-Z0-9]+-\d+\)",
]


def _has_voting_mark(line_text, dash_chars=""):
    if dash_chars:
        mc = sum(1 for c in dash_chars if c in _MARK_CHARS)
        if mc >= 2 or any(c in dash_chars for c in "—–"):
            return True

    patterns = [
        r"[—–]", r"[._][—–\-]", r"[—–\-][._]", r"[._\-]{3,}",
        r"[<>=+][—–\-]", r"[—–\-][<>=+~]", r"~{2,}", r"={2,}", r"_{2,}",
        r"\._[\-—–]", r"[\-—–]_\.", r"^\s*[\-._]{2,}\s",
    ]
    check = line_text[:35]
    if any(re.search(p, check) for p in patterns):
        return True

    early = re.match(r"^\d+(?:/\d+)?\s*([\-]{2,})", line_text)
    if early:
        return True

    total = len(re.findall(r"[—–\-_~]", line_text))
    if total >= 4:
        h = len(line_text) // 2
        if (
            len(re.findall(r"[—–\-_~]", line_text[:h])) >= 1
            and len(re.findall(r"[—–\-_~]", line_text[h:])) >= 1
        ):
            return True

    if re.search(r"[A-Z][a-z]+[\-—–][A-Z][a-z]+[A-Z]", line_text):
        return True
    if re.search(r"[A-Z][a-z]+[\-—–][A-Z][a-z]*[éèêëàâäùûü]", line_text):
        return True
    if re.search(r"[A-Z][a-z]+\s+[A-Z][a-z]+[\-—–][\s]*$", line_text):
        return True
    return False


def _extract_elector_entry(line, context_prev_num=0):
    line = line.strip()
    if not line or len(line) < 5:
        return None, None

    line = re.sub(r"^[\s:;|'\"\-._~*°©=/\[\]!]+", "", line)

    noise = re.match(r"^([rtl1|i])\s+(\d{2,3})", line)
    if noise:
        line = line[noise.end(1):].strip()

    if re.match(r"^[tT]\s+[A-Z]", line) and context_prev_num in range(4, 7):
        line = "7" + line[1:]
    if re.match(r"^(ai|TT|tt|//)\s+", line) and 75 <= context_prev_num <= 78:
        line = "77" + line[2:]
    if line.startswith("2295"):
        line = "225" + line[4:]

    m227 = re.match(r"^22\s*/\s*([—–\-])", line)
    if m227 and 225 <= context_prev_num <= 228:
        line = "227 " + m227.group(1) + line[m227.end():]

    merged = re.match(r"^(\d{2,3})([4-9])\s*[\-—–]+", line)
    if merged and context_prev_num > 0:
        p = int(merged.group(1))
        if context_prev_num < p <= context_prev_num + 3:
            line = merged.group(1) + " ——" + line[merged.end():]

    if context_prev_num == 180 and line.startswith("184"):
        line = "181" + line[3:]

    line_lower = line.lower()
    if any(kw in line_lower for kw in _SKIP_KEYWORDS):
        return None, None
    if re.match(r"^[A-Za-z][a-z]+\s*$", line):
        return None, None

    m = re.match(
        r"^[}\[\]|:.\s/]*(\d+(?:\s*/\s*\d+)?)\s*[:.]?\s*([—–\-_.~=<>+]*)\s*(.*)$",
        line,
    )
    if not m:
        return None, None

    elector_num = re.sub(r"\s*/\s*", "/", m.group(1))
    dash_chars = m.group(2) or ""
    rest = m.group(3) or ""

    if rest and re.match(r"^\d+\s*$", rest):
        return None, None
    if elector_num.startswith("0"):
        return None, None

    parts = elector_num.split("/")
    try:
        main_num = int(parts[0])
        sub_num = int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        return None, None

    if context_prev_num > 0:
        if main_num < 10 and 70 <= context_prev_num < 80:
            c = 70 + main_num
            if context_prev_num < c <= context_prev_num + 5:
                main_num = c
                elector_num = f"{main_num}/{sub_num}" if sub_num else str(main_num)
        elif 10 <= main_num < 20 and 70 <= context_prev_num < 80:
            c = 60 + main_num
            if context_prev_num < c <= context_prev_num + 5:
                main_num = c
                elector_num = f"{main_num}/{sub_num}" if sub_num else str(main_num)
        elif main_num < 20 and context_prev_num >= 20:
            decade = (context_prev_num // 10) * 10
            c = decade + main_num
            if context_prev_num < c <= context_prev_num + 15:
                main_num = c
                elector_num = f"{main_num}/{sub_num}" if sub_num else str(main_num)

    if main_num > 2000 or main_num < 1:
        return None, None
    if not re.search(r"[A-Za-z]{2,}", rest):
        return None, None
    if rest and re.match(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*$", rest.strip()):
        if "," not in rest and len(rest.strip().split()) <= 2:
            return None, None

    voted = _has_voting_mark(line, dash_chars)
    if not voted and rest:
        em = re.match(r"^[—–\-_.~=<>+]{1,}", rest[:10])
        if em and (any(c in em.group() for c in "—–") or len(em.group()) >= 2):
            voted = True

    return elector_num, voted


def _is_likely_strikethrough(line):
    ll = line.lower()
    if any(kw in ll for kw in _STRIKETHROUGH_SKIP) or len(line) < 10:
        return False
    garbled = len(re.findall(r"[A-Z]{3,}[a-z]|[a-z][A-Z]{2,}|[mwnr]{3,}", line))
    mixed = len(re.findall(r"[a-z][A-Z][a-z]|[A-Z][a-z][A-Z]", line))
    repeated = len(re.findall(r"(.)\1{2,}", line))
    dashes = len(re.findall(r"[—–\-_=]{2,}", line))
    has_name = bool(re.search(r"[A-Z][a-z]{2,}", line))
    num_let = len(re.findall(r"\d[A-Za-z]|[A-Za-z]\d", line))
    score = garbled + mixed + repeated + dashes + num_let
    return (score >= 3 and (has_name or dashes >= 1)) or (len(line) > 40 and garbled >= 2)


def _infer_missing_entries(readable_entries, start_num):
    if not readable_entries:
        return []
    entries = []
    expected = start_num + 1 if start_num > 0 else 1
    for entry in readable_entries:
        if entry.get("is_strikethrough") and entry["main_num"] is None:
            entries.append({"elector_num": str(expected), "voted": True})
            expected += 1
        elif entry["main_num"] is not None:
            actual = entry["main_num"]
            gap = actual - expected
            if 0 < gap <= MAX_GAP_TO_FILL:
                while expected < actual:
                    entries.append({"elector_num": str(expected), "voted": True})
                    expected += 1
            elif gap > MAX_GAP_TO_FILL:
                expected = actual
            entries.append({"elector_num": entry["elector_num"], "voted": entry["voted"]})
            expected = actual + 1
    return entries


def _process_column(image, col_start, col_end, context_start_num=0):
    col_img = image.crop((col_start, 0, col_end, image.size[1]))
    col_img = ImageOps.expand(col_img, border=70, fill="white")
    col_img = ImageEnhance.Contrast(col_img).enhance(1.3)

    text = pytesseract.image_to_string(
        col_img, config=r"--oem 3 --psm 6 -c preserve_interword_spaces=1"
    )

    readable = []
    prev_num = context_start_num
    for line in text.split("\n"):
        line = line.strip()
        if not line or len(line) < 3:
            continue
        elector_num, voted = _extract_elector_entry(line, prev_num)
        if elector_num:
            try:
                main_num = int(elector_num.split("/")[0])
                if context_start_num > 10 and main_num < context_start_num - 10:
                    continue
                readable.append(
                    {"elector_num": elector_num, "main_num": main_num, "voted": voted, "line": line}
                )
                prev_num = main_num
            except ValueError:
                pass
        elif _is_likely_strikethrough(line):
            readable.append(
                {"elector_num": None, "main_num": None, "voted": True, "line": line, "is_strikethrough": True}
            )

    entries = _infer_missing_entries(readable, context_start_num)

    last_num = context_start_num
    if entries:
        try:
            last_num = max(int(e["elector_num"].split("/")[0]) for e in entries if e.get("elector_num"))
        except (ValueError, AttributeError):
            pass
    return entries, last_num


def _detect_columns(image):
    width, height = image.size
    mid = image.crop((int(width * 0.33), 0, int(width * 0.66), height))
    mid = ImageOps.expand(mid, border=70, fill="white")
    mid = ImageEnhance.Contrast(mid).enhance(1.3)
    text = pytesseract.image_to_string(mid, config=r"--oem 3 --psm 6")
    count = sum(
        1 for line in text.split("\n")
        if re.match(r"^\d{1,4}\s*[—–\-]?\s*[A-Z][a-z]+", line.strip())
    )
    return 3 if count >= 10 else 2


def _process_page(image, context_num=0, ncols=None):
    w = image.size[0]
    # Column layout is a property of the register's print format and is fixed for
    # the whole document, so the caller may pass a cached ncols (detected once per
    # chunk in §5.6) to skip the extra full-page Tesseract pass. When None, detect
    # as before — this preserves the original serial behaviour exactly.
    if ncols is None:
        ncols = _detect_columns(image)
    entries = []
    if ncols == 3:
        for start, end in [(0, int(w * 0.32)), (int(w * 0.32), int(w * 0.64)), (int(w * 0.64), w)]:
            col_entries, _ = _process_column(image, start, end, 0)
            entries.extend(col_entries)
        last_num = context_num
    else:
        left, left_last = _process_column(image, 0, int(w * 0.48), 0)
        right, right_last = _process_column(image, int(w * 0.50), w, 0)
        entries = left + right
        last_num = max(left_last, right_last) if left_last and right_last else (left_last or right_last or 0)
    return entries, last_num


def _extract_metadata(image):
    """Extract date, polling district, vote type from a page image."""
    text = pytesseract.image_to_string(image)

    # Election date
    dm = re.search(
        r"(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|"
        r"October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{4})",
        text, re.IGNORECASE,
    )
    election_date = None
    if dm:
        month = _MONTH_MAP.get(dm.group(2).lower(), "01")
        election_date = f"{dm.group(1).zfill(2)}/{month}/{dm.group(3)}"

    # Polling district
    polling_district = None
    for pat in _DISTRICT_PATTERNS:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            polling_district = m.group(1)
            break

    vote_type = "Postal" if "postal" in text.lower() else "In Person"
    return election_date, polling_district or "Unknown", vote_type


def _extract_page_district(image):
    """OCR the header band of a page and return its polling district code, or None.

    Reads only the top ~12% of the page (printed header text, never marks), so it
    is cheap and safe to run once per page inside the worker loop (§6.2)."""
    w, h = image.size
    header = image.crop((0, 0, w, int(h * 0.12)))
    text = pytesseract.image_to_string(header, config=r"--oem 3 --psm 6")
    for pat in _DISTRICT_PATTERNS:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(1)
    return None


def _render_page(pdf_path, page_num, grayscale=False):
    """Render a single page at 600dpi. Greyscale is opt-in (OCR_GRAYSCALE) and
    cuts image memory ~3x; Tesseract binarises internally so it must be verified
    byte-identical (Test 1) before the default is flipped (§5.8)."""
    return convert_from_path(
        pdf_path, dpi=600, first_page=page_num, last_page=page_num,
        poppler_path=POPPLER_PATH, grayscale=grayscale,
    )


def _count_pages(pdf_path):
    try:
        info = pdfinfo_from_path(pdf_path, poppler_path=POPPLER_PATH)
        return int(info.get("Pages", 0))
    except Exception:
        return 0


def _build_rows(entries, constituency_name, election_date, polling_district, vote_type,
                attach_page):
    """Map extracted entries to CSV row dicts. attach_page adds the source page
    number (consumed by combiner district resolution; build_csv ignores it)."""
    rows = []
    for e in entries:
        row = {
            "election_date": election_date,
            "constituency": constituency_name or "Unknown Constituency",
            "polling_district": polling_district,
            "elector_number": e["elector_num"],
            "voted": "Y" if e.get("voted") else "N",
            "postal_vote": "Y" if vote_type == "Postal" else "N",
        }
        if attach_page and e.get("page") is not None:
            row["page"] = e["page"]
        rows.append(row)
    return rows


def _ocr_serial(pdf_path, total_pages, constituency_name, election_date,
                polling_district, vote_type):
    """Original serial page-by-page OCR path, preserved unchanged for the
    CHUNK_PAGES=0 rollback switch (§10)."""
    if total_pages == 0:
        # Fallback: convert all and measure (original behaviour; rollback only).
        all_pages = convert_from_path(pdf_path, dpi=600, poppler_path=POPPLER_PATH)
        total_pages = len(all_pages)

    skip_pages = 2
    all_entries = []

    for page_num in range(1, total_pages + 1):
        if page_num <= skip_pages:
            logger.info("Skipping cover page %d", page_num)
            continue

        logger.info("OCR page %d / %d", page_num, total_pages)
        page_images = convert_from_path(
            pdf_path, dpi=600,
            first_page=page_num, last_page=page_num,
            poppler_path=POPPLER_PATH,
        )
        if not page_images:
            continue

        img = page_images[0]
        entries, _ = _process_page(img)
        all_entries.extend(entries)
        del img, page_images  # free memory; image file not persisted

    # Deduplicate by elector number (original whole-document key).
    seen = set()
    unique = []
    for e in all_entries:
        k = e.get("elector_num")
        if k and k not in seen:
            seen.add(k)
            unique.append(e)

    return _build_rows(unique, constituency_name, election_date, polling_district,
                       vote_type, attach_page=False)


def _ocr_chunk(pdf_path, page_start, page_end, total_pages, constituency_name,
               election_date, polling_district, vote_type):
    """Parallel OCR of one page range. Detects column layout once for the chunk,
    OCRs the remaining pages concurrently, tags every row with its source page,
    and records each page's detected polling district. Returns (rows, pageDistricts)."""
    workers = int(os.environ.get("OCR_WORKERS", "6"))
    grayscale = os.environ.get("OCR_GRAYSCALE", "false").strip().lower() == "true"
    skip_pages = 2

    if total_pages > 0:
        if page_start > total_pages:
            # A chunk pointed entirely beyond the document is a hard failure, not
            # a silently-empty success (Test 7).
            raise ValueError(
                f"Chunk page range {page_start}-{page_end} is beyond document length {total_pages}"
            )
        if page_end is None or page_end > total_pages:
            page_end = total_pages

    # Absolute page numbering keeps the cover-page skip absolute (invariant 3).
    content_pages = [p for p in range(page_start, page_end + 1) if p > skip_pages]

    page_entries = {}     # absolute page number -> list of entry dicts
    page_districts = {}   # absolute page number -> district code or None

    if not content_pages:
        return [], page_districts

    # §5.6 — detect the column layout once, on the chunk's first content page, and
    # reuse that rendered image so we don't render it a second time at 600dpi.
    detect_page = content_pages[0]
    ncols = None
    first_imgs = _render_page(pdf_path, detect_page, grayscale)
    if first_imgs:
        img0 = first_imgs[0]
        try:
            ncols = _detect_columns(img0)
            entries0, _ = _process_page(img0, ncols=ncols)
            for e in entries0:
                e["page"] = detect_page
            page_entries[detect_page] = entries0
            page_districts[detect_page] = _extract_page_district(img0)
        finally:
            del img0, first_imgs

    def _work(page_num):
        imgs = _render_page(pdf_path, page_num, grayscale)
        if not imgs:
            return page_num, [], None
        img = imgs[0]
        try:
            entries, _ = _process_page(img, ncols=ncols)
            for e in entries:
                e["page"] = page_num
            district = _extract_page_district(img)
            return page_num, entries, district
        finally:
            del img, imgs

    remaining = content_pages[1:]
    if remaining:
        # Threads (not processes): pytesseract and pdf2image both shell out to
        # external binaries, releasing the GIL, and threads avoid pickling PIL
        # images / fork() issues inside Lambda (§5.2).
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            for page_num, entries, district in pool.map(_work, remaining):
                page_entries[page_num] = entries
                page_districts[page_num] = district

    # Flatten in ascending page order — ordering must be deterministic (invariant 1).
    all_entries = []
    for page_num in sorted(page_entries):
        all_entries.extend(page_entries[page_num])

    # In-worker dedupe keyed on (page, elector_num). The duplicates this removes
    # are within-page OCR artefacts (the same line caught by two overlapping
    # column crops). Cross-page repeats are almost always distinct electors in
    # different districts and must survive to the combiner (§5.2 / §6).
    seen = set()
    unique = []
    for e in all_entries:
        key = (e.get("page"), e.get("elector_num"))
        if key[1] and key not in seen:
            seen.add(key)
            unique.append(e)

    rows = _build_rows(unique, constituency_name, election_date, polling_district,
                       vote_type, attach_page=True)
    # JSON object keys are strings; keep the map string-keyed for round-trip
    # stability through S3 (§5.4).
    page_districts_out = {str(k): v for k, v in page_districts.items()}
    return rows, page_districts_out


def ocr_pdf(pdf_path, constituency_name, election_name, election_date_override="",
            page_start=None, page_end=None):
    """
    OCR a PDF and return (rows, meta, pageDistricts).

    When page_start/page_end are given the function OCRs only that page range in
    parallel (chunk worker mode), tagging each row with its source page and
    returning a per-page district map. When both are omitted it runs the original
    serial path unchanged (the CHUNK_PAGES=0 rollback), returning an empty
    pageDistricts map and rows without a page field.

    Page-1 metadata (date, polling district, vote type) is extracted at 150dpi in
    every invocation, so all chunks of a job carry the same seed values (§6.3).
    election_date_override (from the form) takes precedence over OCR-derived dates.
    """
    logger.info("Converting first page for metadata extraction")
    first_pages = convert_from_path(
        pdf_path, dpi=150, first_page=1, last_page=1, poppler_path=POPPLER_PATH
    )
    ocr_election_date, polling_district, vote_type = (
        _extract_metadata(first_pages[0]) if first_pages else (None, "Unknown", "In Person")
    )
    election_date = (
        election_date_override
        or ocr_election_date
        or datetime.now(timezone.utc).strftime("%d/%m/%Y")
    )
    meta = {
        "election_date": election_date,
        "polling_district": polling_district,
        "vote_type": vote_type,
    }

    total_pages = _count_pages(pdf_path)

    if page_start is None:
        rows = _ocr_serial(pdf_path, total_pages, constituency_name, election_date,
                           polling_district, vote_type)
        logger.info("OCR complete (serial): %d entries extracted", len(rows))
        return rows, meta, {}

    rows, page_districts = _ocr_chunk(
        pdf_path, page_start, page_end, total_pages, constituency_name,
        election_date, polling_district, vote_type,
    )
    logger.info(
        "OCR complete (chunk %s-%s): %d entries extracted", page_start, page_end, len(rows)
    )
    return rows, meta, page_districts


# ════════════════════════════════════════════════════════════════════════════════
# DynamoDB helpers
# ════════════════════════════════════════════════════════════════════════════════

def get_job(job_id):
    table = dynamo.Table(JOBS_TABLE)
    resp = table.get_item(Key={"jobId": job_id})
    return resp.get("Item")


def update_job_succeeded(job_id, output_key, processed_at):
    table = dynamo.Table(JOBS_TABLE)
    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression="SET #st = :s, outputKey = :ok, processedAt = :pa, updatedAt = :ua",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={
            ":s": "SUCCEEDED",
            ":ok": output_key,
            ":pa": processed_at,
            ":ua": processed_at,
        },
    )


def update_job_failed(job_id, reason, failed_at):
    table = dynamo.Table(JOBS_TABLE)
    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression="SET #st = :s, failureReason = :r, updatedAt = :ua",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={":s": "FAILED", ":r": reason, ":ua": failed_at},
    )


def try_trigger_combiner(batch_id, total_files, job_payload):
    """
    Atomically increment completed count for this batch.
    If this Lambda completes the batch, it claims combiner invocation via
    a conditional update (attribute_not_exists), guaranteeing exactly-once.

    Called once per file when the file's job settles — success OR failure — so a
    failed file never leaves the batch hanging (§5.7.1).
    """
    table = dynamo.Table(JOBS_TABLE)
    tracker_key = f"BATCH_TRACKER#{batch_id}"

    resp = table.update_item(
        Key={"jobId": tracker_key},
        UpdateExpression="ADD completedCount :one SET totalFiles = if_not_exists(totalFiles, :tf)",
        ExpressionAttributeValues={":one": Decimal("1"), ":tf": Decimal(str(total_files))},
        ReturnValues="ALL_NEW",
    )
    completed = int(resp["Attributes"].get("completedCount", 0))
    logger.info("Batch %s: %d / %d completed", batch_id, completed, total_files)

    if completed < total_files:
        return

    # Try to claim the combiner invocation
    try:
        table.update_item(
            Key={"jobId": tracker_key},
            UpdateExpression="SET combinerInvoked = :true",
            ConditionExpression="attribute_not_exists(combinerInvoked)",
            ExpressionAttributeValues={":true": True},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            logger.info("Batch %s: combiner already claimed by another Lambda", batch_id)
            return
        raise

    logger.info("Batch %s: invoking CombineRegisterFunction", batch_id)
    lambda_client.invoke(
        FunctionName=COMBINE_FUNCTION_ARN,
        InvocationType="Event",  # async
        Payload=json.dumps(job_payload).encode(),
    )


def try_finalise_job(job_id, batch_id, total_files, combine_payload, output_prefix,
                     chunk_failed):
    """
    Settle one chunk of a job and, once every chunk has settled, finalise the job.

    Mirrors the try_trigger_combiner claim pattern: ADD to the per-job
    JOB_CHUNKS# tracker, and when completedChunks reaches totalChunks, claim
    finalisation exactly once via ConditionExpression="attribute_not_exists(jobFinalised)".
    On the winning claim the job is marked SUCCEEDED (all chunks ok) or FAILED
    (any chunk failed — §5.7.3), then the batch counter is incremented so the
    batch can complete.
    """
    table = dynamo.Table(JOBS_TABLE)
    tracker_key = f"JOB_CHUNKS#{job_id}"

    resp = table.update_item(
        Key={"jobId": tracker_key},
        UpdateExpression="ADD completedChunks :one, failedChunks :f",
        ExpressionAttributeValues={
            ":one": Decimal("1"),
            ":f": Decimal("1") if chunk_failed else Decimal("0"),
        },
        ReturnValues="ALL_NEW",
    )
    attrs = resp["Attributes"]
    total_chunks = int(attrs.get("totalChunks", 0))
    completed = int(attrs.get("completedChunks", 0))
    failed = int(attrs.get("failedChunks", 0))
    logger.info(
        "Job %s: chunk settled (%d / %d chunks, %d failed)",
        job_id, completed, total_chunks, failed,
    )

    if total_chunks <= 0 or completed < total_chunks:
        return False

    # Claim finalisation — exactly-once even when the last chunks finish concurrently.
    try:
        table.update_item(
            Key={"jobId": tracker_key},
            UpdateExpression="SET jobFinalised = :true",
            ConditionExpression="attribute_not_exists(jobFinalised)",
            ExpressionAttributeValues={":true": True},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            logger.info("Job %s: finalisation already claimed", job_id)
            return False
        raise

    # Everything after the claim is best-effort: never re-raise into the caller,
    # so a post-claim error cannot cause the chunk to be settled twice.
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        if failed > 0:
            update_job_failed(job_id, f"{failed} of {total_chunks} chunk(s) failed", now_iso)
            logger.warning("Job %s finalised as FAILED (%d/%d chunks failed)",
                           job_id, failed, total_chunks)
        else:
            update_job_succeeded(job_id, output_prefix, now_iso)
            logger.info("Job %s finalised as SUCCEEDED (%d chunks)", job_id, total_chunks)
        if batch_id:
            try_trigger_combiner(batch_id, total_files, combine_payload)
    except Exception:
        logger.exception("Job %s: error during post-claim finalisation", job_id)
    return True


# ════════════════════════════════════════════════════════════════════════════════
# Splitter
# ════════════════════════════════════════════════════════════════════════════════

def _build_chunk_ranges(total_pages, chunk_pages):
    ranges = []
    page = 1
    while page <= total_pages:
        ranges.append((page, min(page + chunk_pages - 1, total_pages)))
        page += chunk_pages
    return ranges


def run_splitter(job_id, bucket, s3_key, chunk_pages):
    """Count pages, write the JOB_CHUNKS# tracker, and enqueue one chunk message
    per page range. The tracker is written BEFORE any chunk is enqueued so a fast
    chunk can never complete against a tracker that does not yet exist (§5.1)."""
    suffix = Path(s3_key).suffix or ".pdf"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name
    try:
        s3_client.download_file(bucket, s3_key, tmp_path)
        try:
            info = pdfinfo_from_path(tmp_path, poppler_path=POPPLER_PATH)
        except Exception as exc:
            # Do NOT fall back to a full 600dpi render just to count pages — that
            # is exactly the silent 900s burn this change removes (§5.1).
            raise ValueError(f"Could not read PDF page count for {s3_key}: {exc}") from exc
        total_pages = int(info.get("Pages", 0))
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    if total_pages <= 0:
        raise ValueError(f"PDF {s3_key} reported {total_pages} pages")

    ranges = _build_chunk_ranges(total_pages, chunk_pages)
    total_chunks = len(ranges)

    # Write the tracker first (totalChunks known; counters seeded at 0).
    table = dynamo.Table(JOBS_TABLE)
    table.update_item(
        Key={"jobId": f"JOB_CHUNKS#{job_id}"},
        UpdateExpression=(
            "SET totalChunks = :tc, "
            "completedChunks = if_not_exists(completedChunks, :z), "
            "failedChunks = if_not_exists(failedChunks, :z)"
        ),
        ExpressionAttributeValues={":tc": Decimal(str(total_chunks)), ":z": Decimal("0")},
    )

    for chunk_index, (page_start, page_end) in enumerate(ranges):
        message = {
            "jobId": job_id,
            "bucket": bucket,
            "s3Key": s3_key,
            "pageStart": page_start,
            "pageEnd": page_end,
            "chunkIndex": chunk_index,
            "totalChunks": total_chunks,
        }
        sqs_client.send_message(
            QueueUrl=PROCESS_QUEUE_URL,
            MessageBody=json.dumps(message),
        )

    logger.info(
        "Splitter: job %s (%d pages) -> %d chunk(s) of up to %d pages",
        job_id, total_pages, total_chunks, chunk_pages,
    )


# ════════════════════════════════════════════════════════════════════════════════
# Lambda handler
# ════════════════════════════════════════════════════════════════════════════════

def _cleanup(path):
    try:
        os.unlink(path)
    except OSError:
        pass


def handler(event, context):
    if not OCR_AVAILABLE:
        logger.error("OCR libraries not available — Tesseract layer may be missing")
        raise RuntimeError("OCR libraries not available")

    chunk_pages = int(os.environ.get("CHUNK_PAGES", "20"))
    records = event.get("Records", [])
    failures = []

    for record in records:
        job_id = None
        mode = "serial"
        settle_ctx = None
        chunk_settle_attempted = False
        try:
            body = json.loads(record["body"])
            job_id = body["jobId"]
            bucket = body.get("bucket", UPLOADS_BUCKET)
            s3_key = body["s3Key"]

            is_worker = "pageStart" in body
            if is_worker:
                mode = "worker"
            elif chunk_pages == 0:
                mode = "serial"  # rollback switch — original serial path (§10)
            else:
                mode = "splitter"

            # Fetch full job record for batch metadata (needed by every mode).
            job = get_job(job_id)
            if not job:
                raise ValueError(f"Job {job_id} not found in DynamoDB")

            user_sub = job.get("userSub") or job.get("userId") or "unknown-user"
            batch_id = job.get("batchId", "")
            total_files = int(job.get("totalFilesInBatch", 1))

            # New free-text metadata fields (mandatory for new uploads).
            association = (job.get("association") or "").strip()
            constituency_field = (job.get("constituency") or "").strip()
            council_area = (job.get("councilArea") or "").strip()
            election_label = (job.get("election") or "").strip()
            election_date_field = (job.get("electionDate") or "").strip()

            # Legacy fallback for in-flight jobs created before the schema change.
            constituency_ons = job.get("constituencyOnsCode") or job.get("pconCode", "")
            election_id = job.get("electionId", "")
            constituency_name = (
                constituency_field
                or job.get("constituencyName")
                or constituency_ons
                or "Unknown Constituency"
            )
            election_name = election_label or job.get("electionName") or election_id

            output_prefix = f"outputs/{user_sub}/{batch_id or job_id}"
            combine_payload = {
                "batchId": batch_id,
                "userSub": user_sub,
                "association": association,
                "constituency": constituency_field,
                "councilArea": council_area,
                "election": election_label,
                "electionDate": election_date_field,
                "constituencyOnsCode": constituency_ons,
                "electionId": election_id,
                "totalFilesInBatch": total_files,
            }
            settle_ctx = {
                "mode": mode,
                "batch_id": batch_id,
                "total_files": total_files,
                "combine_payload": combine_payload,
                "output_prefix": output_prefix,
            }

            output_meta = {
                "jobId": job_id,
                "userSub": user_sub,
                "batchId": batch_id,
                "association": association,
                "constituency": constituency_field,
                "councilArea": council_area,
                "election": election_label,
                "electionDate": election_date_field,
                "constituencyOnsCode": constituency_ons,
                "electionId": election_id,
            }

            # ── Splitter ──────────────────────────────────────────────────────
            if mode == "splitter":
                logger.info("Splitter: job %s (s3://%s/%s)", job_id, bucket, s3_key)
                run_splitter(job_id, bucket, s3_key, chunk_pages)
                continue

            # ── Worker (chunk) ────────────────────────────────────────────────
            if mode == "worker":
                page_start = int(body["pageStart"])
                page_end = int(body["pageEnd"])
                chunk_index = int(body.get("chunkIndex", 0))
                total_chunks = int(body.get("totalChunks", 1))

                receive_count = int(
                    (record.get("attributes") or {}).get("ApproximateReceiveCount", "1") or "1"
                )
                if receive_count >= 3:
                    # Final delivery before the DLQ — do not attempt the work.
                    # Settle this chunk as failed so the job settles as FAILED and
                    # the batch completes, converting a permanent hang into a
                    # clean, visible failure (§5.7.2).
                    logger.error(
                        "Job %s chunk %d at receive count %d — settling as FAILED (§5.7.2)",
                        job_id, chunk_index, receive_count,
                    )
                    chunk_settle_attempted = True
                    try_finalise_job(job_id, batch_id, total_files, combine_payload,
                                     output_prefix, chunk_failed=True)
                    continue

                logger.info(
                    "Worker: job %s chunk %d/%d pages %d-%d",
                    job_id, chunk_index, total_chunks, page_start, page_end,
                )

                suffix = Path(s3_key).suffix or ".pdf"
                with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                    tmp_path = tmp.name
                s3_client.download_file(bucket, s3_key, tmp_path)
                logger.info("Downloaded to %s (%d bytes)", tmp_path, os.path.getsize(tmp_path))

                rows, ocr_meta, page_districts = ocr_pdf(
                    tmp_path,
                    constituency_name,
                    election_name,
                    election_date_override=election_date_field,
                    page_start=page_start,
                    page_end=page_end,
                )
                _cleanup(tmp_path)

                # Zero-pad chunkIndex so lexicographic S3 listing == numeric order.
                output_key = f"{output_prefix}/{job_id}-{chunk_index:04d}.json"
                output_payload = dict(output_meta)
                output_payload.update({
                    "chunkIndex": chunk_index,
                    "totalChunks": total_chunks,
                    "pageDistricts": page_districts,
                    "rows": rows,
                    "meta": ocr_meta,
                    "processedAt": datetime.now(timezone.utc).isoformat(),
                })
                s3_client.put_object(
                    Bucket=UPLOADS_BUCKET,
                    Key=output_key,
                    Body=json.dumps(output_payload),
                    ContentType="application/json",
                )
                logger.info(
                    "Wrote chunk output s3://%s/%s (%d rows)",
                    UPLOADS_BUCKET, output_key, len(rows),
                )

                chunk_settle_attempted = True
                try_finalise_job(job_id, batch_id, total_files, combine_payload,
                                 output_prefix, chunk_failed=False)
                continue

            # ── Serial (rollback, CHUNK_PAGES=0) ──────────────────────────────
            logger.info("Serial: job %s (s3://%s/%s)", job_id, bucket, s3_key)
            suffix = Path(s3_key).suffix or ".pdf"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp_path = tmp.name
            s3_client.download_file(bucket, s3_key, tmp_path)
            logger.info("Downloaded to %s (%d bytes)", tmp_path, os.path.getsize(tmp_path))

            rows, ocr_meta, _ = ocr_pdf(
                tmp_path,
                constituency_name,
                election_name,
                election_date_override=election_date_field,
            )
            _cleanup(tmp_path)

            output_key = f"{output_prefix}/{job_id}.json"
            output_payload = dict(output_meta)
            output_payload.update({
                "rows": rows,
                "meta": ocr_meta,
                "processedAt": datetime.now(timezone.utc).isoformat(),
            })
            s3_client.put_object(
                Bucket=UPLOADS_BUCKET,
                Key=output_key,
                Body=json.dumps(output_payload),
                ContentType="application/json",
            )
            logger.info("Wrote output to s3://%s/%s (%d rows)", UPLOADS_BUCKET, output_key, len(rows))

            now_iso = datetime.now(timezone.utc).isoformat()
            update_job_succeeded(job_id, output_key, now_iso)
            if batch_id:
                try_trigger_combiner(batch_id, total_files, combine_payload)

        except Exception as exc:
            logger.exception("Failed to process record for job %s: %s", job_id, exc)
            if job_id and settle_ctx:
                if settle_ctx["mode"] == "worker":
                    # A failed chunk fails the whole file (§5.7.3). Settle it as a
                    # failed chunk unless we already reached the settle step, so
                    # the job settles as FAILED and the batch still completes.
                    if not chunk_settle_attempted:
                        try:
                            try_finalise_job(
                                job_id, settle_ctx["batch_id"], settle_ctx["total_files"],
                                settle_ctx["combine_payload"], settle_ctx["output_prefix"],
                                chunk_failed=True,
                            )
                        except Exception:
                            logger.exception("Failed to settle failed chunk for job %s", job_id)
                else:
                    # Serial or splitter failure: mark the job FAILED and increment
                    # the batch counter so the batch still completes (§5.7.1).
                    try:
                        update_job_failed(job_id, str(exc), datetime.now(timezone.utc).isoformat())
                    except Exception:
                        pass
                    if settle_ctx["batch_id"]:
                        try:
                            try_trigger_combiner(
                                settle_ctx["batch_id"], settle_ctx["total_files"],
                                settle_ctx["combine_payload"],
                            )
                        except Exception:
                            logger.exception("Failed to settle batch for failed job %s", job_id)
            elif job_id:
                # Failure before we loaded the job record; best-effort FAILED mark.
                try:
                    update_job_failed(job_id, str(exc), datetime.now(timezone.utc).isoformat())
                except Exception:
                    pass
            # ACK the message rather than letting SQS retry — the FAILED status
            # in DynamoDB is the user-visible signal.
            continue

    return {"batchItemFailures": failures}
