# Upload API deployment (SAM + S3 + DynamoDB)

## Overview
Deploys the upload processing API alongside the existing enquiry-api.
Region assumption: eu-west-2.

Stack creates:
- Private S3 bucket (uploads input + processed outputs)
- DynamoDB table with GSIs and TTL for job retention
- HTTP API Gateway + Lambda for job CRUD and presigned URL generation
- GuardDuty Malware Protection plan for uploads/ with object tagging
- EventBridge rule + scan result handler Lambda to gate processing
- SQS processing queue + DLQ + processor Lambda (batch + partial-failure)
- Optional WAF with rate limiting and AWS Managed Rules

## Prerequisites
- AWS CLI configured for the target account
- AWS SAM CLI installed (`pip install aws-sam-cli`)
- Cognito User Pool and App Client IDs from the existing Cognito setup
  (same pool used by the enquiry-api and portal login)
- GuardDuty enabled in the target account/region (required for malware scan events)

## Deploy

### Option A (script)
```
ALLOWED_ORIGINS="https://www.politicalsolutions.uk,http://localhost:5173" \
COGNITO_ISSUER="https://cognito-idp.eu-west-2.amazonaws.com/<user-pool-id>" \
COGNITO_AUDIENCE="<app-client-id>" \
THROTTLE_RPS="20" \
THROTTLE_BURST="40" \
WAF_ENABLED="true" \
WAF_RATE_LIMIT="300" \
WAF_MANAGED_RULES_ENABLED="true" \
WAF_LOGGING_ENABLED="true" \
WAF_LOG_RETENTION_DAYS="14" \
ENABLE_GD_SCAN="false" \
BYPASS_SCAN_WHEN_DISABLED="true" \
AWS_REGION="eu-west-2" \
STACK_NAME="ps-upload-api-prod" \
./scripts/deploy-upload-api.sh
```

### Option B (manual)
```
cd infra/upload-api
sam build
sam deploy --resolve-s3 \
  --stack-name ps-upload-api-prod \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    AllowedOrigins="https://www.politicalsolutions.uk,http://localhost:5173" \
    CognitoIssuer="https://cognito-idp.eu-west-2.amazonaws.com/<user-pool-id>" \
    CognitoAudience="<app-client-id>" \
    ThrottlingRateLimit=20 \
    ThrottlingBurstLimit=40 \
    WafEnabled=true \
    WafRateLimit=300 \
    WafManagedRulesEnabled=true \
    WafLoggingEnabled=true \
    WafLogRetentionDays=14 \
    EnableGuardDutyScan=false \
    BypassScanWhenDisabled=true \
  --region eu-west-2
```

## Retrieve ApiBaseUrl
```
aws cloudformation describe-stacks \
  --stack-name ps-upload-api-prod \
  --query "Stacks[0].Outputs"
```
Look for `ApiBaseUrl` in the output.

## Amplify configuration
Set the environment variable in Amplify Console (App settings → Environment variables):
```
VITE_UPLOAD_API_URL=<ApiBaseUrl>
```
Example value: `https://abc123.execute-api.eu-west-2.amazonaws.com`

Important:
- Use the base URL only (no trailing path segment needed).
- A trailing slash is OK — the client strips it automatically.
- The existing `VITE_API_BASE_URL` is for the enquiry-api; this is a separate variable.

## Amplify rewrite rules (optional proxy approach)
If you prefer to proxy `/api/uploads/*` through Amplify instead of exposing the API Gateway URL directly, add a rewrite rule in `scripts/amplify-customRules.next.json`:
```json
{
  "source": "/api/uploads/<*>",
  "target": "https://<upload-api-id>.execute-api.eu-west-2.amazonaws.com/<*>",
  "status": "200"
}
```
Then set `VITE_UPLOAD_API_URL=/api/uploads` (a relative path). The existing pattern in this repo uses direct API Gateway URLs via `VITE_*` env vars, so the direct URL approach is recommended.

## Verification (curl)
Replace `<ApiBaseUrl>` and `<JWT_TOKEN>` below.

### Create a job
```
curl -i -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -d '{"filename":"test.csv","fileType":"csv","size":12345,"metadata":{"clientName":"Test","notes":""}}' \
  https://<ApiBaseUrl>/jobs
```
Expected:
```json
{
  "jobId": "<uuid>",
  "s3Key": "uploads/...",
  "upload": {
    "url": "https://<bucket>.s3.amazonaws.com",
    "fields": { "...": "..." }
  }
}
```

### Upload file to presigned POST URL
```
curl -i -X POST "<upload.url>" \
  -F "key=<upload.fields.key>" \
  -F "policy=<upload.fields.policy>" \
  -F "x-amz-signature=<upload.fields.x-amz-signature>" \
  -F "Content-Type=text/csv" \
  -F "file=@/path/to/file.csv;type=text/csv"
```

### List jobs
```
curl -i -H "Authorization: Bearer <JWT_TOKEN>" \
  https://<ApiBaseUrl>/jobs?limit=25
```

### Get job status
```
curl -i -H "Authorization: Bearer <JWT_TOKEN>" \
  https://<ApiBaseUrl>/jobs/<jobId>
```

### Download output
```
curl -i -H "Authorization: Bearer <JWT_TOKEN>" \
  https://<ApiBaseUrl>/jobs/<jobId>/download
```
Response contains presigned download URLs, valid for 15 minutes.

## Processing pipeline
1. Client creates a job and uploads to `uploads/<userSub>/<jobId>/<filename>`.
2. If `EnableGuardDutyScan=true`: GuardDuty scans uploaded objects and EventBridge routes results to `ScanResultHandlerFunction`.
3. Clean scans enqueue `{ jobId, bucket, s3Key }` to `ProcessQueue`; infected/failed scans mark the job failed.
4. If `EnableGuardDutyScan=false` and `BypassScanWhenDisabled=true`: API marks `scanResultStatus=BYPASSED` and enqueues immediately.
5. `WorkerFunction` consumes SQS messages, validates/processes, writes outputs.
6. Failed processing retries and eventually lands in `ProcessDLQ`.

## Marked-register release procedure

The marked-register path has an additional fail-closed quality gate. PDF
district boundaries must be corroborated by anchored page headers, at least
20% of row-bearing pages must have readable headers, no untrusted district
label may remain, and within-source deduplication must not exceed 2%. A failed
gate records `QUALITY_REVIEW_REQUIRED`, sends a notice-only email, and does not
upload or expose a customer result.

Page headers are read at the production render size and, only when a code is
missing or reduced to a two-character prefix, at half size as a fallback. A
district boundary requires the same code on the next page or after exactly one
unreadable page; a different readable intervening code invalidates the match.

The row filter removes numeric wrapped-address lines by retaining the strongest
ordered roll-number sequence within each printed column. Slash-numbered late
additions are always retained, even when they appear out of sequence.

The successful combined result is an `.xlsx` workbook. Every cell is written
as literal text, so roll numbers such as `12/3` cannot be silently converted to
calendar dates by Excel. Legacy completed CSV batches remain downloadable.

Before deploying marked-register changes:

1. Run the privacy-safe production-equivalent validation over the original
   source folder:

   ```powershell
   & .\infra\upload-api\local_trial\run-fix-validation.ps1 `
     -InputPath "C:\full\path\to\folder"
   ```

2. Require `aggregate.quality_gate` to be `PASS`. Review the aggregate district
   and vote-type counts; the report contains no filenames or elector data.

3. Run the focused regression suites:

   ```powershell
   python -m pytest `
     infra/upload-api/src_python/test/test_process_register.py `
     infra/upload-api/src_python/test/test_combine_register.py `
     infra/upload-api/src_python/test/test_local_register_structure_audit.py `
     -q
   npm run test:api -- infra/upload-api/test/handler.test.mjs
   npm run test:run -- src/pages/portal/Uploads.test.jsx
   ```

4. Build and inspect the production change set:

   ```powershell
   Push-Location infra/upload-api
   sam build
   sam deploy --config-env prod --no-execute-changeset
   Pop-Location
   ```

5. Only after approval, execute the reviewed change set (or rerun
   `sam deploy --config-env prod`) and deploy the matching portal build.

6. Upload the original PDFs as a new batch. Do not reuse the old output: it was
   created before district resolution and the quality gate were corrected.
   Confirm the new batch reaches `COMPLETE` or `COMPLETE_WITH_WARNINGS`, has an
   `.xlsx` download, and does not show `QUALITY_REVIEW_REQUIRED`.

## GuardDuty scan feature flags
- `EnableGuardDutyScan`:
  - `true` enables `AWS::GuardDuty::MalwareProtectionPlan` + EventBridge scan-result routing.
  - `false` skips plan/rule creation.
- `BypassScanWhenDisabled`:
  - `true` avoids stuck `QUEUED` jobs by enqueuing directly from API when scan is disabled.
  - `false` keeps strict scan-gated behaviour (do not use in production unless scan is enabled).

## Retention
- S3 lifecycle:
  - `uploads/*` expires after 90 days.
  - `outputs/*` expires after 90 days.
  - Incomplete multipart uploads abort after 7 days.
- DynamoDB TTL:
  - Jobs table TTL attribute: `expiresAt` (epoch seconds).
  - Job records are set to expire 365 days after creation.
  - TTL deletion is best-effort and not immediate.

## DLQ replay
Do not directly redrive the entire standard-queue DLQ: duplicate submissions can
leave several messages for the same splitter job and would multiply the OCR
work. Use the deduplicating recovery tool instead:

1. Inspect the plan without changing either queue:

   ```bash
   python infra/upload-api/src_python/process_dlq_recovery.py
   ```

2. Correlate the listed job IDs with `ProcessRegisterFunction` CloudWatch logs.
   The tool only proposes replay for `PENDING`/`QUEUED` jobs whose source object
   still exists. It proposes deletion for stale messages whose job is already
   `SUCCEEDED`/`FAILED`, and holds every ambiguous case. Confirm the root cause
   is fixed before replaying to avoid repeat failures.

3. Apply the printed plan:

   ```bash
   python infra/upload-api/src_python/process_dlq_recovery.py --apply
   ```

The tool sends one copy of each logical message to `ProcessQueue` before
deleting its DLQ copies. If deletion fails after the send, processing may be
duplicated but the work is not lost. Splitter messages are deduplicated per job;
different chunk messages for the same job remain separate.

## Throttling + 429s
- Default stage throttling: 20 rps, burst 40.
- Override via `ThrottlingRateLimit` and `ThrottlingBurstLimit`.

## WAF protection
- Same managed rule groups as the enquiry-api: Common, KnownBadInputs, IP reputation.
- Rate limit default: 300 requests per 5 minutes per IP.
- To disable managed rules temporarily: redeploy with `WafManagedRulesEnabled=false`.

## Plugging in the real OCR pipeline
The worker Lambda (`infra/upload-api/src/worker.mjs`) has a clearly marked section:

```javascript
// TODO: replace with actual OCR command, e.g. call Textract or tesseract
outputContent = `jobId,filename,processedAt\n...`; // placeholder
```

To wire in real OCR:
1. Replace the placeholder block with your OCR call (e.g. AWS Textract `StartDocumentAnalysis`).
2. For async OCR (Textract), use an SNS/SQS queue for the completion callback and a second Lambda to update the job record on completion.
3. Increase the Worker Lambda `Timeout` and `MemorySize` as needed.
4. Add IAM permissions for Textract in the worker's `Policies` section in `template.yaml`.

## Security notes
- S3 bucket is fully private (all public access blocked). Files are accessible only via presigned URLs.
- Presigned upload URLs expire in 15 minutes. Presigned download URLs expire in 15 minutes.
- All API routes require a valid Cognito JWT (RS256, issuer + audience verified against JWKS).
- Jobs are tenant-isolated by `userSub`: users can only read/download their own jobs.
- Worker writes outputs only to `outputs/{jobId}/` prefix, never overwriting upload keys.
- S3 server-side encryption is enabled (AES256).
