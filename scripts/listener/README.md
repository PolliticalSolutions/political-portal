# Political Portal Local Listener

This listener connects the live portal upload pipeline to your local `marked_register_processor.py` workflow.

Flow:

1. A client uploads a PDF in the portal.
2. The upload API stores it in S3 and places a job on the SQS queue.
3. `listener.py` picks up one job at a time, downloads the file, runs `marked_register_processor.py`, uploads the CSV output to S3, updates the DynamoDB job record, and emails Paul.
4. The client sees the job move through `Pending`, `Processing`, `Complete`, or `Failed` in the portal.

Large batches of 100+ PDFs can take many hours and may run for up to a full day.

## 1. Install Python dependencies

From a terminal:

```powershell
pip install boto3 pandas pdf2image pytesseract pillow
```

Install any additional dependencies that your local `marked_register_processor.py` script needs.

## 2. Fill in `config.ini`

Edit [config.ini](c:/Users/pauls/Documents/political-portal/scripts/listener/config.ini) and replace:

- `YOUR_AWS_ACCESS_KEY`
- `YOUR_AWS_SECRET_KEY`

The live queue URL is already filled in:

- `https://sqs.eu-west-2.amazonaws.com/561375865143/ps-upload-api-prod-process-queue`

If `marked_register_processor.py` is not in the project root, set `processor_command` to its real location. Example:

```ini
processor_command = python "C:\path\to\marked_register_processor.py" "{input_pdf}" "{output_dir}"
```

## 3. Register the startup task once

Open PowerShell in [scripts/listener](c:/Users/pauls/Documents/political-portal/scripts/listener) and run:

```powershell
.\setup_task_scheduler.ps1
```

This registers a Windows Scheduled Task called `PoliticalPortalListener` for the current user. It is configured with startup and logon triggers and restart-on-failure settings.

## 4. Start it immediately

From [scripts/listener](c:/Users/pauls/Documents/political-portal/scripts/listener):

```powershell
.\run_listener.bat
```

The batch file will:

- activate `.venv` or `venv` automatically if one exists in the listener folder or repo root
- run `listener.py`
- wait 10 seconds and restart it if it crashes

## 5. Check logs

The listener writes timestamped logs to [listener.log](c:/Users/pauls/Documents/political-portal/scripts/listener/logs/listener.log).

Useful command:

```powershell
Get-Content .\logs\listener.log -Wait -Tail 50
```

## 6. Reprocess a failed job manually

1. Find the job in DynamoDB table `ps-upload-api-prod-jobs`.
2. Set `status` back to `PENDING`.
3. Remove or ignore the existing `error` field.
4. Send a replacement SQS message to `ps-upload-api-prod-process-queue` with the job payload:

```json
{
  "jobId": "JOB_ID_HERE",
  "bucket": "ps-upload-api-prod-uploads-561375865143",
  "s3Key": "uploads/USER_SUB/JOB_ID/FILENAME.pdf"
}
```

5. The listener will pick it up on the next poll.

## 7. What the client sees in the portal

- `PENDING`: `Queued for processing — you will receive an email when complete. Large batches may take several hours.`
- `PROCESSING`: `Processing now — large batches may take several hours. You will receive an email when complete.`
- `COMPLETE`: `Complete`
- `FAILED`: `Processing encountered an issue. Our team has been notified.`

## 8. Email behavior

Paul receives emails when:

- a new job starts processing
- a job has been running for more than 2 hours, and every 2 hours after that
- a job completes successfully, with CSV attachments
- a job fails, with filename and error details

## 9. Notes about long-running jobs

AWS SQS visibility timeout has a hard service limit of 12 hours. The queue and listener are configured to use the maximum supported 12-hour visibility window and the listener renews visibility during long runs, which is how 24 to 48 hour processing windows are handled safely.
