#!/usr/bin/env python3
"""
Political Portal — Local Job Listener
Polls the SQS job queue, processes PDFs with marked_register_processor.py,
uploads results to S3, updates DynamoDB, and emails Paul with the output CSV.
"""

import configparser
import email.mime.application
import email.mime.multipart
import email.mime.text
import json
import logging
import os
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

# ── Configuration ─────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.ini"

config = configparser.ConfigParser()
if not config.read(CONFIG_PATH):
    print(f"ERROR: config.ini not found at {CONFIG_PATH}", file=sys.stderr)
    sys.exit(1)

AWS_REGION = config["aws"].get("region", "eu-west-2")
ACCESS_KEY = config["aws"].get("access_key_id", "").strip()
SECRET_KEY = config["aws"].get("secret_access_key", "").strip()

print(f"[DEBUG] config.ini loaded from: {CONFIG_PATH}")
print(f"[DEBUG] AWS access_key_id starts with: {ACCESS_KEY[:4] if ACCESS_KEY else '(empty)'}")

JOB_QUEUE_URL = config["queues"]["job_queue_url"].strip()
BUCKET_NAME = config["s3"]["bucket_name"].strip()
JOBS_TABLE = config["dynamodb"]["jobs_table"].strip()

RECIPIENT = config["email"]["recipient"].strip()
SENDER = config["email"]["sender"].strip()

TEMP_FOLDER = BASE_DIR / config["processing"].get("temp_folder", "temp")
OUTPUT_FOLDER = BASE_DIR / config["processing"].get("output_folder", "output")
MAX_PROCESSING_HOURS = int(config["processing"].get("max_processing_hours", "48"))
POLL_INTERVAL = int(config["processing"].get("poll_interval_seconds", "30"))
PROGRESS_UPDATE_HOURS = int(config["processing"].get("progress_update_hours", "2"))
PROCESSOR_COMMAND = config["processing"].get(
    "processor_command",
    'python marked_register_processor.py "{input_pdf}" "{output_dir}"',
)
PROJECT_ROOT = BASE_DIR.parent.parent  # scripts/listener/ → project root
LONG_POLL_SECONDS = min(POLL_INTERVAL, 20)
POLL_SLEEP_SECONDS = max(POLL_INTERVAL - LONG_POLL_SECONDS, 0)

# ── Directories ───────────────────────────────────────────────────────────────

LOGS_DIR = BASE_DIR / "logs"
for d in (LOGS_DIR, TEMP_FOLDER, OUTPUT_FOLDER):
    d.mkdir(parents=True, exist_ok=True)

# ── Logging ───────────────────────────────────────────────────────────────────

log_path = LOGS_DIR / "listener.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    handlers=[
        logging.FileHandler(log_path, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger(__name__)

# ── AWS clients ───────────────────────────────────────────────────────────────

def _boto_kwargs():
    kwargs = {"region_name": AWS_REGION}
    if ACCESS_KEY and SECRET_KEY:
        kwargs["aws_access_key_id"] = ACCESS_KEY
        kwargs["aws_secret_access_key"] = SECRET_KEY
    return kwargs


sqs = boto3.client("sqs", **_boto_kwargs())
s3 = boto3.client("s3", **_boto_kwargs())
dynamo = boto3.resource("dynamodb", **_boto_kwargs())
ses = boto3.client("ses", **_boto_kwargs())

jobs_table = dynamo.Table(JOBS_TABLE)


def get_queue_depth():
    try:
        resp = sqs.get_queue_attributes(
            QueueUrl=JOB_QUEUE_URL,
            AttributeNames=["ApproximateNumberOfMessages"],
        )
        return int(resp.get("Attributes", {}).get("ApproximateNumberOfMessages", "0"))
    except Exception as exc:
        log.warning("Could not read queue depth: %s", exc)
        return None


class ListenerStats:
    def __init__(self):
        self._lock = threading.Lock()
        self.completed_jobs = 0
        self.failed_jobs = 0
        self.current_job_id = ""
        self.current_filename = ""

    def start_job(self, job_id, filename):
        with self._lock:
            self.current_job_id = job_id
            self.current_filename = filename

    def finish_job(self, job_id, *, succeeded):
        with self._lock:
            if succeeded:
                self.completed_jobs += 1
            else:
                self.failed_jobs += 1
            if self.current_job_id == job_id:
                self.current_job_id = ""
                self.current_filename = ""

    def snapshot(self):
        with self._lock:
            return {
                "completed_jobs": self.completed_jobs,
                "failed_jobs": self.failed_jobs,
                "current_job_id": self.current_job_id,
                "current_filename": self.current_filename,
            }


LISTENER_STATS = ListenerStats()

# ── DynamoDB helpers ──────────────────────────────────────────────────────────

def get_job(job_id):
    resp = jobs_table.get_item(Key={"jobId": job_id})
    return resp.get("Item")


def parse_iso_datetime(value):
    raw = (value or "").strip()
    if not raw:
        return None
    normalized = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def mark_processing(job_id):
    """Transition PENDING/QUEUED → PROCESSING. Returns False if already claimed."""
    now = datetime.now(timezone.utc).isoformat()
    try:
        jobs_table.update_item(
            Key={"jobId": job_id},
            UpdateExpression=(
                "SET #s = :processing, updatedAt = :now, processingStartedAt = :now"
            ),
            ConditionExpression=(
                "#s IN (:queued, :pending, :received, :created)"
            ),
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":processing": "PROCESSING",
                ":queued": "QUEUED",
                ":pending": "PENDING",
                ":received": "RECEIVED",
                ":created": "CREATED",
                ":now": now,
            },
        )
        return True
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


def mark_succeeded(job_id, output_files):
    now = datetime.now(timezone.utc).isoformat()
    jobs_table.update_item(
        Key={"jobId": job_id},
        UpdateExpression="SET #s = :succeeded, updatedAt = :now, #out = :out",
        ExpressionAttributeNames={"#s": "status", "#out": "output"},
        ExpressionAttributeValues={
            ":succeeded": "SUCCEEDED",
            ":now": now,
            ":out": {
                "outputPrefix": f"outputs/{job_id}/",
                "files": output_files,
            },
        },
    )


def mark_failed(job_id, error_message, detail=""):
    now = datetime.now(timezone.utc).isoformat()
    jobs_table.update_item(
        Key={"jobId": job_id},
        UpdateExpression="SET #s = :failed, updatedAt = :now, #err = :err",
        ExpressionAttributeNames={"#s": "status", "#err": "error"},
        ExpressionAttributeValues={
            ":failed": "FAILED",
            ":now": now,
            ":err": {
                "code": "PROCESSING_FAILED",
                "message": error_message[:500],
                "detail": detail[:2000],
            },
        },
    )


def reset_stuck_jobs():
    """On startup, reset PROCESSING jobs older than max_processing_hours back to PENDING."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=MAX_PROCESSING_HOURS)
    log.info("Scanning for jobs stuck in PROCESSING > %dh...", MAX_PROCESSING_HOURS)
    reset_count = 0
    try:
        last_key = None
        while True:
            kwargs = {
                "FilterExpression": "#s = :processing",
                "ExpressionAttributeNames": {"#s": "status"},
                "ExpressionAttributeValues": {":processing": "PROCESSING"},
            }
            if last_key:
                kwargs["ExclusiveStartKey"] = last_key
            resp = jobs_table.scan(**kwargs)
            for item in resp.get("Items", []):
                started_at = (
                    parse_iso_datetime(item.get("processingStartedAt"))
                    or parse_iso_datetime(item.get("updatedAt"))
                    or parse_iso_datetime(item.get("createdAt"))
                )
                if not started_at or started_at >= cutoff:
                    continue
                jid = item["jobId"]
                log.warning("Resetting stuck job %s to PENDING", jid)
                jobs_table.update_item(
                    Key={"jobId": jid},
                    UpdateExpression="SET #s = :pending, updatedAt = :now",
                    ExpressionAttributeNames={"#s": "status"},
                    ExpressionAttributeValues={
                        ":pending": "PENDING",
                        ":now": datetime.now(timezone.utc).isoformat(),
                    },
                )
                reset_count += 1
            last_key = resp.get("LastEvaluatedKey")
            if not last_key:
                break
    except Exception as exc:
        log.error("Error during stuck job scan: %s", exc)
    log.info("Startup check complete. %d stuck job(s) reset.", reset_count)

# ── SQS helpers ───────────────────────────────────────────────────────────────

def extend_visibility(receipt_handle, seconds=43200):
    """Extend SQS message visibility to prevent re-queuing during long jobs."""
    try:
        sqs.change_message_visibility(
            QueueUrl=JOB_QUEUE_URL,
            ReceiptHandle=receipt_handle,
            VisibilityTimeout=min(seconds, 43200),  # SQS max is 12 hours
        )
        log.info("SQS visibility extended by %ds", seconds)
    except Exception as exc:
        log.warning("Could not extend SQS visibility: %s", exc)


def delete_message(receipt_handle):
    sqs.delete_message(QueueUrl=JOB_QUEUE_URL, ReceiptHandle=receipt_handle)

# ── S3 helpers ────────────────────────────────────────────────────────────────

def download_from_s3(s3_key, local_path):
    log.info("Downloading s3://%s/%s → %s", BUCKET_NAME, s3_key, local_path)
    s3.download_file(BUCKET_NAME, s3_key, str(local_path))


def upload_to_s3(local_path, s3_key):
    size = local_path.stat().st_size
    log.info("Uploading %s → s3://%s/%s (%d bytes)", local_path.name, BUCKET_NAME, s3_key, size)
    s3.upload_file(str(local_path), BUCKET_NAME, s3_key)
    return size

# ── Email helpers ─────────────────────────────────────────────────────────────

def _build_raw_email(subject, body_text, attachments=None):
    msg = email.mime.multipart.MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = SENDER
    msg["To"] = RECIPIENT
    msg.attach(email.mime.text.MIMEText(body_text, "plain", "utf-8"))
    for path in (attachments or []):
        with open(path, "rb") as f:
            data = f.read()
        part = email.mime.application.MIMEApplication(data, Name=path.name)
        part["Content-Disposition"] = f'attachment; filename="{path.name}"'
        msg.attach(part)
    return msg.as_bytes()


def send_email(subject, body_text, attachments=None):
    try:
        if attachments:
            ses.send_raw_email(
                Source=SENDER,
                Destinations=[RECIPIENT],
                RawMessage={"Data": _build_raw_email(subject, body_text, attachments)},
            )
        else:
            ses.send_email(
                Source=SENDER,
                Destination={"ToAddresses": [RECIPIENT]},
                Message={
                    "Subject": {"Data": subject},
                    "Body": {"Text": {"Data": body_text}},
                },
            )
        log.info("Email sent: %s", subject)
    except Exception as exc:
        log.error("Failed to send email '%s': %s", subject, exc)

# ── Processor ─────────────────────────────────────────────────────────────────

def run_processor(input_pdf, output_dir):
    """Run marked_register_processor.py and return a list of output CSV paths."""
    output_dir.mkdir(parents=True, exist_ok=True)
    cmd = PROCESSOR_COMMAND.format(
        input_pdf=str(input_pdf),
        output_dir=str(output_dir),
    )
    log.info("Running processor: %s", cmd)
    result = subprocess.run(
        cmd,
        shell=True,
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
    )
    if result.stdout.strip():
        log.info("Processor stdout:\n%s", result.stdout.strip())
    if result.stderr.strip():
        log.warning("Processor stderr:\n%s", result.stderr.strip())
    if result.returncode != 0:
        raise RuntimeError(
            f"Processor exited with code {result.returncode}.\n"
            f"stderr: {result.stderr.strip()}"
        )
    csv_files = list(output_dir.glob("*.csv"))
    if not csv_files:
        raise RuntimeError("Processor completed but produced no CSV output files.")
    log.info("Processor produced %d CSV file(s): %s", len(csv_files), [f.name for f in csv_files])
    return csv_files

# ── Progress updater ──────────────────────────────────────────────────────────

class ProgressUpdater(threading.Thread):
    """Daemon thread: sends periodic progress emails and extends SQS visibility."""

    def __init__(self, job_id, filename, receipt_handle):
        super().__init__(daemon=True)
        self.job_id = job_id
        self.filename = filename
        self.receipt_handle = receipt_handle
        self._stop = threading.Event()
        self.started_at = datetime.now(timezone.utc)

    def stop(self):
        self._stop.set()

    def run(self):
        progress_interval = PROGRESS_UPDATE_HOURS * 3600
        extend_interval = 6 * 3600  # extend SQS visibility every 6h (max 12h)
        next_progress = time.monotonic() + progress_interval
        next_extend = time.monotonic() + extend_interval

        while not self._stop.wait(timeout=60):
            now = time.monotonic()
            if now >= next_extend:
                extend_visibility(self.receipt_handle, seconds=43200)
                next_extend = now + extend_interval
            if now >= next_progress:
                elapsed = datetime.now(timezone.utc) - self.started_at
                hours = int(elapsed.total_seconds() // 3600)
                minutes = int((elapsed.total_seconds() % 3600) // 60)
                stats = LISTENER_STATS.snapshot()
                queue_depth = get_queue_depth()
                queue_line = (
                    f"Jobs still waiting in queue: {queue_depth}\n" if queue_depth is not None else ""
                )
                send_email(
                    subject=f"[In progress] {self.filename} — {hours}h {minutes}m elapsed",
                    body_text=(
                        f"Job ID: {self.job_id}\n"
                        f"Currently processing: {stats['current_filename'] or self.filename}\n"
                        f"Elapsed: {hours}h {minutes}m\n\n"
                        f"Completed jobs since listener start: {stats['completed_jobs']}\n"
                        f"Failed jobs since listener start: {stats['failed_jobs']}\n"
                        f"{queue_line}\n"
                        f"Processing is still running. You will receive another update "
                        f"in {PROGRESS_UPDATE_HOURS} hours, or an email when it completes.\n"
                    ),
                )
                next_progress = now + progress_interval

# ── Core job processing ───────────────────────────────────────────────────────

def process_job(job_id, job, s3_key, receipt_handle):
    filename = job.get("filename") or Path(s3_key).name
    log.info("=== Starting job %s — %s ===", job_id, filename)
    LISTENER_STATS.start_job(job_id, filename)

    job_temp = TEMP_FOLDER / job_id
    job_output = OUTPUT_FOLDER / job_id
    job_temp.mkdir(parents=True, exist_ok=True)

    progress = ProgressUpdater(job_id, filename, receipt_handle)
    progress.start()
    try:
        local_pdf = job_temp / filename
        download_from_s3(s3_key, local_pdf)

        csv_files = run_processor(local_pdf, job_output)

        output_file_records = []
        for csv_path in csv_files:
            output_key = f"outputs/{job_id}/{csv_path.name}"
            size = upload_to_s3(csv_path, output_key)
            output_file_records.append({
                "key": output_key,
                "name": csv_path.name,
                "contentType": "text/csv",
                "size": size,
            })

        mark_succeeded(job_id, output_file_records)
        LISTENER_STATS.finish_job(job_id, succeeded=True)
        log.info("Job %s SUCCEEDED — %d output file(s)", job_id, len(csv_files))

        send_email(
            subject=f"[Complete] {filename} processed successfully",
            body_text=(
                f"Job {job_id} completed successfully.\n\n"
                f"File processed: {filename}\n"
                f"Output file(s): {', '.join(f.name for f in csv_files)}\n\n"
                f"The CSV(s) are attached. Review and forward to the client as needed.\n"
            ),
            attachments=csv_files,
        )

    except Exception as exc:
        log.exception("Job %s FAILED: %s", job_id, exc)
        mark_failed(job_id, str(exc)[:500], detail=str(exc))
        LISTENER_STATS.finish_job(job_id, succeeded=False)
        send_email(
            subject=f"[FAILED] Processing error — {filename}",
            body_text=(
                f"Job {job_id} failed to process.\n\n"
                f"File: {filename}\n"
                f"Error: {exc}\n\n"
                f"Check logs/listener.log for full details.\n"
            ),
        )
    finally:
        progress.stop()
        shutil.rmtree(job_temp, ignore_errors=True)

# ── Message handling ──────────────────────────────────────────────────────────

def parse_message_body(raw_body):
    payload = json.loads(raw_body)
    if payload.get("Records"):
        # S3 event format — rarely used but handled for completeness
        rec = payload["Records"][0]["s3"]
        return {
            "jobId": "",
            "bucket": rec["bucket"]["name"],
            "s3Key": rec["object"]["key"].replace("+", " "),
        }
    return {
        "jobId": payload.get("jobId", ""),
        "bucket": payload.get("bucket", BUCKET_NAME),
        "s3Key": payload.get("s3Key", ""),
    }


def handle_message(message):
    receipt_handle = message["ReceiptHandle"]
    try:
        body = parse_message_body(message["Body"])
    except Exception as exc:
        log.error("Malformed SQS message: %s", exc)
        delete_message(receipt_handle)
        return

    job_id = body["jobId"]
    s3_key = body["s3Key"]

    if not job_id:
        log.warning("Message has no jobId (S3 event format) — cannot resolve; discarding")
        delete_message(receipt_handle)
        return

    job = get_job(job_id)
    if not job:
        log.error("Job %s not found in DynamoDB — discarding message", job_id)
        delete_message(receipt_handle)
        return

    filename = job.get("filename") or Path(s3_key).name

    # Skip if blocked by manual review
    if job.get("blocked") or job.get("manualReviewStatus") in ("OPEN", "NEEDS_INFO"):
        log.info("Job %s blocked by manual review — leaving in queue", job_id)
        return

    if not mark_processing(job_id):
        log.info("Job %s already claimed — discarding duplicate message", job_id)
        delete_message(receipt_handle)
        return

    # Extend visibility immediately so the message doesn't re-appear during processing
    extend_visibility(receipt_handle, seconds=43200)

    send_email(
        subject=f"[New job] Processing started — {filename}",
        body_text=(
            f"A new upload job has started processing on your local machine.\n\n"
            f"Job ID: {job_id}\n"
            f"File: {filename}\n"
            f"Started: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n\n"
            f"You will receive an email when complete. "
            f"Large batches may take several hours or up to a full day.\n"
        ),
    )

    process_job(job_id, job, s3_key, receipt_handle)
    delete_message(receipt_handle)

# ── Poll loop ─────────────────────────────────────────────────────────────────

def poll_once():
    resp = sqs.receive_message(
        QueueUrl=JOB_QUEUE_URL,
        MaxNumberOfMessages=1,
        WaitTimeSeconds=LONG_POLL_SECONDS,
        VisibilityTimeout=60, # short initial window; extended after claim
    )
    messages = resp.get("Messages", [])
    if messages:
        handle_message(messages[0])


def main():
    log.info("=" * 60)
    log.info("Political Portal Listener starting")
    log.info("Queue:  %s", JOB_QUEUE_URL)
    log.info("Bucket: %s", BUCKET_NAME)
    log.info("Table:  %s", JOBS_TABLE)
    log.info("Long poll window: %ss, sleep between polls: %ss", LONG_POLL_SECONDS, POLL_SLEEP_SECONDS)
    log.info("=" * 60)

    reset_stuck_jobs()

    log.info("Polling every %ds. Press Ctrl+C to stop.", POLL_INTERVAL)
    while True:
        try:
            poll_once()
        except KeyboardInterrupt:
            log.info("Listener stopped by user.")
            sys.exit(0)
        except Exception as exc:
            log.exception("Unexpected error in poll loop: %s", exc)
        time.sleep(POLL_SLEEP_SECONDS)


if __name__ == "__main__":
    main()
