"""
CombineRegisterFunction — Marked Register Batch Combiner Lambda

Invoked asynchronously by ProcessRegisterFunction once all jobs in a batch
are complete. Reads per-job JSON outputs from S3 (one per chunk since the
chunked-OCR change), resolves each job's polling districts across the full
page sequence, merges and sorts elector rows, builds an Excel workbook with
text-typed roll numbers, uploads it, and emails it as an attachment or directs
the recipient to the authenticated portal when the attachment would exceed
SES's message-size limit.

The filename is built from five form-provided free-text fields:
    {association} - {constituency} - {councilArea} - {election} - {electionDate} - Marked Register.xlsx
For legacy in-flight jobs missing those fields, the filename falls back to:
    {batchId or jobId} - Marked Register.xlsx
"""

import csv
import io
import json
import logging
import os
import re
import zipfile
from collections import Counter
from datetime import datetime, timezone
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

JOBS_TABLE = os.environ.get("JOBS_TABLE", "")
UPLOADS_BUCKET = os.environ.get("UPLOADS_BUCKET", "")
SES_SENDER_EMAIL = os.environ.get("SES_SENDER_EMAIL", "noreply@politicalsolutions.uk")
SES_RECIPIENT_EMAIL = os.environ.get("SES_RECIPIENT_EMAIL", "markedregisters@politicalsolutions.uk")
PLATFORM_BASE_URL = os.environ.get(
    "PLATFORM_BASE_URL", "https://www.politicalsolutions.uk"
).rstrip("/")
SES_MAX_RAW_EMAIL_BYTES = int(
    os.environ.get("SES_MAX_RAW_EMAIL_BYTES", "9500000")
)
DOWNLOAD_URL_TTL_SECONDS = int(
    os.environ.get("DOWNLOAD_URL_TTL_SECONDS", "21600")
)
REGION = os.environ.get("AWS_REGION", "eu-west-2")

dynamo = boto3.resource("dynamodb", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
ses = boto3.client("ses", region_name=REGION)

CSV_COLUMNS = ["Election Date", "Constituency", "Polling District", "Elector Number", "Voted", "Postal Vote"]
_UNTRUSTED_DISTRICT_LABELS = frozenset({"", "DISTRICT", "DIVISION", "UNKNOWN"})


# ── DynamoDB helpers ──────────────────────────────────────────────────────────

def get_all_batch_jobs(batch_id):
    table = dynamo.Table(JOBS_TABLE)
    items = []
    kwargs = {
        "IndexName": "BatchIdIndex",
        "KeyConditionExpression": Key("batchId").eq(batch_id),
    }
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    # Exclude tracker items. JOB_CHUNKS# items must never carry a batchId (so the
    # GSI query cannot surface them), but filter here too for defence in depth —
    # a tracker treated as a real job would fail its output lookup and be counted
    # as a failed file (§5.3).
    return [j for j in items
            if not j.get("jobId", "").startswith(("BATCH_TRACKER#", "JOB_CHUNKS#"))]


def update_job_batch_completion(
    job_id,
    *,
    batch_status,
    completed_at,
    succeeded_count,
    failed_count,
    row_count,
    output_key,
    output_filename,
    output_bytes,
    email_status,
    email_mode,
    email_updated_at,
    email_failure_code="",
):
    """Persist the result and its notification state as separate concerns."""
    table = dynamo.Table(JOBS_TABLE)
    update_expression = (
        "SET batchStatus = :bs, batchCompletedAt = :bc, "
        "batchSucceededCount = :sc, batchFailedCount = :fc, "
        "batchRowCount = :rc, batchOutputKey = :ok, "
        "batchOutputFilename = :of, batchOutputBytes = :ob, "
        "completionEmailStatus = :es, completionEmailMode = :em, "
        "completionEmailUpdatedAt = :eu, updatedAt = :u"
    )
    values = {
        ":bs": batch_status,
        ":bc": completed_at,
        ":sc": succeeded_count,
        ":fc": failed_count,
        ":rc": row_count,
        ":ok": output_key,
        ":of": output_filename,
        ":ob": output_bytes,
        ":es": email_status,
        ":em": email_mode,
        ":eu": email_updated_at,
        ":u": email_updated_at,
    }
    if email_failure_code:
        update_expression += ", completionEmailFailureCode = :ef"
        values[":ef"] = email_failure_code
    else:
        update_expression += " REMOVE completionEmailFailureCode"

    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression=update_expression,
        ExpressionAttributeValues=values,
    )


def update_batch_jobs(jobs, **completion):
    """Update every real job or fail the combiner so its alarm can fire."""
    failed_updates = 0
    for job in jobs:
        try:
            update_job_batch_completion(job["jobId"], **completion)
        except Exception:
            failed_updates += 1
            logger.exception(
                "Failed to persist batch completion metadata for job %s",
                job["jobId"],
            )
    if failed_updates:
        raise RuntimeError(
            f"Failed to persist completion metadata for {failed_updates} job(s)."
        )


# ── S3 helpers ────────────────────────────────────────────────────────────────

def _list_keys(prefix):
    """List all object keys under a prefix, following pagination."""
    keys = []
    kwargs = {"Bucket": UPLOADS_BUCKET, "Prefix": prefix}
    while True:
        resp = s3.list_objects_v2(**kwargs)
        for obj in resp.get("Contents", []):
            keys.append(obj["Key"])
        if not resp.get("IsTruncated"):
            break
        token = resp.get("NextContinuationToken")
        if not token:
            break
        kwargs["ContinuationToken"] = token
    return keys


def read_job_outputs(user_sub, batch_id, job_id):
    """Return a list of parsed output payloads for this job (one per chunk),
    sorted by chunkIndex.

    Lists S3 objects under outputs/{user_sub}/{batch_id}/ with prefix {job_id}
    and reads every .json. Falls back to the legacy outputs/{batch_id}/ path.
    The legacy single-file layout ({job_id}.json) must still resolve."""
    prefixes = []
    if user_sub:
        prefixes.append(f"outputs/{user_sub}/{batch_id}/{job_id}")
    prefixes.append(f"outputs/{batch_id}/{job_id}")

    for prefix in prefixes:
        payloads = []
        for key in _list_keys(prefix):
            if not key.endswith(".json"):
                continue
            try:
                obj = s3.get_object(Bucket=UPLOADS_BUCKET, Key=key)
                payloads.append(json.loads(obj["Body"].read()))
            except Exception as exc:
                logger.warning("Failed to read output %s: %s", key, exc)
        if payloads:
            payloads.sort(key=lambda p: p.get("chunkIndex", 0))
            return payloads

    logger.warning("No output JSON found for job %s in batch %s", job_id, batch_id)
    return []


def upload_csv(user_sub, batch_id, filename, output_content):
    """Upload the result; retain the historical name for recovery tooling."""
    prefix = f"outputs/{user_sub}/{batch_id}" if user_sub else f"outputs/{batch_id}"
    key = f"{prefix}/{filename}"
    body = (
        output_content
        if isinstance(output_content, bytes)
        else str(output_content).encode("utf-8-sig")
    )
    content_type = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if filename.lower().endswith(".xlsx")
        else "text/csv"
    )
    s3.put_object(
        Bucket=UPLOADS_BUCKET,
        Key=key,
        Body=body,
        ContentType=content_type,
        ContentDisposition=f'attachment; filename="{filename}"',
    )
    return key


def generate_download_url(key):
    """Create a bearer URL only for the email body; never persist or log it."""
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": UPLOADS_BUCKET, "Key": key},
        ExpiresIn=DOWNLOAD_URL_TTL_SECONDS,
    )


# ── District resolution (§6.3 / §6.4) ─────────────────────────────────────────

def _elector_main_number(elector_number):
    """Parse the main elector number — the part before '/'. Returns int or None.

    Deliberately NOT the same as _sort_key's re.sub(r'\\D', '', en): that turns
    '47/1' into 471. This is a separate parse for a separate purpose.

    No longer consulted by resolve_job_districts (the numeric-reset trigger it fed
    was removed in Defect A); retained because the declared-range validation (§5)
    will need exactly this parse, and it is covered by its own unit tests."""
    if elector_number is None:
        return None
    head = str(elector_number).split("/")[0].strip()
    try:
        return int(head)
    except (ValueError, TypeError):
        return None


# ── Declared-range validation (§5) ────────────────────────────────────────────

_MAX_DECLARED_SPAN = 100_000


def _normalise_declared_range(value):
    """Return a canonical (district, start, end) tuple, or None if implausible."""
    if not isinstance(value, dict):
        return None
    district = str(value.get("district") or "").strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{2,8}", district):
        return None
    try:
        start = int(value.get("start"))
        end = int(value.get("end"))
    except (TypeError, ValueError):
        return None
    if start < 1 or end < start or (end - start + 1) > _MAX_DECLARED_SPAN:
        return None
    return district, start, end


def resolve_declared_ranges(cover_ranges, page_declared_ranges):
    """Choose file ranges only after independent declaration corroboration.

    Cover declarations must agree exactly with the unique modal range read from
    page headers. A district absent from the cover (for example a genuine second
    register concatenated into the PDF) may use a header-only range only when the
    same declaration appears on at least two pages. Returns
    (trusted_ranges_by_district, issues). No extracted row is changed or dropped.
    """
    cover_by_district = {}
    for value in cover_ranges or []:
        candidate = _normalise_declared_range(value)
        if candidate:
            cover_by_district.setdefault(candidate[0], set()).add(candidate)

    header_counts = {}
    for values in (page_declared_ranges or {}).values():
        if isinstance(values, dict):
            values = [values]
        page_candidates = set()
        for value in values or []:
            candidate = _normalise_declared_range(value)
            if candidate:
                page_candidates.add(candidate)
        for candidate in page_candidates:
            header_counts.setdefault(candidate[0], Counter())[candidate] += 1

    trusted = {}
    issues = []
    districts = sorted(set(cover_by_district) | set(header_counts))

    if not districts:
        return {}, [
            "No declared elector range could be verified from the cover or page headers."
        ]

    for district in districts:
        covers = sorted(cover_by_district.get(district, set()))
        counts = header_counts.get(district, Counter())
        ranked = sorted(
            counts.items(),
            key=lambda item: (-item[1], item[0][1], item[0][2]),
        )
        modal = ranked[0][0] if ranked else None
        modal_count = ranked[0][1] if ranked else 0
        modal_is_unique = bool(ranked) and (
            len(ranked) == 1 or ranked[0][1] > ranked[1][1]
        )

        if covers:
            if len(covers) != 1:
                rendered = ", ".join(f"{start}-{end}" for _, start, end in covers)
                issues.append(
                    f"{district}: conflicting cover ranges ({rendered}); range not trusted."
                )
                continue
            cover = covers[0]
            if not ranked:
                issues.append(
                    f"{district}: cover range {cover[1]}-{cover[2]} had no readable "
                    "page-header range for corroboration; range not trusted."
                )
                continue
            if not modal_is_unique:
                issues.append(
                    f"{district}: page-header ranges have no unique mode; range not trusted."
                )
                continue
            if modal != cover:
                issues.append(
                    f"{district}: cover range {cover[1]}-{cover[2]} disagrees with "
                    f"modal page-header range {modal[1]}-{modal[2]} ({modal_count} page(s)); "
                    "range not trusted."
                )
                continue
            trusted[district] = {
                "district": district,
                "start": cover[1],
                "end": cover[2],
                "evidence": "cover+page_headers",
                "header_count": modal_count,
            }
            continue

        if modal_is_unique and modal_count >= 2:
            trusted[district] = {
                "district": district,
                "start": modal[1],
                "end": modal[2],
                "evidence": "repeated_page_headers",
                "header_count": modal_count,
            }
        elif ranked and not modal_is_unique:
            issues.append(
                f"{district}: page-header ranges have no unique mode and no cover "
                "declaration; range not trusted."
            )
        elif ranked:
            issues.append(
                f"{district}: page-header range {modal[1]}-{modal[2]} appeared only once "
                "and has no cover declaration; range not trusted."
            )

    return trusted, issues


def validate_rows_against_declared_ranges(rows, declared_ranges):
    """Report captured, missing, and out-of-range electors without mutating rows."""
    ranges = {}
    for value in (declared_ranges or {}).values():
        candidate = _normalise_declared_range(value)
        if candidate:
            ranges[candidate[0]] = {
                "district": candidate[0], "start": candidate[1], "end": candidate[2]
            }

    reports = []
    for district in sorted(ranges):
        declared = ranges[district]
        start = declared["start"]
        end = declared["end"]
        captured = set()
        out_of_range = []
        unparseable = []

        for row in rows or []:
            row_district = str(row.get("polling_district") or "").strip().upper()
            if row_district != district:
                continue
            identifier = str(row.get("elector_number") or "").strip()
            main_number = _elector_main_number(identifier)
            if main_number is None:
                unparseable.append(identifier or "(blank)")
            elif main_number < start or main_number > end:
                out_of_range.append(identifier)
            else:
                # 47/1 is in range as elector 47, never 471. Completeness is
                # measured against the register's declared main-number span.
                captured.add(main_number)

        missing = [number for number in range(start, end + 1) if number not in captured]
        declared_count = end - start + 1
        reports.append({
            "district": district,
            "start": start,
            "end": end,
            "declared_count": declared_count,
            "captured_count": len(captured),
            "captured_pct": (len(captured) / declared_count * 100.0),
            "missing_count": len(missing),
            "missing": missing,
            "out_of_range_count": len(out_of_range),
            "out_of_range": sorted(
                out_of_range,
                key=lambda value: (_elector_main_number(value) or 0, value),
            ),
            "unparseable_count": len(unparseable),
            "unparseable": sorted(unparseable),
        })

    issues = []
    if ranges:
        row_districts = {
            str(row.get("polling_district") or "").strip().upper()
            for row in rows or []
            if str(row.get("polling_district") or "").strip()
        }
        unchecked = sorted(row_districts - set(ranges))
        if unchecked:
            issues.append(
                "No trusted declared range was available for extracted district(s): "
                + ", ".join(unchecked)
                + "."
            )
    return reports, issues


def _trusted_district_code(value):
    code = str(value or "").strip().upper()
    return (
        code
        if (
            re.fullmatch(r"[A-Z0-9]{2,8}", code)
            and code not in _UNTRUSTED_DISTRICT_LABELS
        )
        else ""
    )


def _resolve_job_districts_with_report(rows, page_districts, seed_district):
    """Assign a polling_district to every row of one job from the per-page header
    map and return both synthetic labels and trust diagnostics.

    Boundaries are accepted only on corroborated printed header codes: the same
    code must appear on the next physical page, or after exactly one unreadable
    header. A different readable code on the intervening page invalidates the
    match. This tolerates one missed continuation-page header while ensuring
    one-off and alternating OCR errors never create a boundary.

    The report is deliberately aggregate-only. It contains page and row counts,
    codes, percentages, and issue labels, never elector numbers or OCR text.
    """
    if not rows:
        return set(), {
            "trusted": False,
            "row_page_count": 0,
            "recognised_header_pages": 0,
            "header_coverage_pct": 0.0,
            "accepted_districts": [],
            "unresolved_leading_pages": 0,
            "rows_with_untrusted_district": 0,
            "issues": ["No elector rows were available for district resolution."],
        }

    # Normalise the header map to int page keys (JSON object keys arrive as str).
    headers = {}
    for k, v in (page_districts or {}).items():
        try:
            headers[int(k)] = _trusted_district_code(v)
        except (ValueError, TypeError):
            continue

    # Group rows by page.
    rows_by_page = {}
    for row in rows:
        page = row.get("page")
        if page is None:
            continue
        try:
            page = int(page)
        except (ValueError, TypeError):
            continue
        rows_by_page.setdefault(page, []).append(row)

    current_district = _trusted_district_code(seed_district)
    accepted_districts = set()
    first_accepted_page = None

    for page in sorted(rows_by_page):
        header = headers.get(page)
        corroborated = bool(header) and (
            headers.get(page + 1) == header
            or (
                not headers.get(page + 1)
                and headers.get(page + 2) == header
            )
        )
        # Header corroboration is the only accepted boundary: a printed code
        # repeated within the next two physical pages. Elector numbers are
        # intentionally not consulted — a numeric reset is no longer a boundary
        # signal (Defect A). A blank/None header simply inherits the running
        # district, which is how continuation pages actually behave.
        if corroborated and header != current_district:
            current_district = header
            accepted_districts.add(header)
            if first_accepted_page is None:
                first_accepted_page = page
        elif corroborated:
            accepted_districts.add(header)
            if first_accepted_page is None:
                first_accepted_page = page
        for r in rows_by_page[page]:
            r["polling_district"] = current_district

    row_pages = sorted(rows_by_page)
    recognised_header_pages = sum(
        bool(headers.get(page))
        for page in row_pages
    )
    header_coverage_pct = (
        recognised_header_pages / len(row_pages) * 100.0
        if row_pages else 0.0
    )
    unresolved_leading_pages = (
        sum(page < first_accepted_page for page in row_pages)
        if first_accepted_page is not None
        else len(row_pages)
    )
    rows_with_untrusted_district = sum(
        not _trusted_district_code(row.get("polling_district"))
        for row in rows
    )
    min_header_pct = float(os.environ.get("DISTRICT_HEADER_MIN_PCT", "20"))
    issues = []
    if not accepted_districts:
        issues.append(
            "No polling district was corroborated within the next two pages."
        )
    if unresolved_leading_pages:
        issues.append(
            f"{unresolved_leading_pages} leading page(s) preceded the first "
            "corroborated polling-district header."
        )
    if rows_with_untrusted_district:
        issues.append(
            f"{rows_with_untrusted_district} row(s) retained an untrusted "
            "polling-district label."
        )
    if header_coverage_pct < min_header_pct:
        issues.append(
            f"Polling-district headers were recognised on only "
            f"{header_coverage_pct:.1f}% of row-bearing pages "
            f"(minimum {min_header_pct:.0f}%)."
        )

    return set(), {
        "trusted": not issues,
        "row_page_count": len(row_pages),
        "recognised_header_pages": recognised_header_pages,
        "header_coverage_pct": round(header_coverage_pct, 1),
        "accepted_districts": sorted(accepted_districts),
        "unresolved_leading_pages": unresolved_leading_pages,
        "rows_with_untrusted_district": rows_with_untrusted_district,
        "issues": issues,
    }


def resolve_job_districts(rows, page_districts, seed_district):
    """Backward-compatible district resolver returning synthetic labels only."""
    synthetic_labels, _report = _resolve_job_districts_with_report(
        rows,
        page_districts,
        seed_district,
    )
    return synthetic_labels


# ── Tabular output builders ──────────────────────────────────────────────────

def _sort_key(row):
    pd = row.get("polling_district", "")
    en = row.get("elector_number", "")
    try:
        en_int = int(re.sub(r"\D", "", en) or "0")
    except (ValueError, TypeError):
        en_int = 0
    return (pd, en_int, en)


def _dedupe_key(row):
    """Return the canonical composite key without collapsing subnumbers."""
    district = str(row.get("polling_district") or "").strip().upper()
    elector = str(row.get("elector_number") or "").strip()
    return district, elector


def _dedupe_rows(rows):
    """Merge duplicates on (polling_district, elector_number).

    Elector numbers reset per polling district, so elector_number alone would
    collapse distinct electors. For a PDF row matched to an absent-voter CSV
    row, classification flags are combined independently: evidence from either
    source is retained. Repeated rows within one source retain the established
    first-occurrence behaviour.
    """
    by_key = {}
    source_rows_by_key = {}
    out = []
    for row in rows:
        key = _dedupe_key(row)
        if not key[1]:
            continue
        source = str(row.get("_source_type") or "unknown").strip().lower()
        existing = by_key.get(key)
        if existing is None:
            existing = dict(row)
            existing["polling_district"] = key[0]
            existing["elector_number"] = key[1]
            by_key[key] = existing
            source_rows_by_key[key] = {source: row}
            out.append(existing)
            continue

        source_rows = source_rows_by_key[key]
        if source in source_rows:
            continue
        source_rows[source] = row

        # Only the explicitly supported PDF + absent-voter CSV pairing may
        # enrich a row. Unknown or future source types retain first-row-wins.
        if not {"pdf", "csv"}.issubset(source_rows):
            continue
        pdf_row = source_rows["pdf"]
        csv_row = source_rows["csv"]
        existing["voted"] = (
            "Y"
            if "Y" in {
                str(pdf_row.get("voted") or "").strip().upper(),
                str(csv_row.get("voted") or "").strip().upper(),
            }
            else "N"
        )
        existing["postal_vote"] = (
            "Y"
            if "Y" in {
                str(pdf_row.get("postal_vote") or "").strip().upper(),
                str(csv_row.get("postal_vote") or "").strip().upper(),
            }
            else "N"
        )
        for field in ("election_date", "constituency"):
            if not existing.get(field) and row.get(field):
                existing[field] = row[field]
    return out


def _dedupe_source_counts(rows):
    """Separate expected cross-source joins from within-source duplicates."""
    grouped = {}
    blank_elector_rows = 0
    for row in rows:
        key = _dedupe_key(row)
        if not key[1]:
            blank_elector_rows += 1
            continue
        source = str(row.get("_source_type") or "unknown").strip().lower()
        grouped.setdefault(key, Counter())[source] += 1

    within_source = blank_elector_rows
    cross_source = 0
    for source_counts in grouped.values():
        duplicates = sum(source_counts.values()) - 1
        expected_join = int("pdf" in source_counts and "csv" in source_counts)
        cross_source += expected_join
        within_source += duplicates - expected_join
    return {
        "within_source": within_source,
        "cross_source": cross_source,
        "total": within_source + cross_source,
    }


def build_csv(rows):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for row in rows:
        writer.writerow({
            "Election Date": row.get("election_date", ""),
            "Constituency": row.get("constituency", ""),
            "Polling District": row.get("polling_district", ""),
            "Elector Number": row.get("elector_number", ""),
            "Voted": row.get("voted", ""),
            "Postal Vote": row.get("postal_vote", ""),
        })
    return buf.getvalue()


_XML_ILLEGAL_CONTROL_CHARS = re.compile(
    "[\x00-\x08\x0B\x0C\x0E-\x1F]"
)
_XLSX_MAX_DATA_ROWS = 1_048_575


def _xlsx_text(value):
    """Return an XML-safe string that remains literal workbook text."""
    from xml.sax.saxutils import escape

    cleaned = _XML_ILLEGAL_CONTROL_CHARS.sub(
        "",
        str("" if value is None else value),
    )
    return escape(cleaned, {'"': "&quot;"})


def _xlsx_inline_cell(reference, value, style=None):
    style_attribute = f' s="{style}"' if style is not None else ""
    return (
        f'<c r="{reference}" t="inlineStr"{style_attribute}>'
        f'<is><t xml:space="preserve">{_xlsx_text(value)}</t></is></c>'
    )


def build_xlsx(rows):
    """Build a workbook whose values, including roll numbers, are literal text.

    CSV cannot express a column type, so spreadsheet software may reinterpret
    roll numbers such as ``12/3`` as dates. Inline-string XLSX cells preserve
    the actual value and also prevent formula evaluation.
    """
    if len(rows) > _XLSX_MAX_DATA_ROWS:
        raise ValueError(
            "The marked register is too large for one Excel worksheet."
        )

    output = io.BytesIO()
    last_row = len(rows) + 1
    with zipfile.ZipFile(
        output,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=6,
    ) as workbook:
        workbook.writestr(
            "[Content_Types].xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>""",
        )
        workbook.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""",
        )
        workbook.writestr(
            "xl/workbook.xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Marked Register" sheetId="1" r:id="rId1"/></sheets>
</workbook>""",
        )
        workbook.writestr(
            "xl/_rels/workbook.xml.rels",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>""",
        )
        workbook.writestr(
            "xl/styles.xml",
            """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font/><font><b/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>""",
        )

        with workbook.open("xl/worksheets/sheet1.xml", mode="w") as sheet:
            def write(value):
                sheet.write(value.encode("utf-8"))

            write(
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<worksheet '
                'xmlns="http://schemas.openxmlformats.org/'
                'spreadsheetml/2006/main">'
                f'<dimension ref="A1:F{last_row}"/>'
                '<sheetViews><sheetView workbookViewId="0">'
                '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" '
                'state="frozen"/>'
                '</sheetView></sheetViews>'
                '<cols>'
                '<col min="1" max="1" width="16" customWidth="1"/>'
                '<col min="2" max="2" width="28" customWidth="1"/>'
                '<col min="3" max="3" width="18" customWidth="1"/>'
                '<col min="4" max="4" width="18" customWidth="1"/>'
                '<col min="5" max="6" width="13" customWidth="1"/>'
                '</cols><sheetData>'
            )
            write('<row r="1">')
            for column, value in zip("ABCDEF", CSV_COLUMNS):
                write(_xlsx_inline_cell(f"{column}1", value, style=1))
            write("</row>")

            for row_number, row in enumerate(rows, start=2):
                values = (
                    row.get("election_date", ""),
                    row.get("constituency", ""),
                    row.get("polling_district", ""),
                    row.get("elector_number", ""),
                    row.get("voted", ""),
                    row.get("postal_vote", ""),
                )
                write(f'<row r="{row_number}">')
                for column, value in zip("ABCDEF", values):
                    write(_xlsx_inline_cell(
                        f"{column}{row_number}",
                        value,
                        style=0,
                    ))
                write("</row>")
            write(
                "</sheetData>"
                f'<autoFilter ref="A1:F{last_row}"/>'
                "</worksheet>"
            )
    return output.getvalue()


# ── Warning / district reporting ──────────────────────────────────────────────

def _count_districts(rows):
    counts = {}
    for row in rows:
        code = row.get("polling_district", "") or ""
        counts[code] = counts.get(code, 0) + 1
    return counts


def _format_districts(district_counts):
    if not district_counts:
        return "Polling districts: 0"
    parts = [
        f"{code or '(none)'}: {count:,}"
        for code, count in sorted(district_counts.items(), key=lambda kv: (-kv[1], kv[0] or ""))
    ]
    return f"Polling districts: {len(district_counts)} ({', '.join(parts)})"


def _range_warnings_triggered(range_reports, range_issues):
    return bool(range_issues) or any(
        report.get("missing_count", 0)
        or report.get("out_of_range_count", 0)
        or report.get("unparseable_count", 0)
        for report in (range_reports or [])
    )


def _warnings_triggered(dedupe_pct, synthetic_labels, warn_pct,
                        range_reports=None, range_issues=None):
    return (
        (dedupe_pct > warn_pct)
        or bool(synthetic_labels)
        or _range_warnings_triggered(range_reports, range_issues)
    )


def _quality_blockers(dedupe_pct, warn_pct, district_counts,
                      district_resolution_reports):
    """Return fail-closed reasons that make a customer result unsafe to release."""
    blockers = []
    if dedupe_pct > warn_pct:
        blockers.append(
            f"Deduplication would remove {dedupe_pct:.1f}% of within-source "
            f"rows (maximum {warn_pct:.0f}%)."
        )

    untrusted_labels = sorted(
        str(code or "(blank)")
        for code in (district_counts or {})
        if not _trusted_district_code(code)
    )
    if untrusted_labels:
        blockers.append(
            "Untrusted polling-district labels remain: "
            + ", ".join(untrusted_labels)
            + "."
        )

    for report in district_resolution_reports or []:
        if report.get("trusted"):
            continue
        source = report.get("source") or "PDF source"
        details = "; ".join(report.get("issues") or [
            "page-level district resolution was not trusted"
        ])
        blockers.append(f"{source}: {details}")
    return blockers


def _format_number_list(values):
    return "[" + ", ".join(str(value) for value in values or []) + "]"


def _format_range_report(report):
    source = f"{report['source']}: " if report.get("source") else ""
    return (
        f"{source}Declared numbering span: "
        f"{report['district']} {report['start']}-{report['end']}\n"
        f"    Unique base numbers observed within span: "
        f"{report['captured_count']:,}\n"
        f"    Numbers not observed within span ({report['missing_count']:,}): "
        f"{_format_number_list(report.get('missing'))}\n"
        f"    Observed outside the declared span: "
        f"{_format_number_list(report.get('out_of_range'))}"
    )


# ── Filename builder ──────────────────────────────────────────────────────────

_FILENAME_FORBIDDEN = re.compile(r'[\\/:*?"<>|\r\n]+')


def _sanitise_component(value):
    if value is None:
        return ""
    cleaned = _FILENAME_FORBIDDEN.sub(" ", str(value))
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def build_filename(association, constituency, council_area, election, election_date, fallback_id):
    parts = [
        _sanitise_component(association),
        _sanitise_component(constituency),
        _sanitise_component(council_area),
        _sanitise_component(election),
        _sanitise_component(election_date),
    ]
    if all(parts):
        return " - ".join(parts) + " - Marked Register.xlsx"
    return f"{_sanitise_component(fallback_id) or 'batch'} - Marked Register.xlsx"


# ── Email (attachment with authenticated-portal fallback) ────────────────────

def prepare_completion_email(filename, csv_bytes, succeeded_count, failed_count,
                             failed_filenames, row_count, district_counts=None,
                             dedupe_removed=0, dedupe_pct=0.0,
                             synthetic_labels=None, warn_pct=2.0,
                             range_reports=None, range_issues=None,
                             cross_source_merged=0, csv_key=""):
    subject = os.path.splitext(filename)[0].rstrip()
    if not subject:
        subject = "Marked Register"

    district_counts = district_counts or {}
    synthetic_labels = synthetic_labels or set()
    range_reports = range_reports or []
    range_issues = range_issues or []

    body_lines = [
        f"Marked register processing complete.",
        "",
        f"File: {filename}",
        f"Elector records: {row_count:,}",
        f"Files processed: {succeeded_count} of {succeeded_count + failed_count}",
        _format_districts(district_counts),
    ]
    if cross_source_merged:
        body_lines.extend([
            f"Within-source duplicate rows removed: {dedupe_removed:,} "
            f"({dedupe_pct:.1f}% after cross-source matching)",
            f"Cross-source elector records merged: {cross_source_merged:,}",
        ])
    else:
        body_lines.append(
            f"Duplicate rows removed: {dedupe_removed:,} "
            f"({dedupe_pct:.1f}% of pre-dedupe rows)"
        )

    if range_reports or range_issues:
        body_lines.append("")
        body_lines.append("Declared-numbering review:")
        for report in range_reports:
            body_lines.append(f"  - {_format_range_report(report)}")
            if report.get("unparseable_count"):
                body_lines.append(
                    f"    Unparseable elector numbers ({report['unparseable_count']:,}): "
                    f"{_format_number_list(report.get('unparseable'))}"
                )
        for issue in range_issues:
            body_lines.append(f"  - RANGE NOT TRUSTED: {issue}")
        body_lines.append(
            "Numbering spans may contain legitimate gaps. This section is a "
            "review checklist, not an electorate count, extraction-accuracy "
            "score, or turnout calculation."
        )

    if _warnings_triggered(
        dedupe_pct, synthetic_labels, warn_pct, range_reports, range_issues
    ):
        body_lines.append("")
        body_lines.append("⚠ WARNING — please review before sending to the customer:")
        if dedupe_pct > warn_pct:
            body_lines.append(
                f"  - Deduplication removed {dedupe_pct:.1f}% of rows "
                f"(threshold {warn_pct:.0f}%). A high rate can indicate multiple "
                f"districts collapsing into one — check the district breakdown above."
            )
        if synthetic_labels:
            labels = ", ".join(sorted(synthetic_labels))
            body_lines.append(
                f"  - A second polling district was detected by an elector-number "
                f"reset but its code could not be read; it was labelled: {labels}. "
                f"Confirm the district code against the source PDF."
            )
        if _range_warnings_triggered(range_reports, range_issues):
            body_lines.append(
                "  - The declared-numbering review found numbers not observed, "
                "out-of-range numbers, unparseable numbers, or untrusted range "
                "data. Review the checklist above against the source PDF."
            )

    if failed_count > 0:
        body_lines.append("")
        body_lines.append(f"{failed_count} file(s) failed processing and were excluded:")
        for name in failed_filenames:
            body_lines.append(f"  - {name}")
        body_lines.append("")
        body_lines.append(
            "The attached workbook contains only successfully processed records."
        )

    def build_message(lines, include_attachment):
        message = MIMEMultipart()
        message["Subject"] = subject
        message["From"] = SES_SENDER_EMAIL
        message["To"] = SES_RECIPIENT_EMAIL
        message.attach(MIMEText("\n".join(lines), "plain", "utf-8"))
        if include_attachment:
            subtype = (
                "vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                if filename.lower().endswith(".xlsx")
                else "csv"
            )
            attachment = MIMEApplication(csv_bytes, _subtype=subtype)
            attachment.add_header(
                "Content-Disposition", "attachment", filename=filename
            )
            message.attach(attachment)
        return message

    attachment_message = build_message(body_lines, include_attachment=True)
    attachment_raw = attachment_message.as_bytes()
    if len(attachment_raw) <= SES_MAX_RAW_EMAIL_BYTES:
        return attachment_raw, "ATTACHMENT"

    link_body_lines = [
        line.replace(
            "The attached workbook contains only successfully processed records.",
            "The downloadable workbook contains only successfully processed records.",
        )
        for line in body_lines
    ]
    link_body_lines.extend([
        "",
        "The result is too large to send safely as an email attachment.",
    ])
    if csv_key:
        expiry_hours = DOWNLOAD_URL_TTL_SECONDS / 3600
        expiry_label = (
            f"{int(expiry_hours)} hour"
            f"{'' if expiry_hours == 1 else 's'}"
            if expiry_hours.is_integer()
            else f"{DOWNLOAD_URL_TTL_SECONDS // 60} minutes"
        )
        link_body_lines.extend([
            "Secure time-limited download:",
            generate_download_url(csv_key),
            "",
            f"This direct link expires within {expiry_label}.",
        ])
    link_body_lines.extend([
        "",
        "The uploader can also sign in and create a fresh, time-limited download "
        "from the Uploads page:",
        f"{PLATFORM_BASE_URL}/portal/uploads",
    ])
    link_message = build_message(link_body_lines, include_attachment=False)
    return link_message.as_bytes(), "DOWNLOAD_LINK"


def prepare_quality_review_email(filename, succeeded_count, failed_count,
                                 candidate_row_count, quality_blockers):
    """Build a notice-only email when automated quality gates withhold output."""
    subject_base = os.path.splitext(filename)[0].rstrip() or "Marked Register"
    message = MIMEMultipart()
    message["Subject"] = f"QUALITY REVIEW REQUIRED — {subject_base}"
    message["From"] = SES_SENDER_EMAIL
    message["To"] = SES_RECIPIENT_EMAIL
    body_lines = [
        "Marked register processing stopped at the quality gate.",
        "",
        f"Intended file: {filename}",
        f"Candidate rows assessed: {candidate_row_count:,}",
        f"Files processed: {succeeded_count} of "
        f"{succeeded_count + failed_count}",
        "",
        "No output file was released, attached, or made available for download.",
        "Reasons:",
    ]
    body_lines.extend(f"  - {reason}" for reason in quality_blockers)
    body_lines.extend([
        "",
        "Correct the extraction or source classification problem and rerun the "
        "original files. Candidate counts above are diagnostic only and must "
        "not be treated as an electorate or turnout result.",
    ])
    message.attach(MIMEText("\n".join(body_lines), "plain", "utf-8"))
    return message.as_bytes(), "NOTICE_ONLY"


def send_prepared_completion_email(raw_message):
    ses.send_raw_email(
        Source=SES_SENDER_EMAIL,
        Destinations=[SES_RECIPIENT_EMAIL],
        RawMessage={"Data": raw_message},
    )


def send_completion_email(*args, **kwargs):
    """Compatibility wrapper used by focused email tests."""
    raw_message, mode = prepare_completion_email(*args, **kwargs)
    send_prepared_completion_email(raw_message)
    return mode


def _completion_email_failure_code(exc):
    """Return a safe enum-like code without persisting the SES error message."""
    error_code = (
        getattr(exc, "response", {})
        .get("Error", {})
        .get("Code", "")
    )
    if error_code:
        normalised = re.sub(r"[^A-Za-z0-9]+", "_", error_code).strip("_")
        if normalised:
            return f"SES_{normalised.upper()}"[:80]
    return "EMAIL_SEND_FAILED"


# ════════════════════════════════════════════════════════════════════════════════
# Lambda handler
# ════════════════════════════════════════════════════════════════════════════════

def handler(event, context):
    batch_id = event.get("batchId")
    if not batch_id:
        logger.error("No batchId in event")
        return {"statusCode": 400, "error": "Missing batchId"}

    user_sub = event.get("userSub", "")
    association = event.get("association", "")
    constituency = event.get("constituency", "")
    council_area = event.get("councilArea", "")
    election = event.get("election", "")
    election_date = event.get("electionDate", "")

    logger.info("Combining batch %s (user=%s)", batch_id, user_sub or "?")

    jobs = get_all_batch_jobs(batch_id)
    if not jobs:
        logger.error("No jobs found for batch %s", batch_id)
        return {"statusCode": 404, "error": "No jobs found"}

    # Collect rows from succeeded jobs; track failures by filename.
    all_rows = []
    failed_filenames = []
    succeeded_count = 0
    synthetic_labels_all = set()
    range_reports_all = []
    range_issues_all = []
    district_resolution_reports = []
    inference_diagnostics_all = {
        "numeric_gap_rows_legacy_would_generate": 0,
        "explicit_strikethrough_rows_inferred": 0,
        "excluded_eligibility_rows_seen": 0,
        "excluded_eligibility_y_suppressed": 0,
        "removed_elector_rows_excluded": 0,
        "unreadable_strikethrough_rows_suppressed": 0,
        "out_of_sequence_rows_excluded": 0,
    }

    for job in jobs:
        job_id = job["jobId"]
        status = job.get("status", "")
        if status != "SUCCEEDED":
            failed_filenames.append(job.get("filename") or job_id)
            continue

        payloads = read_job_outputs(user_sub, batch_id, job_id)
        if not payloads:
            failed_filenames.append(job.get("filename") or job_id)
            continue

        # Merge this job's chunk rows and page->district maps.
        job_rows = []
        page_districts = {}
        page_declared_ranges = {}
        cover_declared_ranges = []
        job_source_types = set()
        for payload in payloads:
            payload_meta = payload.get("meta") or {}
            source_type = str(
                payload_meta.get("source_type") or "pdf"
            ).strip().lower()
            job_source_types.add(source_type)
            payload_rows = payload.get("rows", [])
            for row in payload_rows:
                row["_source_type"] = source_type
            job_rows.extend(payload_rows)
            for k, v in (payload.get("pageDistricts") or {}).items():
                page_districts[str(k)] = v
            for k, v in (payload.get("pageDeclaredRanges") or {}).items():
                page_declared_ranges[str(k)] = v
            meta_ranges = payload_meta.get("declared_ranges") or []
            if isinstance(meta_ranges, dict):
                meta_ranges = [meta_ranges]
            cover_declared_ranges.extend(meta_ranges)
            inference_diagnostics = payload_meta.get("inference_diagnostics") or {}
            for key in inference_diagnostics_all:
                inference_diagnostics_all[key] += int(
                    inference_diagnostics.get(key, 0)
                )

        source_name = job.get("filename") or job_id

        # Seed = page-1 metadata district from the lowest-numbered chunk. Every
        # chunk extracts it independently and deterministically, so assert they
        # agree and log a warning if not (§6.3).
        seeds = [
            (p.get("meta") or {}).get("polling_district")
            for p in payloads
        ]
        seeds = [s for s in seeds if s]
        seed_district = seeds[0] if seeds else ""
        if seeds and any(s != seed_district for s in seeds[1:]):
            logger.warning("Job %s: chunk seed districts disagree: %s", job_id, seeds)

        # Resolve districts BEFORE dedupe (running it after dedupe is useless —
        # the electors are already gone). Legacy jobs written before this deploy
        # have no 'page' field: bypass resolution entirely and leave
        # polling_district exactly as written, so combining an in-flight job after
        # the deploy cannot KeyError (§6.3).
        if job_source_types != {"csv"}:
            if any("page" in r for r in job_rows):
                synthetic_labels, resolution_report = (
                    _resolve_job_districts_with_report(
                        job_rows,
                        page_districts,
                        seed_district,
                    )
                )
                synthetic_labels_all |= synthetic_labels
            else:
                resolution_report = {
                    "trusted": False,
                    "row_page_count": 0,
                    "recognised_header_pages": 0,
                    "header_coverage_pct": 0.0,
                    "accepted_districts": [],
                    "unresolved_leading_pages": 0,
                    "rows_with_untrusted_district": 0,
                    "issues": [
                        "No page-level polling-district evidence was available."
                    ],
                }
            resolution_report["source"] = source_name
            district_resolution_reports.append(resolution_report)
            logger.info(
                "Job %s district resolution: trusted=%s, coverage=%.1f%%, "
                "accepted_districts=%d",
                job_id,
                resolution_report["trusted"],
                resolution_report["header_coverage_pct"],
                len(resolution_report["accepted_districts"]),
            )

        # Resolve and validate declared ranges after district assignment, but do
        # not mutate or filter job_rows. A deduped copy is used only for reporting
        # so diagnostics match the unique rows that can reach the final result.
        if job_source_types != {"csv"}:
            trusted_ranges, range_issues = resolve_declared_ranges(
                cover_declared_ranges, page_declared_ranges
            )
            validation_rows = _dedupe_rows(job_rows)
            range_reports, validation_issues = validate_rows_against_declared_ranges(
                validation_rows, trusted_ranges
            )
            for report in range_reports:
                report["source"] = source_name
                range_reports_all.append(report)
                logger.info(
                    "Job %s declared numbering span %s %d-%d: "
                    "observed_within_span=%d, not_observed_count=%d, "
                    "out_of_range_count=%d",
                    job_id, report["district"], report["start"], report["end"],
                    report["captured_count"], report["missing_count"],
                    report["out_of_range_count"],
                )
            for issue in range_issues + validation_issues:
                rendered_issue = f"{source_name}: {issue}"
                range_issues_all.append(rendered_issue)
                logger.warning(
                    "Job %s declared-range validation issue recorded", job_id
                )

        # Overwrite per-row constituency / election_date with the form-provided
        # values so the columns match the filename even for legacy in-flight rows.
        if constituency:
            for row in job_rows:
                row["constituency"] = constituency
        if election_date:
            for row in job_rows:
                row["election_date"] = election_date

        all_rows.extend(job_rows)
        succeeded_count += 1

    logger.info(
        "Batch %s: %d rows from %d jobs (%d failed)",
        batch_id, len(all_rows), succeeded_count, len(failed_filenames),
    )
    logger.info(
        "Batch %s OCR inference diagnostics: "
        "numeric_gap_rows_legacy_would_generate=%d, "
        "explicit_strikethrough_rows_inferred=%d, "
        "excluded_eligibility_rows_seen=%d, "
        "excluded_eligibility_y_suppressed=%d, "
        "removed_elector_rows_excluded=%d, "
        "unreadable_strikethrough_rows_suppressed=%d, "
        "out_of_sequence_rows_excluded=%d",
        batch_id,
        inference_diagnostics_all["numeric_gap_rows_legacy_would_generate"],
        inference_diagnostics_all["explicit_strikethrough_rows_inferred"],
        inference_diagnostics_all["excluded_eligibility_rows_seen"],
        inference_diagnostics_all["excluded_eligibility_y_suppressed"],
        inference_diagnostics_all["removed_elector_rows_excluded"],
        inference_diagnostics_all["unreadable_strikethrough_rows_suppressed"],
        inference_diagnostics_all["out_of_sequence_rows_excluded"],
    )

    pre_dedupe_count = len(all_rows)
    dedupe_source_counts = _dedupe_source_counts(all_rows)
    all_rows = _dedupe_rows(all_rows)
    dedupe_removed = pre_dedupe_count - len(all_rows)
    within_source_removed = dedupe_source_counts["within_source"]
    cross_source_merged = dedupe_source_counts["cross_source"]
    warning_base = pre_dedupe_count - cross_source_merged
    dedupe_pct = (
        within_source_removed / warning_base * 100.0
        if warning_base > 0 else 0.0
    )
    all_rows.sort(key=_sort_key)

    district_counts = _count_districts(all_rows)
    warn_pct = float(os.environ.get("DEDUPE_WARN_PCT", "2"))
    warnings_on = _warnings_triggered(
        dedupe_pct, synthetic_labels_all, warn_pct,
        range_reports_all, range_issues_all,
    )
    quality_blockers = _quality_blockers(
        dedupe_pct,
        warn_pct,
        district_counts,
        district_resolution_reports,
    )

    logger.info(
        "Batch %s: %d districts, %d within-source duplicates removed "
        "(%.1f%%), %d cross-source records merged, synthetic=%s",
        batch_id, len(district_counts), within_source_removed, dedupe_pct,
        cross_source_merged, sorted(synthetic_labels_all),
    )

    filename = build_filename(
        association, constituency, council_area, election, election_date,
        fallback_id=batch_id,
    )
    if quality_blockers:
        csv_bytes = b""
        csv_key = ""
        batch_status = "QUALITY_REVIEW_REQUIRED"
        raw_email, email_mode = prepare_quality_review_email(
            filename=filename,
            succeeded_count=succeeded_count,
            failed_count=len(failed_filenames),
            candidate_row_count=len(all_rows),
            quality_blockers=quality_blockers,
        )
        logger.warning(
            "Batch %s output withheld by %d quality blocker(s)",
            batch_id,
            len(quality_blockers),
        )
    else:
        csv_bytes = build_xlsx(all_rows)
        csv_key = upload_csv(user_sub, batch_id, filename, csv_bytes)
        logger.info(
            "Uploaded workbook: s3://%s/%s (%d rows)",
            UPLOADS_BUCKET,
            csv_key,
            len(all_rows),
        )

        if failed_filenames:
            batch_status = "COMPLETE_WITH_FAILURES"
        elif warnings_on:
            batch_status = "COMPLETE_WITH_WARNINGS"
        else:
            batch_status = "COMPLETE"

        raw_email, email_mode = prepare_completion_email(
            filename=filename,
            csv_bytes=csv_bytes,
            succeeded_count=succeeded_count,
            failed_count=len(failed_filenames),
            failed_filenames=failed_filenames,
            row_count=len(all_rows),
            district_counts=district_counts,
            dedupe_removed=within_source_removed,
            dedupe_pct=dedupe_pct,
            synthetic_labels=synthetic_labels_all,
            warn_pct=warn_pct,
            range_reports=range_reports_all,
            range_issues=range_issues_all,
            cross_source_merged=cross_source_merged,
            csv_key=csv_key,
        )

    completed_at = datetime.now(timezone.utc).isoformat()
    completion = {
        "batch_status": batch_status,
        "completed_at": completed_at,
        "succeeded_count": succeeded_count,
        "failed_count": len(failed_filenames),
        "row_count": len(all_rows),
        "output_key": csv_key,
        "output_filename": filename,
        "output_bytes": len(csv_bytes),
        "email_mode": email_mode,
    }
    prior_sent_job = next(
        (
            job for job in jobs
            if job.get("completionEmailStatus") == "SENT"
            and job.get("batchOutputKey") == csv_key
            and (
                not job.get("batchStatus")
                or job.get("batchStatus") == batch_status
            )
        ),
        None,
    )
    if prior_sent_job:
        # A previous invocation reached SES and persisted its acceptance marker
        # but was retried while copying metadata to the remaining jobs.
        email_mode = prior_sent_job.get("completionEmailMode") or email_mode
        completion["email_mode"] = email_mode
        email_sent_at = (
            prior_sent_job.get("completionEmailUpdatedAt") or completed_at
        )
        logger.info(
            "Batch %s email was already accepted; skipping duplicate send",
            batch_id,
        )
    else:
        update_batch_jobs(
            jobs,
            **completion,
            email_status="PENDING",
            email_updated_at=completed_at,
        )

        try:
            send_prepared_completion_email(raw_email)
            logger.info(
                "Email sent to %s for batch %s", SES_RECIPIENT_EMAIL, batch_id
            )
        except Exception as exc:
            try:
                update_batch_jobs(
                    jobs,
                    **completion,
                    email_status="FAILED",
                    email_updated_at=datetime.now(timezone.utc).isoformat(),
                    email_failure_code=_completion_email_failure_code(exc),
                )
            except Exception:
                logger.exception(
                    "Failed to persist email failure state for batch %s",
                    batch_id,
                )
            logger.exception(
                "Completion email failed for batch %s (mode=%s, code=%s)",
                batch_id,
                email_mode,
                _completion_email_failure_code(exc),
            )
            raise

        email_sent_at = datetime.now(timezone.utc).isoformat()
        # Persist one deterministic acceptance marker before the fan-out update.
        # If a later job update fails, an async retry can safely skip SES.
        delivery_marker = min(jobs, key=lambda job: job["jobId"])
        update_job_batch_completion(
            delivery_marker["jobId"],
            **completion,
            email_status="SENT",
            email_updated_at=email_sent_at,
        )

    update_batch_jobs(
        jobs,
        **completion,
        email_status="SENT",
        email_updated_at=email_sent_at,
    )

    logger.info(
        "Batch %s done — status=%s, email=%s/%s, rows=%d",
        batch_id, batch_status, "SENT", email_mode, len(all_rows),
    )
    return {
        "statusCode": 200,
        "batchId": batch_id,
        "batchStatus": batch_status,
        "completionEmailStatus": "SENT",
        "completionEmailMode": email_mode,
        "rowCount": len(all_rows),
        "csvKey": csv_key,
        "filename": filename,
        "districts": len(district_counts),
        "dedupeRemoved": dedupe_removed,
        "withinSourceDuplicatesRemoved": within_source_removed,
        "crossSourceMerged": cross_source_merged,
        "declaredRangeWarnings": _range_warnings_triggered(
            range_reports_all, range_issues_all
        ),
        "qualityBlockerCount": len(quality_blockers),
    }
