"""
CombineRegisterFunction — Marked Register Batch Combiner Lambda

Invoked asynchronously by ProcessRegisterFunction once all jobs in a batch
are complete. Reads per-job JSON outputs from S3, merges and sorts elector
rows, builds a CSV, uploads it, generates a pre-signed download URL, sends
an SES email, and marks all jobs with the final batchStatus.
"""

import csv
import io
import json
import logging
import os
import re
from datetime import datetime, timezone

import boto3
import requests
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

JOBS_TABLE = os.environ.get("JOBS_TABLE", "")
ELECTIONS_TABLE = os.environ.get("ELECTIONS_TABLE", "")
UPLOADS_BUCKET = os.environ.get("UPLOADS_BUCKET", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
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
    # Exclude the internal tracker item
    return [j for j in items if not j.get("jobId", "").startswith("BATCH_TRACKER#")]


def get_election(election_id):
    if not election_id:
        return None
    table = dynamo.Table(ELECTIONS_TABLE)
    resp = table.get_item(Key={"electionId": election_id})
    return resp.get("Item")


def update_job_batch_status(job_id, batch_status, updated_at):
    table = dynamo.Table(JOBS_TABLE)
    table.update_item(
        Key={"jobId": job_id},
        UpdateExpression="SET batchStatus = :s, updatedAt = :u",
        ExpressionAttributeValues={":s": batch_status, ":u": updated_at},
    )


# ── External lookups ──────────────────────────────────────────────────────────

def get_constituency_name(ons_code):
    if not ons_code or not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        return ons_code or "Unknown Constituency"
    url = f"{SUPABASE_URL}/rest/v1/constituencies"
    params = {"ons_code": f"eq.{ons_code}", "select": "name", "limit": "1"}
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data:
            return data[0]["name"]
    except Exception as exc:
        logger.warning("Supabase lookup failed for %s: %s", ons_code, exc)
    return ons_code


# ── S3 helpers ────────────────────────────────────────────────────────────────

def read_job_output(batch_id, job_id):
    key = f"outputs/{batch_id}/{job_id}.json"
    try:
        obj = s3.get_object(Bucket=UPLOADS_BUCKET, Key=key)
        return json.loads(obj["Body"].read())
    except Exception as exc:
        logger.warning("Failed to read output %s: %s", key, exc)
        return None


def upload_csv(batch_id, filename, csv_content):
    key = f"outputs/{batch_id}/{filename}"
    s3.put_object(
        Bucket=UPLOADS_BUCKET,
        Key=key,
        Body=csv_content.encode("utf-8-sig"),  # BOM for Excel compatibility
        ContentType="text/csv",
        ContentDisposition=f'attachment; filename="{filename}"',
    )
    return key


def generate_presigned_url(key, expires_in=86400):
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": UPLOADS_BUCKET, "Key": key},
        ExpiresIn=expires_in,
    )


# ── CSV builder ───────────────────────────────────────────────────────────────

def _sort_key(row):
    pd = row.get("polling_district", "")
    en = row.get("elector_number", "")
    try:
        en_int = int(re.sub(r"\D", "", en) or "0")
    except (ValueError, TypeError):
        en_int = 0
    return (pd, en_int, en)


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


# ── Email ─────────────────────────────────────────────────────────────────────

def send_completion_email(constituency, election, date, row_count, file_count, failed_count, download_url, filename):
    subject = f"Marked Register Ready: {constituency} — {election} ({date})"
    warning = (
        f'<p style="color:#b45309;">&#9888; {failed_count} file(s) failed OCR processing and are excluded.</p>'
        if failed_count > 0 else ""
    )
    body_html = f"""<html><body style="font-family:sans-serif;color:#1f2937">
<h2 style="color:#1d4ed8">Marked Register Processed</h2>
<table cellpadding="4" style="border-collapse:collapse">
  <tr><td><strong>Constituency</strong></td><td>{constituency}</td></tr>
  <tr><td><strong>Election</strong></td><td>{election}</td></tr>
  <tr><td><strong>Election Date</strong></td><td>{date}</td></tr>
  <tr><td><strong>Elector Records</strong></td><td>{row_count:,}</td></tr>
  <tr><td><strong>Files Processed</strong></td><td>{file_count - failed_count} of {file_count}</td></tr>
</table>
{warning}
<p style="margin-top:20px">
  <a href="{download_url}" style="background:#1d4ed8;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px">
    Download CSV — {filename}
  </a>
</p>
<p style="color:#6b7280;font-size:12px">This download link expires in 24 hours.</p>
</body></html>"""

    ses.send_email(
        Source=SES_SENDER_EMAIL,
        Destination={"ToAddresses": [SES_RECIPIENT_EMAIL]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Html": {"Data": body_html, "Charset": "UTF-8"}},
        },
    )


# ── Filename sanitiser ────────────────────────────────────────────────────────

def _safe(s):
    return re.sub(r'[<>:"/\\|?*]', "-", s or "").strip()


# ════════════════════════════════════════════════════════════════════════════════
# Lambda handler
# ════════════════════════════════════════════════════════════════════════════════

def handler(event, context):
    batch_id = event.get("batchId")
    constituency_ons_code = event.get("constituencyOnsCode", "")
    election_id = event.get("electionId", "")

    if not batch_id:
        logger.error("No batchId in event")
        return {"statusCode": 400, "error": "Missing batchId"}

    logger.info("Combining batch %s (constituency=%s, election=%s)", batch_id, constituency_ons_code, election_id)

    # ── Fetch all jobs in the batch ───────────────────────────────────────────
    jobs = get_all_batch_jobs(batch_id)
    if not jobs:
        logger.error("No jobs found for batch %s", batch_id)
        return {"statusCode": 404, "error": "No jobs found"}

    # ── Collect rows from succeeded jobs ──────────────────────────────────────
    all_rows = []
    failed_count = 0
    for job in jobs:
        job_id = job["jobId"]
        status = job.get("status", "")
        if status == "SUCCEEDED":
            output = read_job_output(batch_id, job_id)
            if output:
                all_rows.extend(output.get("rows", []))
            else:
                logger.warning("Output missing for succeeded job %s — treating as failed", job_id)
                failed_count += 1
        else:
            logger.info("Job %s has status %s — excluded from CSV", job_id, status)
            failed_count += 1

    logger.info("Batch %s: %d rows from %d jobs (%d failed)", batch_id, len(all_rows), len(jobs), failed_count)

    # ── Sort rows ─────────────────────────────────────────────────────────────
    all_rows.sort(key=_sort_key)

    # ── Resolve display names ─────────────────────────────────────────────────
    constituency_name = get_constituency_name(constituency_ons_code)

    election_name = election_id
    election_date = ""
    if election_id:
        election = get_election(election_id)
        if election:
            election_name = election.get("name", election_id)
            election_date = election.get("date", "")

    # Overwrite constituency/election fields in rows with resolved names so CSV is clean
    for row in all_rows:
        row["constituency"] = constituency_name
        if election_name and election_name != election_id:
            # Only override if we have a real name (not the ID placeholder)
            pass  # rows already have election name from OCR; leave as-is for now

    # ── Build and upload CSV ──────────────────────────────────────────────────
    filename = f"{_safe(constituency_name)} - {_safe(election_name)} - {_safe(election_date)} - Marked Register.csv"
    csv_content = build_csv(all_rows)
    csv_key = upload_csv(batch_id, filename, csv_content)
    logger.info("Uploaded CSV: s3://%s/%s (%d rows)", UPLOADS_BUCKET, csv_key, len(all_rows))

    # ── Pre-signed URL (24 h) ─────────────────────────────────────────────────
    download_url = generate_presigned_url(csv_key)

    # ── Send SES email ────────────────────────────────────────────────────────
    try:
        send_completion_email(
            constituency=constituency_name,
            election=election_name,
            date=election_date,
            row_count=len(all_rows),
            file_count=len(jobs),
            failed_count=failed_count,
            download_url=download_url,
            filename=filename,
        )
        logger.info("Email sent to %s for batch %s", SES_RECIPIENT_EMAIL, batch_id)
    except Exception as exc:
        logger.error("Failed to send email for batch %s: %s", batch_id, exc)

    # ── Update all jobs with final batchStatus ────────────────────────────────
    batch_status = "COMPLETE_WITH_FAILURES" if failed_count > 0 else "COMPLETE"
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
    }
