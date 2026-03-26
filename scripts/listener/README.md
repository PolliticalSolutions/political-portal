# Political Portal — Local Job Listener

Polls the AWS SQS job queue, processes uploaded PDFs with `marked_register_processor.py`,
uploads the resulting CSVs back to S3, and emails Paul with the output attached.

---

## Prerequisites

- Python 3.9+
- AWS credentials for an IAM user with the policy in `iam-policy.json`
- `marked_register_processor.py` available locally

---

## 1. Install Python dependencies

```
pip install boto3
```

The listener itself only needs `boto3`. `marked_register_processor.py` may have its
own dependencies — install them separately if needed (e.g. `pdf2image`, `pytesseract`,
`pillow`, `pandas`).

---

## 2. Fill in config.ini

Open `scripts/listener/config.ini` and set:

| Key | Value |
|-----|-------|
| `access_key_id` | AWS access key for the listener IAM user |
| `secret_access_key` | AWS secret key |
| `processor_command` | Command to run the processor (see below) |

The `processor_command` must include `{input_pdf}` and `{output_dir}` placeholders:

```ini
processor_command = python C:\path\to\marked_register_processor.py {input_pdf} {output_dir}
```

The command runs from the project root directory. Use absolute paths if the script is
located outside the project.

---

## 3. Create the IAM user (one-time, manual)

In the AWS console (IAM → Users → Create user):

1. Create a user named `portal-listener` (no console access needed)
2. Attach the inline policy from `scripts/listener/iam-policy.json`
3. Create an access key under Security credentials → Access keys
4. Copy the key ID and secret into `config.ini`

---

## 4. Register the startup task (one-time)

Open PowerShell as your normal user and run:

```powershell
cd C:\path\to\political-portal\scripts\listener
.\setup_task_scheduler.ps1
```

This registers a Windows Task Scheduler task called `PoliticalPortalListener` that
starts automatically at login.

To start it immediately without rebooting:

```powershell
Start-ScheduledTask -TaskName "PoliticalPortalListener"
```

---

## 5. Start the listener manually

Double-click `run_listener.bat`, or from a terminal:

```
cd scripts\listener
run_listener.bat
```

The batch file restarts the listener automatically if it crashes (10-second delay).

---

## 6. Check the logs

Logs are written to `scripts/listener/logs/listener.log`.

To tail them in PowerShell:

```powershell
Get-Content scripts\listener\logs\listener.log -Wait -Tail 50
```

Each line is timestamped. Key events to look for:

- `Starting job <id>` — job picked up from queue
- `Processor produced N CSV file(s)` — processing finished
- `Job <id> SUCCEEDED` — DynamoDB updated, email sent
- `Job <id> FAILED` — error email sent, job marked failed
- `Email sent` — SES call succeeded

---

## 7. Manually reprocess a failed job

1. In the AWS DynamoDB console, find the job in `ps-upload-api-prod-jobs`
2. Update the `status` field to `PENDING`
3. Remove the `error` field if present
4. In the AWS SQS console, send a new message to the queue:
   ```json
   { "jobId": "<job-id>", "bucket": "ps-upload-api-prod-uploads-561375865143", "s3Key": "uploads/<userSub>/<jobId>/<filename>" }
   ```
5. The listener will pick it up on its next poll

---

## 8. What the client sees at each stage

| Stage | Portal status | Message shown |
|-------|--------------|---------------|
| Just uploaded | Pending | "Queued for processing — you will receive an email when complete." |
| Listener picked it up | Processing | "Processing now — large batches may take several hours." |
| Done | Complete | "Complete" |
| Error | Failed | "Processing encountered an issue. Our team has been notified." |

---

## 9. Processing time expectations

- Small PDFs (1–5 pages): a few minutes
- Medium batches (10–20 PDFs): 30–90 minutes
- Large batches (100+ PDFs): several hours or up to a full day

Progress update emails are sent every 2 hours for any job that is still running.

The listener processes **one job at a time**. If multiple jobs are queued, they will
be processed sequentially.

---

## 10. Email flow

| Event | Email sent |
|-------|-----------|
| Job picked up from queue | "New job — Processing started" |
| Job running > 2h (and every 2h after) | "In progress — Xh Ym elapsed" |
| Job completes successfully | "Complete — CSV(s) attached" |
| Job fails | "FAILED — error details" |

---

## SQS visibility timeout note

SQS has a maximum visibility timeout of 12 hours (43,200 seconds). The listener
extends the message visibility every 6 hours automatically, so jobs running up to
48 hours will not re-appear in the queue.
