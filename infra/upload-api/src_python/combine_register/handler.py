"""
CombineRegisterFunction — Marked Register Batch Combiner Lambda

Invoked asynchronously by ProcessRegisterFunction once all jobs in a batch
are complete. Reads per-job JSON outputs from S3 (one per chunk since the
chunked-OCR change), resolves each job's polling districts across the full
page sequence, merges and sorts elector rows, builds a CSV, uploads it, and
emails the CSV as an attachment.

The filename is built from five form-provided free-text fields:
    {association} - {constituency} - {councilArea} - {election} - {electionDate} - Marked Register.csv
For legacy in-flight jobs missing those fields, the filename falls back to:
    {batchId or jobId} - Marked Register.csv
"""

import csv
import io
import json
import logging
import os
import re
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
REGION = os.environ.get("AWS_REGION", "eu-west-2")

dynamo = boto3.resource("dynamodb", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
ses = boto3.client("ses", region_name=REGION)

CSV_COLUMNS = ["Election Date", "Constituency", "Polling District", "Elector Number", "Voted", "Postal Vote"]


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


def update_job_batch_status(job_id, batch_status, updated_at):
    table = dynamo.Table(JOBS_TABLE)
    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression="SET batchStatus = :s, updatedAt = :u",
        ExpressionAttributeValues={":s": batch_status, ":u": updated_at},
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


def upload_csv(user_sub, batch_id, filename, csv_content):
    prefix = f"outputs/{user_sub}/{batch_id}" if user_sub else f"outputs/{batch_id}"
    key = f"{prefix}/{filename}"
    s3.put_object(
        Bucket=UPLOADS_BUCKET,
        Key=key,
        Body=csv_content.encode("utf-8-sig"),
        ContentType="text/csv",
        ContentDisposition=f'attachment; filename="{filename}"',
    )
    return key


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


def resolve_job_districts(rows, page_districts, seed_district):
    """Assign a polling_district to every row of one job from the per-page header
    map. Mutates rows in place.

    Returns the set of synthetic ('{seed}-N') labels assigned. Boundaries are now
    accepted only on corroborated printed header codes (see below), which never
    produce a synthetic label, so this is always an empty set. The return value is
    kept so the caller's warning/`COMPLETE_WITH_WARNINGS` plumbing is undisturbed
    and available for any future non-header boundary signal.

    Seeded with the current (page-1 metadata) district, so a document that yields
    no per-page header signal anywhere receives exactly today's assignment: every
    row gets the seed. The logic can only refine, never regress (invariants 1/7).

    A boundary is accepted only on **header corroboration**: a printed district
    code different from the running district appearing in the headers of two
    consecutive pages. A printed code is hard evidence; requiring it on two
    consecutive pages suppresses one-off OCR noise.

    The former elector-number-reset trigger ("Layer 3b") was removed (Defect A).
    It fired on OCR artefacts — house numbers misread as low elector numbers, and
    legitimately out-of-sequence late-registration electors — and split clean
    single-district registers into spurious synthetic districts, inflating the
    row count. A numeric dip is no longer treated as a boundary.

    Trade-off, deliberately accepted: a genuine second district whose printed
    header cannot be OCR'd on two consecutive pages is no longer detected here.
    That case now surfaces as a high deduplication rate in the completion email
    (the COMPLETE_WITH_WARNINGS path) — the intended safety net until the
    declared-range validation (§5) lands — rather than as a synthetic label."""
    if not rows:
        return set()

    # Normalise the header map to int page keys (JSON object keys arrive as str).
    headers = {}
    for k, v in (page_districts or {}).items():
        try:
            headers[int(k)] = v
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

    current_district = seed_district

    for page in sorted(rows_by_page):
        header = headers.get(page)
        next_header = headers.get(page + 1)
        # Header corroboration is the only accepted boundary: a printed code
        # different from the running district on two consecutive pages. Elector
        # numbers are intentionally not consulted — a numeric reset is no longer a
        # boundary signal (Defect A). A blank/None header simply inherits the
        # running district, which is how continuation pages actually behave.
        if header and header != current_district and next_header == header:
            current_district = header
        for r in rows_by_page[page]:
            r["polling_district"] = current_district

    return set()


# ── CSV builder ───────────────────────────────────────────────────────────────

def _sort_key(row):
    pd = row.get("polling_district", "")
    en = row.get("elector_number", "")
    try:
        en_int = int(re.sub(r"\D", "", en) or "0")
    except (ValueError, TypeError):
        en_int = 0
    return (pd, en_int, en)


def _dedupe_rows(rows):
    """Dedupe on (polling_district, elector_number). Elector numbers reset per
    polling district, so we can't dedupe on elector_number alone without
    collapsing distinct electors across districts."""
    seen = set()
    out = []
    for row in rows:
        key = (row.get("polling_district", ""), row.get("elector_number", ""))
        if key in seen or not key[1]:
            continue
        seen.add(key)
        out.append(row)
    return out


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


def _format_number_list(values):
    return "[" + ", ".join(str(value) for value in values or []) + "]"


def _format_range_report(report):
    source = f"{report['source']}: " if report.get("source") else ""
    return (
        f"{source}{report['district']} {report['start']}-{report['end']}: "
        f"captured {report['captured_count']:,} of {report['declared_count']:,} "
        f"({report['captured_pct']:.1f}%); {report['missing_count']:,} missing: "
        f"{_format_number_list(report.get('missing'))}"
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
        return " - ".join(parts) + " - Marked Register.csv"
    return f"{_sanitise_component(fallback_id) or 'batch'} - Marked Register.csv"


# ── Email (raw with attachment) ───────────────────────────────────────────────

def send_completion_email(filename, csv_bytes, succeeded_count, failed_count,
                          failed_filenames, row_count, district_counts=None,
                          dedupe_removed=0, dedupe_pct=0.0, synthetic_labels=None,
                          warn_pct=2.0, range_reports=None, range_issues=None):
    subject = filename.rstrip(".csv").rstrip()
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
        f"Duplicate rows removed: {dedupe_removed:,} ({dedupe_pct:.1f}% of pre-dedupe rows)",
    ]

    if range_reports or range_issues:
        body_lines.append("")
        body_lines.append("Declared-range validation:")
        for report in range_reports:
            body_lines.append(f"  - {_format_range_report(report)}")
            if report.get("out_of_range_count"):
                body_lines.append(
                    f"    OUT OF RANGE ({report['out_of_range_count']:,}): "
                    f"{_format_number_list(report.get('out_of_range'))}"
                )
            if report.get("unparseable_count"):
                body_lines.append(
                    f"    Unparseable elector numbers ({report['unparseable_count']:,}): "
                    f"{_format_number_list(report.get('unparseable'))}"
                )
        for issue in range_issues:
            body_lines.append(f"  - RANGE NOT TRUSTED: {issue}")

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
                "  - Declared-range validation found missing, out-of-range, "
                "unparseable, or untrusted range data. Review the detailed "
                "declared-range section above against the source PDF."
            )

    if failed_count > 0:
        body_lines.append("")
        body_lines.append(f"{failed_count} file(s) failed OCR and were excluded:")
        for name in failed_filenames:
            body_lines.append(f"  - {name}")
        body_lines.append("")
        body_lines.append("The attached CSV contains only successfully processed records.")

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = SES_SENDER_EMAIL
    msg["To"] = SES_RECIPIENT_EMAIL
    msg.attach(MIMEText("\n".join(body_lines), "plain", "utf-8"))

    attachment = MIMEApplication(csv_bytes, _subtype="csv")
    attachment.add_header("Content-Disposition", "attachment", filename=filename)
    msg.attach(attachment)

    ses.send_raw_email(
        Source=SES_SENDER_EMAIL,
        Destinations=[SES_RECIPIENT_EMAIL],
        RawMessage={"Data": msg.as_bytes()},
    )


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
        for payload in payloads:
            job_rows.extend(payload.get("rows", []))
            for k, v in (payload.get("pageDistricts") or {}).items():
                page_districts[str(k)] = v
            for k, v in (payload.get("pageDeclaredRanges") or {}).items():
                page_declared_ranges[str(k)] = v
            meta_ranges = (payload.get("meta") or {}).get("declared_ranges") or []
            if isinstance(meta_ranges, dict):
                meta_ranges = [meta_ranges]
            cover_declared_ranges.extend(meta_ranges)

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
        if any("page" in r for r in job_rows):
            synthetic_labels_all |= resolve_job_districts(job_rows, page_districts, seed_district)

        # Resolve and validate declared ranges after district assignment, but do
        # not mutate or filter job_rows. A deduped copy is used only for reporting
        # so diagnostics match the unique rows that can reach the final CSV.
        trusted_ranges, range_issues = resolve_declared_ranges(
            cover_declared_ranges, page_declared_ranges
        )
        validation_rows = _dedupe_rows(job_rows)
        range_reports, validation_issues = validate_rows_against_declared_ranges(
            validation_rows, trusted_ranges
        )
        source_name = job.get("filename") or job_id
        for report in range_reports:
            report["source"] = source_name
            range_reports_all.append(report)
            logger.info(
                "Job %s declared range %s %d-%d: captured=%d/%d (%.1f%%), "
                "missing=%s, out_of_range=%s",
                job_id, report["district"], report["start"], report["end"],
                report["captured_count"], report["declared_count"],
                report["captured_pct"], report["missing"], report["out_of_range"],
            )
        for issue in range_issues + validation_issues:
            rendered_issue = f"{source_name}: {issue}"
            range_issues_all.append(rendered_issue)
            logger.warning("Job %s declared-range validation: %s", job_id, issue)

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

    pre_dedupe_count = len(all_rows)
    all_rows = _dedupe_rows(all_rows)
    dedupe_removed = pre_dedupe_count - len(all_rows)
    dedupe_pct = (dedupe_removed / pre_dedupe_count * 100.0) if pre_dedupe_count else 0.0
    all_rows.sort(key=_sort_key)

    district_counts = _count_districts(all_rows)
    warn_pct = float(os.environ.get("DEDUPE_WARN_PCT", "2"))
    warnings_on = _warnings_triggered(
        dedupe_pct, synthetic_labels_all, warn_pct,
        range_reports_all, range_issues_all,
    )

    logger.info(
        "Batch %s: %d districts, %d rows removed by dedupe (%.1f%%), synthetic=%s",
        batch_id, len(district_counts), dedupe_removed, dedupe_pct,
        sorted(synthetic_labels_all),
    )

    filename = build_filename(
        association, constituency, council_area, election, election_date,
        fallback_id=batch_id,
    )
    csv_content = build_csv(all_rows)
    csv_bytes = csv_content.encode("utf-8-sig")
    csv_key = upload_csv(user_sub, batch_id, filename, csv_content)
    logger.info("Uploaded CSV: s3://%s/%s (%d rows)", UPLOADS_BUCKET, csv_key, len(all_rows))

    try:
        send_completion_email(
            filename=filename,
            csv_bytes=csv_bytes,
            succeeded_count=succeeded_count,
            failed_count=len(failed_filenames),
            failed_filenames=failed_filenames,
            row_count=len(all_rows),
            district_counts=district_counts,
            dedupe_removed=dedupe_removed,
            dedupe_pct=dedupe_pct,
            synthetic_labels=synthetic_labels_all,
            warn_pct=warn_pct,
            range_reports=range_reports_all,
            range_issues=range_issues_all,
        )
        logger.info("Email sent to %s for batch %s", SES_RECIPIENT_EMAIL, batch_id)
    except Exception as exc:
        logger.error("Failed to send email for batch %s: %s", batch_id, exc)

    if failed_filenames:
        batch_status = "COMPLETE_WITH_FAILURES"
    elif warnings_on:
        batch_status = "COMPLETE_WITH_WARNINGS"
    else:
        batch_status = "COMPLETE"

    now_iso = datetime.now(timezone.utc).isoformat()
    for job in jobs:
        try:
            update_job_batch_status(job["jobId"], batch_status, now_iso)
        except Exception as exc:
            logger.warning("Failed to update batchStatus for job %s: %s", job["jobId"], exc)

    logger.info("Batch %s done — status=%s, rows=%d", batch_id, batch_status, len(all_rows))
    return {
        "statusCode": 200,
        "batchId": batch_id,
        "batchStatus": batch_status,
        "rowCount": len(all_rows),
        "csvKey": csv_key,
        "filename": filename,
        "districts": len(district_counts),
        "dedupeRemoved": dedupe_removed,
        "declaredRangeWarnings": _range_warnings_triggered(
            range_reports_all, range_issues_all
        ),
    }
