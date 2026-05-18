"""
CombineRegisterFunction — Marked Register Batch Combiner Lambda

Invoked asynchronously by ProcessRegisterFunction once all jobs in a batch
are complete. Reads per-job JSON outputs from S3, merges and sorts elector
rows, builds a CSV, uploads it, and emails the CSV as an attachment.

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
    return [j for j in items if not j.get("jobId", "").startswith("BATCH_TRACKER#")]


def update_job_batch_status(job_id, batch_status, updated_at):
    table = dynamo.Table(JOBS_TABLE)
    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression="SET batchStatus = :s, updatedAt = :u",
        ExpressionAttributeValues={":s": batch_status, ":u": updated_at},
    )


# ── S3 helpers ────────────────────────────────────────────────────────────────

def read_job_output(user_sub, batch_id, job_id):
    """Read per-job JSON output. Try the new userSub-scoped path first, then
    fall back to the legacy {batchId}/{jobId}.json layout for in-flight jobs."""
    candidates = []
    if user_sub:
        candidates.append(f"outputs/{user_sub}/{batch_id}/{job_id}.json")
    candidates.append(f"outputs/{batch_id}/{job_id}.json")
    for key in candidates:
        try:
            obj = s3.get_object(Bucket=UPLOADS_BUCKET, Key=key)
            return json.loads(obj["Body"].read())
        except s3.exceptions.NoSuchKey:
            continue
        except Exception as exc:
            logger.warning("Failed to read output %s: %s", key, exc)
            continue
    logger.warning("No output JSON found for job %s in batch %s", job_id, batch_id)
    return None


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
                          failed_filenames, row_count):
    subject = filename.rstrip(".csv").rstrip()
    if not subject:
        subject = "Marked Register"

    body_lines = [
        f"Marked register processing complete.",
        "",
        f"File: {filename}",
        f"Elector records: {row_count:,}",
        f"Files processed: {succeeded_count} of {succeeded_count + failed_count}",
    ]
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

    # Collect rows from succeeded jobs; track failures by filename
    all_rows = []
    failed_filenames = []
    succeeded_count = 0
    for job in jobs:
        job_id = job["jobId"]
        status = job.get("status", "")
        if status == "SUCCEEDED":
            output = read_job_output(user_sub, batch_id, job_id)
            if output:
                rows = output.get("rows", [])
                # Overwrite per-row constituency with the form-provided value so
                # the column matches the filename even for legacy in-flight rows.
                if constituency:
                    for row in rows:
                        row["constituency"] = constituency
                if election_date:
                    for row in rows:
                        row["election_date"] = election_date
                all_rows.extend(rows)
                succeeded_count += 1
            else:
                failed_filenames.append(job.get("filename") or job_id)
        else:
            failed_filenames.append(job.get("filename") or job_id)

    logger.info(
        "Batch %s: %d rows from %d jobs (%d failed)",
        batch_id, len(all_rows), succeeded_count, len(failed_filenames),
    )

    all_rows = _dedupe_rows(all_rows)
    all_rows.sort(key=_sort_key)

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
        )
        logger.info("Email sent to %s for batch %s", SES_RECIPIENT_EMAIL, batch_id)
    except Exception as exc:
        logger.error("Failed to send email for batch %s: %s", batch_id, exc)

    batch_status = "COMPLETE_WITH_FAILURES" if failed_filenames else "COMPLETE"
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
    }
