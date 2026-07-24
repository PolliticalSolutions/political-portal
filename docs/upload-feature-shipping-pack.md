# Upload Feature — Shipping Pack

**Product:** Political Solutions Portal — File Upload & Processing
**Date:** 2026-02-19
**Status:** Pre-ship review
**Author:** Technical PM / Security Review

> **Assumptions made (no questions asked):**
> - Clients are UK political parties, campaign groups, and CLPs uploading marked-register and absent-voter data as PDF, CSV, or XLSX files.
> - "Presigned POST upgrade" is the next deploy — this doc covers the full feature including that change.
> - Cognito user pool is in `eu-west-2` (London). All infra stays in `eu-west-2`.
> - No multi-tenancy beyond Cognito `sub` isolation today — org-level access is a future iteration.
> - OCR integration (Textract/Tesseract) is not yet live — the worker is a validated placeholder. This doc covers the full target architecture.
> - The 200 MB limit is per-file, not per-batch.

---

## 1. Product Spec

### 1.1 User Stories

| # | Story | Acceptance criteria |
|---|-------|-------------------|
| US-1 | As an authenticated portal user, I can upload one or more PDF/CSV/XLSX files so that they are queued for processing. | Files accepted via drag-drop or file picker. Job record created per file. Presigned POST used with server-enforced 200 MB limit. |
| US-2 | As a portal user, I can see the real-time status of my processing jobs so I know when results are ready. | Jobs table shows QUEUED → PROCESSING → SUCCEEDED/FAILED with auto-polling (5 s). Status badges are colour-coded. |
| US-3 | As a portal user, I can download the processed output files for any succeeded job. | Download button appears on SUCCEEDED jobs. Presigned GET URLs generated (15-min TTL). Files download to browser. |
| US-4 | As a portal user, I can attach a client name and notes to my upload batch so I can find jobs later. | Optional metadata fields (client name ≤200 chars, notes ≤1000 chars) saved with each job. |
| US-5 | As a portal user, I am clearly told when a file is rejected (wrong type, too large) before upload starts. | Client-side validation blocks upload. Error messages shown inline per file. |
| US-6 | As an ops admin, I can see job processing failures with error detail in logs and in the portal UI so I can triage issues. | FAILED jobs show error message in the table. Worker logs contain structured JSON with jobId, filename, error. |

### 1.2 Selling Points (for client-facing material)

- **Speed:** Direct-to-S3 upload — no file passes through our API servers, maximising upload speed on large files.
- **Security:** End-to-end encryption (TLS in transit, AES-256 at rest). Files isolated per user. WAF + rate limiting on all endpoints.
- **Audit trail:** Every job has a unique ID, timestamps, and status history. Full CloudWatch logging for compliance.
- **Scale:** Serverless architecture — no capacity limits. Handles 1 user or 100 concurrent users identically.
- **UK data residency:** All storage and processing in `eu-west-2` (London).

### 1.3 Job Lifecycle States & Transitions

```
                ┌──────────┐
  POST /jobs →  │  QUEUED  │
                └────┬─────┘
                     │  S3 trigger fires worker
                     ▼
                ┌────────────┐
                │ PROCESSING │
                └──┬──────┬──┘
                   │      │
          success  │      │  error
                   ▼      ▼
            ┌──────────┐ ┌────────┐
            │SUCCEEDED │ │ FAILED │
            └──────────┘ └────────┘
```

**Rules:**
- Only forward transitions. No retry/re-queue in v1 (manual re-upload to retry).
- Worker sets PROCESSING before any file I/O.
- FAILED always includes `error.message` (user-safe) and `error.detail` (stack, ops-only).
- Terminal states (SUCCEEDED, FAILED) are immutable.

### 1.4 Error Cases & User-Facing Outcomes

| Error | Where caught | User sees |
|-------|-------------|-----------|
| File type not PDF/CSV/XLSX | Client (Uploads.jsx) | Inline error: file listed in red with message |
| File exceeds 200 MB | Client (Uploads.jsx) | Inline error per file |
| File exceeds 200 MB (bypass client) | Server — S3 POST policy `content-length-range` | Upload rejected, upload error shown |
| Invalid file content (e.g. PDF magic bytes wrong) | Worker | Job status → FAILED, error message in table |
| Empty CSV | Worker | FAILED: "CSV file is empty or contains no data rows." |
| Unsupported fileType in job record | Worker | FAILED: "Unsupported fileType: {type}" |
| JWT expired / missing | API handler | 401 — frontend redirects to login |
| Job not found / wrong user | API handler | 404/403 — "Job not found" |
| Download before processing complete | API handler | 409 — "Job is not ready for download" |
| S3 upload network failure | Client (fetch to presigned URL) | Upload error banner |
| Worker crash (unhandled) | CloudWatch alarm | Job stays PROCESSING (stuck — see ops runbook) |

### 1.5 Definition of Done

- [ ] Presigned POST replaces presigned PUT (S3 POST policy with `content-length-range` 0–209715200)
- [ ] S3 CORS updated: POST method allowed (currently only PUT)
- [ ] API handler returns POST policy fields (not just a URL)
- [ ] Frontend uses FormData POST (not PUT) to upload
- [ ] Server-side validation in worker: PDF magic bytes check (`%PDF-`), CSV validation, and hardened XLSX/OOXML validation
- [ ] API input validation: fileType, filename length, metadata length
- [ ] All four API endpoints return correct responses with auth
- [ ] Worker transitions QUEUED → PROCESSING → SUCCEEDED/FAILED correctly
- [ ] Download presigned URLs work for SUCCEEDED jobs
- [ ] Frontend polling updates status in real time
- [ ] Client-side validation rejects wrong type / oversized files before upload
- [ ] WAF enabled and rate limiting active
- [ ] CloudWatch alarms configured for both Lambdas
- [ ] Unit tests pass (`vitest run --config vitest.api.config.js`)
- [ ] Manual QA pass on staging (see test plan below)
- [ ] No PII logged (see observability section)
- [ ] Security review checklist complete

---

## 2. QA Test Plan

### 2.1 Manual Test Checklist

**Setup:** Authenticated portal user on staging environment.

#### Happy Path
- [ ] Upload a single valid PDF (<10 MB) — job created, status progresses to SUCCEEDED, download works
- [ ] Upload a single valid CSV (<1 MB) — same progression
- [ ] Upload a single valid XLSX (<1 MB) — same progression
- [ ] Upload multiple files (1 PDF + 1 CSV + 1 XLSX) in one batch — 3 separate jobs created
- [ ] Attach client name and notes — metadata visible when inspecting job (API response)
- [ ] Download output file — browser downloads CSV, content is valid
- [ ] Drag-and-drop upload — file accepted, same flow
- [ ] Page refresh — existing jobs load from API, statuses correct

#### Edge Cases — File Validation
- [ ] Upload a `.txt` file — rejected client-side with error message
- [ ] Upload a `.exe` file — rejected client-side
- [ ] Upload a file >200 MB — rejected client-side with size error
- [ ] Upload a 0-byte PDF — accepted by client, worker should FAIL (empty file)
- [ ] Upload a PDF that is actually a renamed `.txt` — worker FAILS (magic bytes check, post-upgrade)
- [ ] Upload an empty CSV (headers only, no data rows) — worker FAILS with clear message
- [ ] Upload a CSV with only whitespace/newlines — worker FAILS
- [ ] Filename with special characters (`report (final) [v2].pdf`) — accepted, no encoding errors
- [ ] Filename with unicode (`données.csv`) — accepted

#### Edge Cases — Auth & Access
- [ ] Upload without auth token — API returns 401
- [ ] Use expired token — API returns 401, frontend redirects to login
- [ ] Attempt to GET another user's jobId — API returns 403
- [ ] Attempt to download another user's job — API returns 403
- [ ] Idle timeout triggers during upload — warning modal appears

#### Edge Cases — Network & Timing
- [ ] Disconnect network during S3 upload — error shown in upload errors section
- [ ] Close browser tab during upload — no server-side crash (S3 multipart cleanup handles orphan)
- [ ] Upload while another upload is in progress — UI disables upload button (UX check)
- [ ] Rapid-fire refresh clicks — no duplicate jobs, no errors

#### Presigned POST Specific (post-upgrade)
- [ ] Upload a file at exactly 200 MB — accepted
- [ ] Upload a file at 200 MB + 1 byte (curl bypass) — S3 rejects with 400
- [ ] POST policy expires after 15 min — upload attempt returns 403 from S3
- [ ] Content-Type mismatch in POST fields — S3 rejects

### 2.2 Automated Test Coverage Map

| Area | What to test | Tool | Location |
|------|-------------|------|----------|
| **API handler** — route matching | POST/GET /jobs, /jobs/{id}, /jobs/{id}/download | Vitest | `infra/upload-api/test/handler.test.mjs` |
| **API handler** — JWT verification | Valid token, expired token, missing token, wrong audience | Vitest | Same |
| **API handler** — input validation | Missing filename, invalid fileType, oversized metadata | Vitest | Same |
| **API handler** — tenant isolation | User A cannot read User B's job | Vitest | Same |
| **Worker** — PDF processing | Placeholder output generated, status updated | Vitest | `infra/upload-api/test/worker.test.mjs` (create) |
| **Worker** — CSV/XLSX processing | Valid supported spreadsheet normalised; empty or malformed input fails safely | Vitest/Pytest | Same |
| **Worker** — error handling | Unknown fileType, missing job record, S3 read failure | Vitest | Same |
| **Frontend** — file validation | Extension check, size check | Vitest (jsdom) | `src/pages/portal/__tests__/Uploads.test.jsx` (create) |
| **Frontend** — upload flow | createJob called, S3 PUT/POST called, job added to list | Vitest (jsdom) with mocks | Same |
| **Frontend** — polling | Status updates from QUEUED → SUCCEEDED | Vitest with fake timers | Same |
| **Infra** — SAM template | `sam validate` passes | CI script | `scripts/deploy-upload-api.sh` |

### 2.3 Release Gates

All of the following must be green before production deploy:

1. `npm run test:run` — all frontend unit tests pass
2. `npm run test:api` — all API/worker unit tests pass
3. `sam validate` — SAM template is valid
4. Manual QA: happy-path checklist complete on staging
5. Manual QA: presigned POST size-limit verified with curl
6. No P1/P2 bugs open against upload feature
7. CloudWatch alarms confirmed firing on test errors
8. WAF confirmed active on staging API (`aws wafv2 get-web-acl`)
9. Security checklist (section 3) reviewed and signed off

---

## 3. Security / Threat Model

### 3.1 Attack Surface

| Surface | Entry point | Trust boundary |
|---------|------------|----------------|
| **JWT tokens** | `Authorization: Bearer` header on all API calls | Verified server-side against Cognito JWKS (RS256). Cached 6 hrs. |
| **CORS** | Browser pre-flight + `Access-Control-Allow-Origin` | Whitelist of allowed origins. Not `*` in production. |
| **S3 presigned POST** | Direct browser → S3 upload | Time-limited (15 min). Scoped to specific key prefix (`uploads/{userSub}/{jobId}/`). |
| **API Gateway** | Public HTTPS endpoint | WAF + throttling + Cognito auth. |
| **Job enumeration** | `GET /jobs/{jobId}` | UUID (v4) — 122 bits of entropy. Plus `userSub` ownership check. |
| **DynamoDB** | Internal (Lambda IAM only) | No direct access. Scoped IAM policies. |
| **S3 bucket** | Internal (Lambda IAM + presigned URLs) | Private. Public access blocked. AES-256 encryption. |
| **Worker Lambda** | S3 event trigger | No external invocation. Processes only `uploads/` prefix. |

### 3.2 Controls

| Control | Implementation | Status |
|---------|---------------|--------|
| **Tenant isolation** | Every API call checks `job.userSub === caller.sub`. GSI queries scoped to `userSub`. | Live |
| **Presign expiry** | 15-min TTL on upload and download URLs. | Live |
| **Content-type limits** | API accepts only `pdf` / `csv` fileType. Worker validates content. | Live (basic). Magic-bytes check needed. |
| **Size limit (client)** | 200 MB check in `Uploads.jsx` before upload. | Live |
| **Size limit (server)** | S3 POST policy `content-length-range` [0, 209715200]. | Pending (presigned POST upgrade) |
| **Rate limiting (API)** | HTTP API throttle: 20 RPS steady, 40 burst. | Live |
| **Rate limiting (WAF)** | 300 requests / 5 min per IP. | Live |
| **WAF managed rules** | AWS Common Rule Set, Known Bad Inputs, IP Reputation List. | Live |
| **Encryption at rest** | S3 AES-256. DynamoDB default encryption. | Live |
| **Encryption in transit** | HTTPS only (API Gateway). TLS for presigned URLs. | Live |
| **Input sanitisation** | Filename stripped of `<>`. Metadata clamped to max length. | Live |
| **CORS whitelist** | Explicit origin list. No `*` in production. | Live |
| **PKCE auth flow** | Cognito OAuth with code verifier — no implicit flow. | Live |

### 3.3 Top 10 Risks & Mitigation

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|-----------|------------|
| 1 | **Malicious file upload (PDF exploit)** | High | Medium | Magic-bytes validation in worker. Future: antivirus scan (ClamAV layer or S3 Malware Protection). Do not serve uploaded files back to users — only processed outputs. |
| 2 | **Presigned URL leakage** | High | Low | 15-min expiry. URLs scoped to single S3 key. HTTPS only. No URL logging in frontend. POST policy (upgrade) further restricts what the URL can do. |
| 3 | **JWT token theft (XSS)** | High | Low | Tokens in `sessionStorage` (not `localStorage` — cleared on tab close). CSP headers configured in Amplify. No inline scripts. 5-min idle warning + auto-logout. |
| 4 | **Job enumeration / IDOR** | High | Low | UUIDv4 job IDs (unguessable). Server-side ownership check on every read. 403 on mismatch (not 404, to avoid oracle). |
| 5 | **Client-side validation bypass (file size)** | Medium | Medium | **Mitigated by presigned POST upgrade:** S3 POST policy enforces `content-length-range` server-side. Attacker cannot upload >200 MB even with curl. |
| 6 | **Denial of service via large uploads** | Medium | Medium | S3 POST policy size limit. WAF rate limiting. API throttling. Incomplete multipart cleanup (1-day lifecycle rule). |
| 7 | **Worker Lambda abuse (slow processing)** | Medium | Low | 5-min Lambda timeout. S3 trigger is internal (not user-invokable). Monitor with CloudWatch alarms. |
| 8 | **CORS misconfiguration** | Medium | Low | Explicit origin whitelist deployed via parameter. Reviewed in template. No wildcard in prod. |
| 9 | **S3 bucket policy drift** | Medium | Low | `PublicAccessBlockConfiguration` on all four settings. No bucket policy — access is IAM-scoped only. IaC (SAM) ensures consistency. |
| 10 | **Stale JWKS cache** | Low | Low | 6-hour cache with forced refresh on miss. Key rotation at Cognito is gradual (old key valid during rotation window). |

**Recommended future enhancements:**
- S3 Malware Protection or ClamAV Lambda layer for upload scanning
- CloudTrail data events on the uploads bucket for forensic audit
- VPC endpoint for S3 (remove internet path for worker → S3)
- Cognito advanced security features (compromised credentials, adaptive auth)

---

## 4. GDPR / UK Data Protection Compliance Notes

> **Context:** UK GDPR and the Data Protection Act 2018 apply. Clients are political organisations handling electoral/campaign data which may include personal data of voters and members.

### 4.1 Roles: Controller vs Processor

| Role | Entity | Rationale |
|------|--------|-----------|
| **Data Controller** | The client (political party, CLA, campaign group) | They determine the purpose and means of processing. They decide what data to upload and why. |
| **Data Processor** | Political Solutions Ltd | We process data on the client's instructions. We provide the platform and processing capability. We do not determine the purpose. |

**Positioning recommendation:** Position Political Solutions as a **data processor** in all contracts. This means:
- We act only on documented instructions from the controller
- We must have a Data Processing Agreement (DPA) with each client
- We must implement appropriate technical and organisational measures
- We must notify the controller without undue delay of any personal data breach

### 4.2 Data Minimisation & Retention Policy

| Data type | What we store | Retention recommendation | Rationale |
|-----------|--------------|------------------------|-----------|
| **Uploaded files** (S3 `uploads/` prefix) | Raw PDF/CSV/XLSX as uploaded | **90 days**, then auto-delete via S3 lifecycle rule | We don't need originals after processing. Clients should keep their own copies. |
| **Output files** (S3 `outputs/` prefix) | Processed results (CSV) | **90 days**, then auto-delete | Same rationale. Clients should download promptly. |
| **Job metadata** (DynamoDB) | jobId, userSub, filename, fileType, status, timestamps, clientName, notes | **12 months**, then TTL delete | Needed for audit trail and support. No file content stored here. |
| **CloudWatch logs** | Structured JSON: jobId, status transitions, errors | **90 days** (Lambda log groups), **14 days** (WAF logs) | Ops and security investigation. No PII in logs (see section 5). |
| **Cognito tokens** | In `sessionStorage` only (browser) | Cleared on tab close + 5-min idle logout | Never stored server-side beyond JWT verification. |

**Action items:**
- [ ] Add S3 lifecycle rule: delete objects in `uploads/` and `outputs/` prefixes after 90 days
- [ ] Add DynamoDB TTL attribute (`expiresAt`) set to createdAt + 12 months
- [ ] Document retention policy in client-facing privacy notice

### 4.3 Access Control & Auditability

| Requirement | Implementation |
|-------------|---------------|
| **User can only access their own data** | `userSub` ownership check on every API call. GSI scoped by `userSub`. |
| **No admin bulk-access API** | No list-all-jobs endpoint. Only per-user queries. |
| **Subject Access Request (SAR)** support | Query DynamoDB by `userSub` (GSI). Export all jobs + download outputs. Can be scripted. |
| **Right to erasure** | Delete DynamoDB records by `userSub`. Delete S3 objects by prefix `uploads/{userSub}/` and `outputs/`. Can be scripted. |
| **Audit log** | CloudWatch logs contain jobId, status transitions, timestamps. No file content logged. |
| **Breach notification** | CloudWatch alarms on errors. Manual process to assess and notify within 72 hours. |

**Recommendation:** Build a simple admin CLI script for SAR and erasure requests before going to >10 clients.

### 4.4 Suggested Contract / Terms Clauses (Bullet Points)

**Data Processing Agreement (DPA) — key clauses:**
- Processor shall process personal data only on documented instructions from the Controller
- Processor shall ensure persons authorised to process personal data have committed to confidentiality
- Processor shall implement appropriate technical measures (encryption at rest and in transit, access controls, regular testing)
- Processor shall not engage a sub-processor without prior written authorisation from the Controller (note: AWS is our sub-processor)
- Processor shall assist the Controller in ensuring compliance with Articles 32–36 (security, DPIA, breach notification)
- Processor shall delete or return all personal data after the end of the provision of services, at the choice of the Controller
- Processor shall make available all information necessary to demonstrate compliance and allow for audits

**Terms of Service — upload-specific clauses:**
- Client is responsible for ensuring they have lawful basis to process any personal data they upload
- Client must not upload special category data (racial/ethnic origin, political opinions, health data) unless they have explicit consent or other Article 9 basis — note: political opinion data IS special category under UK GDPR
- Maximum file size: 200 MB per file
- Files are retained for 90 days, then automatically deleted
- Client should download processed outputs promptly and maintain their own backups
- Political Solutions is not responsible for the accuracy or completeness of uploaded data

> **Critical note for political clients:** Electoral register data and canvass data containing political opinions is **special category data** under UK GDPR Article 9. Clients must ensure they have appropriate lawful basis (typically "legitimate activities" under Art 9(2)(d) for political parties processing member/supporter data, or substantial public interest under Schedule 1 DPA 2018 for electoral activities).

---

## 5. Observability & Ops Runbook

### 5.1 What to Log

**API Handler (`handler.mjs`):**
- Log: request method, path, response status code, userSub (hashed or truncated), jobId, latency
- Log: auth failures (missing token, expired token, invalid signature) with request origin
- Log: validation failures (invalid fileType, missing filename) with sanitised input summary
- Log: unhandled errors with full stack trace

**Worker (`worker.mjs`):**
- Log: `worker_start` — jobId, filename, S3 key
- Log: `worker_succeeded` — jobId, outputKey, processing duration
- Log: `worker_failed` — jobId, error message, error stack
- Log: `worker_skip` — reason (unexpected key format, job not found)

### 5.2 What NOT to Log

- File contents or file buffers
- Full JWT tokens (log only last 8 chars if needed for correlation)
- `clientName` or `notes` metadata (may contain PII)
- Full filenames if they may contain PII (log extension + size only, or hash the name)
- Cognito user email or name (use `userSub` only)
- S3 presigned URLs (contain signature — treat as secrets)

### 5.3 Metrics & Alerts

| Metric | Source | Alert threshold | Action |
|--------|--------|----------------|--------|
| **API Lambda errors** | CloudWatch `AWS/Lambda` Errors | ≥1 in 5 min | Investigate logs. Check for auth config issues or DynamoDB throttling. |
| **Worker Lambda errors** | CloudWatch `AWS/Lambda` Errors | ≥1 in 5 min | Check worker logs for processing failures. May indicate bad file or code bug. |
| **API 5xx rate** | CloudWatch Logs filter | >5% of requests in 5 min | Check Lambda logs + DynamoDB metrics. |
| **Worker duration** | CloudWatch `AWS/Lambda` Duration | p99 >60 s | Worker may be processing unexpectedly large files. Review file sizes. |
| **WAF blocked requests** | WAF CloudWatch metrics | >100 blocked/5 min | Possible attack. Review WAF sampled requests. |
| **Jobs stuck in PROCESSING** | Custom metric (DynamoDB scan) | Any job PROCESSING >10 min | See troubleshooting below. |
| **S3 storage growth** | CloudWatch `AWS/S3` BucketSizeBytes | >50 GB | Verify lifecycle rules are working. Check for retention policy compliance. |

**Future (when SQS queue added):**
- Queue depth (ApproximateNumberOfMessagesVisible)
- Queue age of oldest message
- Dead-letter queue depth (immediate alert on any message)

### 5.4 "When a Job is Stuck" — Troubleshooting Steps

A job is "stuck" if it has been in PROCESSING for >10 minutes (worker timeout is 5 min).

**Step 1: Check worker logs**
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/<WorkerFunctionName> \
  --filter-pattern '"<jobId>"' \
  --start-time <epoch_ms> \
  --region eu-west-2
```
- If `worker_start` exists but no `worker_succeeded` or `worker_failed` → Lambda timed out or crashed
- If no `worker_start` → S3 trigger did not fire

**Step 2: Check S3 event delivery**
```bash
aws s3api head-object \
  --bucket <bucket> \
  --key uploads/<userSub>/<jobId>/<filename> \
  --region eu-west-2
```
- If object exists → trigger should have fired. Check Lambda concurrent executions.
- If object does not exist → upload never completed. Client-side issue.

**Step 3: Check Lambda throttling**
```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Throttles \
  --dimensions Name=FunctionName,Value=<WorkerFunctionName> \
  --start-time <ISO> --end-time <ISO> \
  --period 300 --statistics Sum \
  --region eu-west-2
```

**Step 4: Manual recovery**
```bash
# Update stuck job to FAILED
aws dynamodb update-item \
  --table-name <JobsTable> \
  --key '{"jobId":{"S":"<jobId>"}}' \
  --update-expression "SET #s = :s, updatedAt = :now, #e = :e" \
  --expression-attribute-names '{"#s":"status","#e":"error"}' \
  --expression-attribute-values '{":s":{"S":"FAILED"},":now":{"S":"<ISO>"},":e":{"M":{"message":{"S":"Processing timed out. Please re-upload the file."},"detail":{"S":"Manual recovery by ops."}}}}' \
  --region eu-west-2
```

**Step 5: Re-trigger (if needed)**
- Ask the user to re-upload. There is no retry mechanism in v1.
- Future: add SQS with DLQ for automatic retry.

---

## 6. Cost Model

### 6.1 OCR Approach Comparison

| Approach | Setup complexity | Per-page cost (est.) | Latency (per page) | Scaling | Notes |
|----------|-----------------|---------------------|--------------------|---------| ----- |
| **AWS Textract (async)** | Low — API call | ~$0.015/page (detect text) | ~2–5 s | Auto-scales | Best accuracy. No infra to manage. Supports tables/forms at higher cost ($0.065/page). |
| **Tesseract on Lambda container** | Medium — custom Docker image | ~$0.0005–0.002/page (compute only) | ~3–10 s | Auto-scales (Lambda concurrency) | 10x cheaper at scale. Quality is good but not Textract-level for complex layouts. 10 GB Lambda container limit. |
| **Tesseract on ECS Fargate** | High — task definitions, scaling rules, VPC | ~$0.001–0.003/page (compute) | ~2–8 s | Manual/auto scaling config needed | Best for sustained high volume. Overkill for early stage. |

### 6.2 Per-1000-Pages Cost Estimate

| Cost driver | Textract | Tesseract (Lambda) | Tesseract (Fargate) |
|-------------|---------|-------------------|---------------------|
| OCR processing | $15.00 | $0.50–2.00 | $1.00–3.00 |
| Lambda compute (worker) | $0.10 | $2.00–5.00 | N/A |
| Fargate compute | N/A | N/A | $3.00–8.00 |
| S3 storage (1 month, ~500 MB) | $0.01 | $0.01 | $0.01 |
| S3 requests (PUT/GET) | $0.01 | $0.01 | $0.01 |
| DynamoDB (1000 writes + reads) | $0.01 | $0.01 | $0.01 |
| API Gateway | $0.01 | $0.01 | $0.01 |
| **Total per 1000 pages** | **~$15** | **~$3–7** | **~$4–11** |

**Key cost variables:**
- Pages per document (drives OCR cost linearly)
- Average page complexity (Textract tables/forms cost 4x more)
- Upload volume per month (S3 storage, but negligible)
- Lambda memory/duration settings (Tesseract needs ≥512 MB, ideally 1024 MB)

### 6.3 Recommendation: First Production Approach

**Start with Textract async.** Rationale:

1. **Lowest engineering effort.** Single API call per document. No Docker images, no Tesseract binaries, no language packs.
2. **Best accuracy.** Marked registers have complex multi-column layouts — Textract handles these far better than Tesseract out of the box.
3. **Cost is acceptable at early stage.** At 10 clients doing 500 pages/month each = 5,000 pages/month = ~$75/month. Negligible.
4. **Predictable pricing.** No compute tuning. Pay per page.
5. **Easy to swap later.** The worker architecture already supports plugging in a different processing backend. If volume reaches 100k+ pages/month, re-evaluate Tesseract-on-Lambda.

**Migration path:** Textract (now) → Tesseract-on-Lambda (when volume justifies the 5–10x cost saving, probably >50k pages/month).

**Implementation note:** Use Textract `StartDocumentTextDetection` (async) — not the sync API — to handle large PDFs. Poll with `GetDocumentTextDetection`. Worker Lambda starts Textract job, then either:
- (a) Polls within the same invocation (simpler, works if <5 min), or
- (b) Uses SNS/SQS notification (better for large docs, add in v2)

---

## 7. UX Copy Pack

### 7.1 Upload Page — Helper Text & Warnings

**Page intro (below heading):**
> Upload PDF, CSV, or XLSX files for processing. Each file becomes a separate processing job.

**Dropzone text:**
> Drag & drop files here, or **click to browse**

**Dropzone subtitle:**
> Accepted formats: PDF, CSV, XLSX. Maximum file size: 200 MB.

**Processing time expectation (below upload button):**
> Processing usually takes under a minute for CSV or XLSX files and 1–5 minutes for PDFs, depending on the number of pages. You can close this page and return later — your jobs will continue in the background.

**Metadata helper text:**
> *Client name* and *Notes* are optional. Use them to help identify this batch later.

### 7.2 Error Messages

| Scenario | Message |
|----------|---------|
| **Wrong file type (client)** | `Only PDF, CSV, and XLSX files are accepted.` |
| **File too large (client)** | `This file exceeds the 200 MB size limit.` |
| **File too large (server, POST policy)** | `Upload rejected: file exceeds the maximum allowed size.` |
| **Upload failed (network)** | `Upload failed. Please check your connection and try again.` |
| **Upload failed (S3 error)** | `Upload failed. Please try again. If the problem persists, contact support.` |
| **Processing failed (generic)** | `Processing failed. Please check the file and try again, or contact support.` |
| **Processing failed (empty CSV)** | `This CSV file is empty or contains no data rows.` |
| **Processing failed (invalid PDF)** | `This file does not appear to be a valid PDF.` |
| **Auth expired** | `Your session has expired. Please sign in again to continue.` |
| **Job not found** | `This job could not be found.` |
| **Download not ready** | `This job is still processing. Please wait for it to complete.` |
| **API unavailable** | `The service is temporarily unavailable. Please try again shortly.` |

### 7.3 Status Labels & Descriptions

| Status | Label | Badge colour | Short description (tooltip/subtitle) |
|--------|-------|-------------|--------------------------------------|
| `QUEUED` | Queued | Grey (`#e2e8f0` bg, `#475569` text) | Waiting to be processed. |
| `PROCESSING` | Processing | Blue (`#dbeafe` bg, `#1d4ed8` text) | Your file is being processed. This may take a few minutes. |
| `SUCCEEDED` | Complete | Green (`#dcfce7` bg, `#15803d` text) | Processing complete. Download your results below. |
| `FAILED` | Failed | Red (`#fee2e2` bg, `#b91c1c` text) | Something went wrong. See the error details for more information. |

### 7.4 Empty States

**No jobs yet:**
> No processing jobs yet. Upload files above to get started.

**All jobs complete:**
> All jobs have finished processing.

**Load error:**
> Unable to load your jobs. Please try refreshing the page.
