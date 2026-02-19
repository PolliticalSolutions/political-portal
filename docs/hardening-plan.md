# Upload Feature — Hardening Plan (v2)

**Product:** Political Solutions Portal — Upload & Processing Hardening
**Date:** 2026-02-19
**Status:** Implementation plan — ready for engineering handoff
**Scope:** Malware scanning, retention enforcement, burst-load reliability
**Builds on:** `docs/upload-feature-shipping-pack.md` (shipped v1)

> **Assumptions (no questions asked):**
> - All infra remains in `eu-west-2` (London). Single-region, single-account.
> - We're early-stage: <20 clients, <5,000 files/month. Optimise for operational simplicity, not scale.
> - Cognito `sub`-based isolation is the only tenancy boundary. No org-level scoping yet.
> - The worker currently uses aws-sdk v2 (via `createRequire`). We will continue with v2 for these changes to avoid a mid-hardening SDK migration. SDK v3 migration is a separate ticket.
> - The handler already generates presigned URLs (PUT today, POST upgrade in progress). The SQS change decouples the worker from the S3 trigger but does not change the upload path.
> - ClamAV definition updates must not require a redeploy.
> - "Quarantine" means moving the S3 object to a separate prefix — not a separate bucket — to keep IAM simple.
> - Frontend `Uploads.jsx` needs a new `SCANNING` status badge but no other UI changes.

---

## A. Target Architecture

### A.1 End-to-End Flow (Post-Hardening)

```
 Browser                 API Gateway              S3 Bucket
 ──────                  ───────────              ─────────
   │                          │                       │
   │  POST /jobs              │                       │
   │ ────────────────────────>│                       │
   │  ← {jobId, upload{url,fields}}                   │
   │                          │                       │
   │  presigned POST ─────────────────────────────────>│
   │                          │                  ObjectCreated
   │                          │                       │
   │                          │                       ▼
   │                          │               ┌──────────────┐
   │                          │               │  S3 Event     │
   │                          │               │  Notification │
   │                          │               └──────┬───────┘
   │                          │                      │
   │                          │                      ▼
   │                          │               ┌──────────────┐
   │                          │               │   SQS Queue  │
   │                          │               │ (UploadQueue)│
   │                          │               └──────┬───────┘
   │                          │                      │
   │                          │                      ▼
   │                          │          ┌───────────────────────┐
   │                          │          │   Worker Lambda       │
   │                          │          │                       │
   │                          │          │  1. Idempotency check │
   │                          │          │     (DDB conditional) │
   │                          │          │                       │
   │                          │          │  2. Set SCANNING      │
   │                          │          │     (DDB update)      │
   │                          │          │                       │
   │                          │          │  3. ClamAV scan       │
   │                          │          │     - stream from S3  │
   │                          │          │     - clamscan /tmp   │
   │                          │          │                       │
   │                          │          │  4a. INFECTED →       │
   │                          │          │     quarantine S3 obj │
   │                          │          │     set FAILED + alert│
   │                          │          │                       │
   │                          │          │  4b. CLEAN →          │
   │                          │          │     set PROCESSING    │
   │                          │          │     run file process  │
   │                          │          │     write outputs/    │
   │                          │          │     set SUCCEEDED     │
   │                          │          │                       │
   │                          │          │  4c. SCAN_ERROR →     │
   │                          │          │     retry via SQS     │
   │                          │          │     or DLQ after 3x   │
   │                          │          └───────────────────────┘
   │                          │
   │  GET /jobs/{id}          │
   │ ────────────────────────>│ ← job with status SCANNING/PROCESSING/etc
   │                          │
   │  GET /jobs/{id}/download │
   │ ────────────────────────>│ ← presigned GET for outputs/ (only if SUCCEEDED)
```

### A.2 Job State Machine (Post-Hardening)

```
                  ┌──────────┐
   POST /jobs  →  │  QUEUED  │
                  └────┬─────┘
                       │  SQS delivers message to worker
                       ▼
                  ┌──────────┐
                  │ SCANNING │  ← NEW STATE
                  └──┬────┬──┘
                     │    │
               clean │    │ infected / scan error after 3 retries
                     │    │
                     ▼    └──────────────────┐
                ┌────────────┐               │
                │ PROCESSING │               │
                └──┬──────┬──┘               │
                   │      │                  │
          success  │      │  error           │
                   ▼      ▼                  ▼
            ┌──────────┐ ┌────────────────────┐
            │SUCCEEDED │ │       FAILED       │
            └──────────┘ │  (error.code =     │
                         │   INFECTED /       │
                         │   SCAN_TIMEOUT /   │
                         │   PROCESSING_ERR)  │
                         └────────────────────┘
```

**Transition rules:**
- `QUEUED → SCANNING`: Worker picks up SQS message, conditional write succeeds (idempotency guard).
- `SCANNING → PROCESSING`: ClamAV returns clean.
- `SCANNING → FAILED`: ClamAV returns infected, or scan fails after 3 SQS delivery attempts.
- `PROCESSING → SUCCEEDED`: Output files written to `outputs/{jobId}/`.
- `PROCESSING → FAILED`: Processing error (bad file content, timeout, etc.).
- **No backward transitions.** Terminal states (SUCCEEDED, FAILED) are immutable.
- **Idempotency:** Worker checks `status === "QUEUED"` with a DynamoDB conditional write before moving to SCANNING. Duplicate SQS deliveries for an already-in-progress job are silently dropped.

### A.3 S3 Prefix Layout (Post-Hardening)

```
uploads/{userSub}/{jobId}/{filename}     ← raw uploads
outputs/{jobId}/result.csv               ← processed output (existing)
quarantine/{jobId}/{filename}            ← infected files moved here
```

### A.4 DynamoDB Record (New/Changed Fields)

```javascript
{
  jobId: "uuid",
  userSub: "cognito-sub",
  filename: "register.pdf",
  fileType: "pdf",
  s3Key: "uploads/{userSub}/{jobId}/{filename}",
  status: "QUEUED" | "SCANNING" | "PROCESSING" | "SUCCEEDED" | "FAILED",  // SCANNING is new
  createdAt: "2026-02-19T10:00:00.000Z",
  updatedAt: "2026-02-19T10:00:05.000Z",
  expiresAt: 1771459200,            // NEW: Unix epoch (createdAt + 12 months). DynamoDB TTL attribute.
  scanResult: {                      // NEW: populated after scan
    verdict: "CLEAN" | "INFECTED" | "ERROR",
    engine: "clamav",
    definitionDate: "2026-02-19",    // date of ClamAV definitions used
    scannedAt: "ISO-8601",
    detail: "Win.Trojan.Agent-123"   // only if infected; empty string otherwise
  },
  metadata: { clientName, notes },
  output: { ... },                   // only if SUCCEEDED
  error: { message, detail, code }   // code field is NEW (e.g. "INFECTED", "SCAN_TIMEOUT", "PROCESSING_ERR")
}
```

---

## B. Phased Implementation Plan

### Phase 1: Retention Enforcement (S3 Lifecycle + DynamoDB TTL)

**Goal:** Automate data deletion per GDPR retention policy. Lowest risk, no code flow changes.

**Acceptance criteria:**
- S3 objects in `uploads/` and `outputs/` auto-expire after 90 days
- S3 objects in `quarantine/` auto-expire after 30 days
- DynamoDB records auto-delete 12 months after creation
- `expiresAt` field written on every new job
- Existing jobs backfilled with `expiresAt` via one-off script
- `sam validate` passes, deploy succeeds

**Code touchpoints:**

| File | Change |
|------|--------|
| `infra/upload-api/template.yaml` | Add 3 S3 lifecycle rules (uploads/ 90d, outputs/ 90d, quarantine/ 30d). Enable DynamoDB TTL on `expiresAt` attribute. |
| `infra/upload-api/src/handler.mjs` | In `handleCreateJob`: compute `expiresAt` = `Math.floor(Date.now()/1000) + 365*24*60*60` and include in DynamoDB `put`. |
| `infra/upload-api/test/handler.test.mjs` | Assert `expiresAt` is present and is a number ~12 months from now. |
| `scripts/backfill-ttl.mjs` | NEW: One-off script to scan all existing jobs and set `expiresAt` = createdAt + 12 months. |

**Failure handling:** None — this is infrastructure config. If lifecycle rules misconfigure, objects persist (safe default). TTL deletion is best-effort (items may persist up to 48 hours past expiry — acceptable).

---

### Phase 2: Reliability — S3 → SQS → Worker with DLQ

**Goal:** Decouple S3 events from Lambda invocation. Add retry and dead-letter handling.

**Acceptance criteria:**
- S3 ObjectCreated sends notification to SQS (not directly to Lambda)
- Worker Lambda triggered by SQS with batch size 1
- DLQ receives messages after 3 failed processing attempts
- Worker is idempotent: duplicate SQS messages do not re-process a job already past QUEUED
- DLQ alarm fires when any message arrives
- Existing happy-path still works (upload → scan placeholder → process → SUCCEEDED)
- Manual DLQ redrive procedure documented and tested

**Code touchpoints:**

| File | Change |
|------|--------|
| `infra/upload-api/template.yaml` | Remove `S3Upload` event from WorkerFunction. Add `UploadQueue` (SQS), `UploadDLQ` (SQS), S3 bucket notification → SQS. Add SQS event source on WorkerFunction. Add DLQ alarm. Add SQS IAM policies. |
| `infra/upload-api/src/worker.mjs` | Change `handler` to parse SQS event (`event.Records[].body` → parse S3 event notification). Add idempotency check: conditional DynamoDB update `status = "QUEUED"` → `"SCANNING"` (or `"PROCESSING"` if scan not yet added). Return success to SQS on completion; throw to trigger retry. |
| `infra/upload-api/test/worker.test.mjs` | NEW/extend: Test SQS message parsing, idempotency (duplicate message), DLQ scenario (simulated). |
| `scripts/deploy-upload-api.sh` | No change needed (SAM handles new resources). |

**Failure handling:**

| Failure | Behaviour |
|---------|-----------|
| Worker throws unhandled error | SQS retries (visibility timeout = 6 min). After 3 attempts → DLQ. |
| Worker times out (5 min) | SQS retries. Same 3-attempt → DLQ path. |
| S3 event notification fails to reach SQS | S3 retries delivery. SQS is highly durable. |
| Duplicate SQS delivery | Idempotency check: DynamoDB conditional update fails silently, message deleted from queue. |
| DLQ receives message | CloudWatch alarm fires. Ops manually inspects and either redrives or fails the job. |

**SAM template additions (key resources):**

```yaml
UploadDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: !Sub "${AWS::StackName}-upload-dlq"
    MessageRetentionPeriod: 1209600  # 14 days

UploadQueue:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: !Sub "${AWS::StackName}-upload-queue"
    VisibilityTimeout: 360  # 6x Lambda timeout (60s scan + 300s process worst case)
    MessageRetentionPeriod: 86400  # 1 day
    RedrivePolicy:
      deadLetterTargetArn: !GetAtt UploadDLQ.Arn
      maxReceiveCount: 3

UploadQueuePolicy:
  Type: AWS::SQS::QueuePolicy
  Properties:
    Queues: [!Ref UploadQueue]
    PolicyDocument:
      Statement:
        - Effect: Allow
          Principal:
            Service: s3.amazonaws.com
          Action: sqs:SendMessage
          Resource: !GetAtt UploadQueue.Arn
          Condition:
            ArnEquals:
              aws:SourceArn: !GetAtt UploadsBucket.Arn
```

**Worker event parsing change:**

```javascript
// Before (S3 direct trigger):
// event.Records[].s3.bucket.name / event.Records[].s3.object.key

// After (SQS wrapping S3 notification):
// event.Records[].body → JSON.parse → .Records[0].s3.bucket.name / .s3.object.key
```

---

### Phase 3: Malware Scanning (ClamAV on Lambda)

**Goal:** Scan every uploaded file before processing. Block infected files. Audit trail.

**Acceptance criteria:**
- Every upload is scanned before any processing begins
- Infected files: job → FAILED with `error.code = "INFECTED"`, file moved to `quarantine/` prefix, SNS alert sent
- Clean files: job → PROCESSING → normal pipeline
- Scan errors (ClamAV crash, timeout): SQS retries up to 3x, then DLQ
- `scanResult` field written to DynamoDB on every job
- ClamAV definitions update daily via EFS (no redeploy)
- Frontend shows `SCANNING` status badge (amber/yellow)
- Scan adds <15 s latency for files under 50 MB

**Code touchpoints:**

| File | Change |
|------|--------|
| `infra/upload-api/template.yaml` | Add ClamAV definitions EFS filesystem + access point. Add definition-updater Lambda (daily schedule). Worker Lambda: add EFS mount, increase memory to 2048 MB, increase timeout to 900 s. Add SNS topic for infection alerts. Add `quarantine/` lifecycle rule (30 days). |
| `infra/upload-api/src/worker.mjs` | Add scan step between idempotency check and processing: download to /tmp, run `clamscan` with definitions from EFS, parse result, update DynamoDB `scanResult`, handle INFECTED/CLEAN/ERROR. |
| `infra/upload-api/src/scan.mjs` | NEW: ClamAV scanning module. Downloads S3 object to /tmp, runs `clamscan` binary (from Lambda layer), returns verdict. Handles timeout. |
| `infra/upload-api/src/definition-updater.mjs` | NEW: Scheduled Lambda that runs `freshclam` to update ClamAV definitions on EFS. |
| `infra/upload-api/test/worker.test.mjs` | Add scan mock: test CLEAN path, INFECTED path, scan timeout path. |
| `src/pages/portal/Uploads.jsx` | Add `SCANNING` to `StatusBadge` styles/labels (amber). Add `SCANNING` to active-job polling filter. |

**Failure handling at each scan outcome:**

| Outcome | Job status | S3 action | DynamoDB `scanResult.verdict` | Alert |
|---------|-----------|-----------|-------------------------------|-------|
| CLEAN | → PROCESSING | None (file stays in uploads/) | `CLEAN` | None |
| INFECTED | → FAILED | Copy to `quarantine/{jobId}/`, delete from `uploads/` | `INFECTED` | SNS notification |
| Scan error (retryable) | stays SCANNING | None | Not written yet | None (retry) |
| Scan error (3x exhausted, DLQ) | → FAILED (manual) | None | `ERROR` | DLQ alarm |
| File >200 MB (should not happen) | → FAILED | None | `ERROR` with detail | Log warning |
| ClamAV binary missing/corrupt | → stays SCANNING, SQS retries | None | Not written | Lambda error alarm |

---

## C. Malware Scanning Design

### C.1 Options Comparison

| Approach | Setup effort | Scan latency (50 MB file) | Monthly cost (5k files) | Definition freshness | Notes |
|----------|-------------|--------------------------|------------------------|---------------------|-------|
| **Lambda + ClamAV layer + EFS** | Medium | 5–15 s | ~$5–15 (Lambda compute + EFS) | Daily via `freshclam` on EFS | Open source. Full control. Well-documented pattern (bucket-antivirus). |
| **Fargate ClamAV service** | High | 3–10 s | ~$30–50 (always-on task or scale-to-zero with delay) | Daily via `freshclam` in container | Overkill. Need VPC, ALB or direct invoke. Unnecessary for our volume. |
| **Third-party SaaS (e.g. Trend Micro File Storage Security, Sophos Intelix)** | Low | 2–5 s | ~$50–200 (per-scan pricing) | Managed | Easy but expensive. Data leaves our AWS account (GDPR concern for political data). |

### C.2 Recommendation: Lambda + ClamAV Layer + EFS

**Why:** Best fit for early-stage, UK political data context.

1. **Data stays in-region.** File bytes never leave our S3 bucket / Lambda execution environment in `eu-west-2`. Critical for GDPR positioning with political clients handling special category data.
2. **Cost-effective at our volume.** 5,000 files/month = ~$10/month in Lambda compute. No per-scan licensing fees.
3. **Operational simplicity.** One Lambda layer (ClamAV binaries), one EFS volume (definitions), one scheduled Lambda (daily `freshclam`). All in SAM template. No VPC required for the scanner itself — EFS access point is sufficient.
4. **Proven pattern.** AWS-documented architecture. Multiple open-source implementations (e.g. `clamav-lambda-layer`).
5. **Swap path.** If we outgrow Lambda limits or need real-time streaming scan, migrate to Fargate. The `scan.mjs` module is isolated and replaceable.

### C.3 Implementation Detail

#### How we fetch the object

```javascript
// In worker.mjs, after idempotency check, before processing:

import { scanFile } from "./scan.mjs";

// 1. Download S3 object to Lambda /tmp (max 10 GB ephemeral)
const tmpPath = `/tmp/${jobId}-${Date.now()}`;
const s3Stream = s3.getObject({ Bucket: bucket, Key: key }).createReadStream();
const fileStream = fs.createWriteStream(tmpPath);
await pipeline(s3Stream, fileStream);

// 2. Run scan
const result = await scanFile(tmpPath, { definitionsDir: EFS_MOUNT_PATH });

// 3. Clean up /tmp immediately
fs.unlinkSync(tmpPath);
```

**Key:** We stream the file; we never buffer the entire file in Lambda memory. The 10 GB `/tmp` storage in Lambda supports our 200 MB max file size comfortably.

#### How we avoid logging sensitive contents

- `scan.mjs` logs: `{ stage: "scan_complete", jobId, verdict, signatureName, durationMs }` — never file bytes, file paths containing PII, or file content.
- ClamAV stdout is captured only for the verdict line. Full output is discarded.
- `/tmp` files are deleted in a `finally` block to prevent data leakage across warm Lambda invocations.
- The `--no-summary` flag on `clamscan` suppresses verbose output that could contain filename fragments.

```javascript
// scan.mjs — scanFile function
export async function scanFile(filePath, { definitionsDir }) {
  const args = [
    "--no-summary",
    "--stdout",
    `--database=${definitionsDir}`,
    filePath,
  ];

  const { exitCode, stdout } = await execClamscan(args, { timeoutMs: 60_000 });

  // Exit codes: 0 = clean, 1 = infected, 2 = error
  if (exitCode === 0) {
    return { verdict: "CLEAN", detail: "" };
  }
  if (exitCode === 1) {
    // Extract signature name from "filepath: SignatureName FOUND"
    const match = stdout.match(/:\s+(.+)\s+FOUND/);
    return { verdict: "INFECTED", detail: match?.[1] || "unknown" };
  }
  // exitCode === 2 or other
  throw new Error(`ClamAV scan error (exit ${exitCode})`);
}
```

#### How we handle timeouts / large files

| Concern | Mitigation |
|---------|------------|
| ClamAV scan timeout | `execClamscan` has 60-second timeout. On timeout, the child process is killed, error thrown, SQS retries. |
| Lambda overall timeout | Set to 900 s (15 min). Worst case: 200 MB download (~10 s on Lambda network) + 60 s scan + 300 s processing = well within limit. |
| `/tmp` space | Max file = 200 MB. Lambda has 10 GB `/tmp`. Single file at a time (batch size = 1). Safe. |
| File >200 MB somehow uploaded | Scan will still attempt. If it exceeds `/tmp` or times out, treated as scan error → retry → DLQ. |
| EFS definitions missing/corrupt | `freshclam` Lambda runs daily. If definitions are missing, `clamscan` returns exit code 2 → scan error → retry. Alert via Lambda error alarm. |

#### How we store scan results (DynamoDB)

Added to every job record after scan completes:

```javascript
// In worker.mjs, after scanFile returns:
await updateJobStatus(jobId, nextStatus, {
  scanResult: {
    verdict: result.verdict,        // "CLEAN" | "INFECTED" | "ERROR"
    engine: "clamav",
    definitionDate: getDefDate(),   // parsed from definitions dir
    scannedAt: new Date().toISOString(),
    detail: result.detail,          // signature name if infected, "" if clean
  },
  // ...plus error fields if infected
});
```

#### What happens on "infected"

```javascript
// 1. Move file to quarantine
await s3.copyObject({
  Bucket: UPLOADS_BUCKET,
  CopySource: `${UPLOADS_BUCKET}/${key}`,
  Key: `quarantine/${jobId}/${filename}`,
}).promise();
await s3.deleteObject({ Bucket: UPLOADS_BUCKET, Key: key }).promise();

// 2. Update job status
await updateJobStatus(jobId, "FAILED", {
  scanResult: { verdict: "INFECTED", ... },
  error: {
    message: "This file was flagged by our security scan and cannot be processed.",
    detail: `ClamAV signature: ${result.detail}`,
    code: "INFECTED",
  },
});

// 3. Publish alert
await sns.publish({
  TopicArn: SCAN_ALERT_TOPIC,
  Subject: `[SECURITY] Infected file upload detected — ${jobId}`,
  Message: JSON.stringify({
    jobId,
    userSub,  // NOT the user's email/name — just the Cognito sub
    filename,
    signature: result.detail,
    timestamp: new Date().toISOString(),
  }),
}).promise();

// 4. Log (no file content)
logEvent("scan_infected", { jobId, signature: result.detail });
```

**Quarantine retention:** 30 days via S3 lifecycle rule. Enough for security investigation if needed.

**User sees:** Job status = FAILED, error message = "This file was flagged by our security scan and cannot be processed." No signature name shown to user (ops-only detail).

---

## D. Retention Enforcement

### D.1 S3 Lifecycle Rules

Add to `UploadsBucket.Properties.LifecycleConfiguration.Rules` in `template.yaml`:

```yaml
# Existing:
- Id: DeleteIncompleteMultipartUploads
  Status: Enabled
  AbortIncompleteMultipartUpload:
    DaysAfterInitiation: 1

# NEW — 90-day expiry for uploads
- Id: ExpireUploads
  Status: Enabled
  Prefix: "uploads/"
  ExpirationInDays: 90

# NEW — 90-day expiry for outputs
- Id: ExpireOutputs
  Status: Enabled
  Prefix: "outputs/"
  ExpirationInDays: 90

# NEW — 30-day expiry for quarantined files
- Id: ExpireQuarantine
  Status: Enabled
  Prefix: "quarantine/"
  ExpirationInDays: 30
```

**Note:** S3 lifecycle rules run once daily (midnight UTC). Objects may persist up to 24 hours past their expiry. This is acceptable for GDPR purposes — the policy is "up to 90 days" not "exactly 90 days."

### D.2 DynamoDB TTL

**Template change:**

```yaml
JobsTable:
  Type: AWS::DynamoDB::Table
  Properties:
    # ... existing config ...
    TimeToLiveSpecification:
      AttributeName: expiresAt
      Enabled: true
```

**`expiresAt` field — written by handler.mjs on job creation:**

```javascript
// In handleCreateJob, when building the item:
const TWELVE_MONTHS_SECONDS = 365 * 24 * 60 * 60;  // 31,536,000
const expiresAt = Math.floor(Date.now() / 1000) + TWELVE_MONTHS_SECONDS;

const item = {
  jobId,
  userSub,
  filename,
  fileType,
  s3Key,
  status: "QUEUED",
  createdAt: now,
  updatedAt: now,
  expiresAt,           // <-- NEW: Unix epoch seconds
  metadata: { clientName, notes },
};
```

**DynamoDB TTL behaviour:**
- Items deleted within ~48 hours after `expiresAt` passes (best-effort, usually faster).
- Deleted items still appear in DynamoDB Streams (with `eventName: "REMOVE"` and `userIdentity.type: "Service"`) — useful if we need to trigger cleanup actions later.
- TTL deletes do not consume write capacity (free).

### D.3 Backfill Script for Existing Jobs

Create `scripts/backfill-ttl.mjs`:

```javascript
// Scans all items in JobsTable, sets expiresAt = createdAt + 12 months
// Run once after deploy: node scripts/backfill-ttl.mjs

import AWS from "aws-sdk";
const dynamo = new AWS.DynamoDB.DocumentClient({ region: "eu-west-2" });
const TABLE = process.env.JOBS_TABLE || "ps-upload-api-prod-jobs";
const TWELVE_MONTHS_S = 365 * 24 * 60 * 60;

let lastKey = undefined;
let updated = 0;

do {
  const result = await dynamo.scan({
    TableName: TABLE,
    FilterExpression: "attribute_not_exists(expiresAt)",
    ExclusiveStartKey: lastKey,
  }).promise();

  for (const item of result.Items || []) {
    const createdEpoch = Math.floor(new Date(item.createdAt).getTime() / 1000);
    const expiresAt = createdEpoch + TWELVE_MONTHS_S;
    await dynamo.update({
      TableName: TABLE,
      Key: { jobId: item.jobId },
      UpdateExpression: "SET expiresAt = :ttl",
      ExpressionAttributeValues: { ":ttl": expiresAt },
      ConditionExpression: "attribute_not_exists(expiresAt)",
    }).promise().catch(() => {}); // skip if already set
    updated++;
  }

  lastKey = result.LastEvaluatedKey;
} while (lastKey);

console.log(`Backfilled ${updated} items.`);
```

### D.4 Legal / Ops Nuances

**Per-client retention extension:**
- Default: 90 days files, 12 months metadata. Stated in DPA and terms.
- If a client contractually requires longer retention: override `expiresAt` on their jobs at creation time. Add a `retentionOverrideDays` field to the job metadata. The handler computes: `expiresAt = createdAt + max(365, retentionOverrideDays) * 86400`.
- S3 lifecycle rules cannot be per-object. If a client needs files kept >90 days, we would need to copy to a `retained/` prefix with a longer or no lifecycle rule. **Recommendation:** Cross that bridge when a client asks. For now, document that 90 days is the standard.

**Legal hold:**
- If we receive a legal hold request (e.g. ICO investigation, litigation), we must:
  1. Disable TTL on the specific items (set `expiresAt` to a far-future value, e.g. year 2099).
  2. Copy affected S3 objects to a `legal-hold/` prefix with no lifecycle rule.
  3. Document in an internal register which jobs are under hold and why.
- **Implementation:** Manual ops process for now. Automate if frequency warrants it.

**Subject Access Request (SAR) support:**
- Query DynamoDB GSI by `userSub` to find all jobs.
- For each job, generate presigned GET URLs for files in `uploads/` and `outputs/`.
- Package into a ZIP and send to the requesting client (data controller).
- **Script needed:** `scripts/sar-export.mjs` — takes a `userSub`, exports all jobs + files. Build this before going to >10 clients.

**Right to erasure:**
- Delete DynamoDB records by `userSub` (scan + batch delete).
- Delete S3 objects by prefix: `uploads/{userSub}/`, `outputs/` for matching jobIds.
- Log the erasure action for audit purposes.
- **Caveat:** If the user's files have been quarantined, quarantine copies must also be deleted on erasure request.

---

## E. Reliability Under Burst

### E.1 Architecture: S3 → SQS → Lambda Worker

**Current (v1):** S3 `ObjectCreated` event directly invokes Worker Lambda.
**Problem:** S3 → Lambda has no built-in retry with backoff. If Lambda is throttled or errors, S3 retries with exponential backoff but offers no visibility. No DLQ. No concurrency control.

**Target (v2):** S3 → SQS → Lambda.
- S3 sends event notification to SQS queue.
- Lambda polls SQS with batch size 1.
- Failed messages retry via SQS visibility timeout.
- After 3 failures: message moves to DLQ.

### E.2 SQS Configuration

```yaml
UploadDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: !Sub "${AWS::StackName}-upload-dlq"
    MessageRetentionPeriod: 1209600  # 14 days

UploadQueue:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: !Sub "${AWS::StackName}-upload-queue"
    VisibilityTimeout: 960   # Must be >= 6x Lambda timeout. Lambda=900s → 960s.
    MessageRetentionPeriod: 86400  # 1 day
    RedrivePolicy:
      deadLetterTargetArn: !GetAtt UploadDLQ.Arn
      maxReceiveCount: 3

# S3 → SQS permission
UploadQueuePolicy:
  Type: AWS::SQS::QueuePolicy
  Properties:
    Queues: [!Ref UploadQueue]
    PolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Effect: Allow
          Principal:
            Service: s3.amazonaws.com
          Action: sqs:SendMessage
          Resource: !GetAtt UploadQueue.Arn
          Condition:
            ArnEquals:
              aws:SourceArn: !GetAtt UploadsBucket.Arn
```

**S3 bucket notification (replaces the current S3→Lambda event on WorkerFunction):**

```yaml
UploadsBucket:
  Type: AWS::S3::Bucket
  DependsOn: UploadQueuePolicy  # Must exist before notification config
  Properties:
    # ... existing properties ...
    NotificationConfiguration:
      QueueConfigurations:
        - Event: "s3:ObjectCreated:*"
          Queue: !GetAtt UploadQueue.Arn
          Filter:
            S3Key:
              Rules:
                - Name: prefix
                  Value: "uploads/"
```

**Worker Lambda SQS event source:**

```yaml
WorkerFunction:
  Properties:
    # ... existing ...
    Events:
      # REMOVE the existing S3Upload event
      SQSUpload:                     # NEW
        Type: SQS
        Properties:
          Queue: !GetAtt UploadQueue.Arn
          BatchSize: 1               # Process one file at a time
          FunctionResponseTypes:
            - ReportBatchItemFailures  # Partial batch failure reporting
```

### E.3 Idempotency

**Problem:** SQS delivers at-least-once. The same S3 event may be delivered 2+ times. We must not process the same file twice.

**Solution:** DynamoDB conditional write as an idempotency gate.

```javascript
// In worker.mjs, first thing after extracting jobId from the SQS message:

async function claimJob(jobId) {
  try {
    await dynamo.update({
      TableName: JOBS_TABLE,
      Key: { jobId },
      UpdateExpression: "SET #status = :scanning, updatedAt = :now",
      ConditionExpression: "#status = :queued",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":scanning": "SCANNING",
        ":queued": "QUEUED",
        ":now": new Date().toISOString(),
      },
    }).promise();
    return true; // We own this job now
  } catch (err) {
    if (err.code === "ConditionalCheckFailedException") {
      return false; // Another invocation already claimed it
    }
    throw err; // Real error — let SQS retry
  }
}

// Usage:
const claimed = await claimJob(jobId);
if (!claimed) {
  logEvent("worker_skip", { reason: "already_claimed", jobId });
  return; // Message will be deleted from SQS (success return)
}
```

**Why this works:**
- `ConditionExpression: "#status = :queued"` ensures only the first invocation transitions the job.
- Second delivery finds `status = "SCANNING"` → conditional check fails → worker returns success → SQS deletes the message.
- No external locking service needed. DynamoDB conditional writes are strongly consistent on the primary key.

### E.4 Concurrency Limits and Backoff

**Lambda reserved concurrency:**
- Set `ReservedConcurrentExecutions: 5` on WorkerFunction initially.
- Rationale: ClamAV + file processing is memory/CPU intensive. 5 concurrent scans at 2048 MB each = 10 GB total Lambda memory. Prevents runaway scaling during a burst.
- SQS will hold excess messages until a Lambda slot frees up. Visibility timeout covers the wait.

**Backoff strategy:**
- SQS native: message becomes visible again after `VisibilityTimeout` (960 s). This is effectively the retry delay.
- After 3 receives: message goes to DLQ.
- No application-level exponential backoff needed — SQS handles it.

**Burst scenario (e.g. client uploads 50 files at once):**
1. 50 S3 events → 50 SQS messages.
2. Lambda pulls 5 at a time (concurrency limit).
3. Each takes ~30–60 s for scan + process.
4. All 50 processed within ~10 minutes.
5. If any fail: retry twice more. If still failing: DLQ.

### E.5 DLQ Redrive / Replay Procedure

**When DLQ alarm fires:**

1. **Inspect the message:**
```bash
aws sqs receive-message \
  --queue-url <DLQ_URL> \
  --max-number-of-messages 1 \
  --region eu-west-2
```

2. **Identify the job:** Parse `Body` → S3 event → extract jobId from key.

3. **Check job status:**
```bash
aws dynamodb get-item \
  --table-name <JobsTable> \
  --key '{"jobId":{"S":"<jobId>"}}' \
  --region eu-west-2
```

4. **Decide:**
   - If job is SCANNING/PROCESSING (stuck): manually FAIL it (see runbook in section F).
   - If job is QUEUED (never claimed): safe to retry — redrive the message.
   - If job is SUCCEEDED/FAILED: the DLQ message is stale — delete it.

5. **Redrive (if retrying):**
```bash
aws sqs start-message-move-task \
  --source-arn <DLQ_ARN> \
  --destination-arn <MAIN_QUEUE_ARN> \
  --region eu-west-2
```
Or manually: delete from DLQ, reset job status to QUEUED, re-enqueue.

6. **Permanent failure:** Update job to FAILED with appropriate error.

---

## F. Observability & Alerting

### F.1 Metrics to Emit

| Metric | Namespace | Source | Dimensions |
|--------|-----------|--------|------------|
| `ScanDuration` | `PoliticalSolutions/Upload` | Worker Lambda (custom metric) | `Verdict` (CLEAN/INFECTED/ERROR) |
| `ScanVerdict` | `PoliticalSolutions/Upload` | Worker Lambda (custom metric) | `Verdict` |
| `ProcessingDuration` | `PoliticalSolutions/Upload` | Worker Lambda (custom metric) | `FileType` (pdf/csv) |
| `JobStatus` | `PoliticalSolutions/Upload` | Worker Lambda (custom metric) | `Status` (SUCCEEDED/FAILED) |
| `ApproximateNumberOfMessagesVisible` | `AWS/SQS` | SQS (automatic) | `QueueName` |
| `ApproximateAgeOfOldestMessage` | `AWS/SQS` | SQS (automatic) | `QueueName` |
| `ApproximateNumberOfMessagesVisible` (DLQ) | `AWS/SQS` | SQS (automatic) | `QueueName` (DLQ) |
| `NumberOfMessagesSent` | `AWS/SQS` | SQS (automatic) | `QueueName` |

**How to emit custom metrics (in worker.mjs):**

```javascript
const cloudwatch = new AWS.CloudWatch({ region: REGION });

async function emitMetric(name, value, unit, dimensions = []) {
  await cloudwatch.putMetricData({
    Namespace: "PoliticalSolutions/Upload",
    MetricData: [{
      MetricName: name,
      Value: value,
      Unit: unit,
      Dimensions: dimensions,
      Timestamp: new Date(),
    }],
  }).promise();
}

// Usage after scan:
await emitMetric("ScanDuration", scanMs, "Milliseconds", [
  { Name: "Verdict", Value: result.verdict },
]);
```

### F.2 Alerts

| Alert | Metric | Threshold | Action |
|-------|--------|-----------|--------|
| **DLQ has messages** | SQS DLQ `ApproximateNumberOfMessagesVisible` | ≥1 | Immediate: inspect DLQ, identify stuck job, decide retry or fail. |
| **Queue backlog growing** | SQS `ApproximateAgeOfOldestMessage` | >10 min | Check Lambda concurrency. Increase `ReservedConcurrentExecutions` if needed. |
| **Scan failures spike** | Custom `ScanVerdict` where Verdict=ERROR | >3 in 15 min | ClamAV definitions may be corrupt. Check definition-updater Lambda logs. |
| **Infected file detected** | SNS topic (published by worker) | Any message | Review: check jobId, userSub. Consider notifying the client's data controller. |
| **Worker Lambda errors** | `AWS/Lambda` Errors | ≥1 in 5 min | Existing alarm — still relevant. Check logs. |
| **API Lambda errors** | `AWS/Lambda` Errors | ≥1 in 5 min | Existing alarm — still relevant. |
| **S3 storage > 50 GB** | `AWS/S3` BucketSizeBytes | >50 GB | Verify lifecycle rules are active and deleting expired objects. |

**SAM template additions for DLQ alarm:**

```yaml
DLQAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmDescription: Messages in upload DLQ — failed processing requires attention.
    Namespace: AWS/SQS
    MetricName: ApproximateNumberOfMessagesVisible
    Dimensions:
      - Name: QueueName
        Value: !GetAtt UploadDLQ.QueueName
    Statistic: Maximum
    Period: 60
    EvaluationPeriods: 1
    Threshold: 1
    ComparisonOperator: GreaterThanOrEqualToThreshold
    TreatMissingData: notBreaching
    AlarmActions: !If
      - AlarmActionsEnabled
      - - !Ref AlarmTopicArn
      - !Ref AWS::NoValue
```

### F.3 Runbooks

#### "Stuck job" (status = SCANNING or PROCESSING for >15 min)

1. Check worker logs for the jobId:
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/<WorkerFunctionName> \
  --filter-pattern '"<jobId>"' \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --region eu-west-2
```

2. If `worker_start` / `scan_start` exists but no completion → Lambda timed out.
3. Check SQS: is the message still in the main queue (will retry) or in DLQ?
```bash
aws sqs get-queue-attributes \
  --queue-url <QUEUE_URL> \
  --attribute-names ApproximateNumberOfMessagesVisible ApproximateNumberOfMessagesNotVisible \
  --region eu-west-2
```

4. If retries exhausted (message in DLQ): manually fail the job:
```bash
aws dynamodb update-item \
  --table-name <JobsTable> \
  --key '{"jobId":{"S":"<jobId>"}}' \
  --update-expression "SET #s = :s, updatedAt = :now, #e = :e" \
  --expression-attribute-names '{"#s":"status","#e":"error"}' \
  --expression-attribute-values '{
    ":s":{"S":"FAILED"},
    ":now":{"S":"'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"},
    ":e":{"M":{"message":{"S":"Processing timed out after multiple attempts. Please re-upload."},"detail":{"S":"Manual recovery."},"code":{"S":"PROCESSING_TIMEOUT"}}}
  }' \
  --region eu-west-2
```

#### "DLQ rising" (multiple messages in DLQ)

1. Count messages: `aws sqs get-queue-attributes --queue-url <DLQ_URL> --attribute-names ApproximateNumberOfMessagesVisible`
2. Sample a few messages to identify the pattern (same user? same file type? same error?).
3. Common causes:
   - **ClamAV definitions corrupt:** Check definition-updater Lambda logs. Re-run manually: `aws lambda invoke --function-name <DefUpdater>`.
   - **Lambda memory exhaustion:** Check CloudWatch for OOM. Increase `MemorySize`.
   - **Specific file causing crash:** Identify the file from the S3 key in the message. Test locally.
4. After fixing root cause: redrive all DLQ messages:
```bash
aws sqs start-message-move-task \
  --source-arn <DLQ_ARN> \
  --destination-arn <MAIN_QUEUE_ARN> \
  --region eu-west-2
```

#### "Scan failing" (ScanVerdict=ERROR spiking)

1. Check if it's all files or specific files.
2. Check definition-updater Lambda: did the last run succeed?
```bash
aws logs tail /aws/lambda/<DefUpdaterFunctionName> --since 24h --region eu-west-2
```
3. Check EFS: are definitions present and readable?
4. Check `clamscan` binary in Lambda layer: is the layer version current?
5. Workaround: if scanner is fully down and processing is urgent, temporarily set `SCAN_ENABLED=false` env var on Worker Lambda to skip scanning (flag must exist in code). Deploy immediately. Fix scanner. Re-enable.

---

## G. Security & Compliance Impact

### G.1 Updated Threat Model — Risks Reduced

| Original Risk (from shipping pack) | Impact of Hardening | New Status |
|-------------------------------------|---------------------|------------|
| **#1: Malicious file upload (PDF exploit)** | **Directly mitigated.** ClamAV scans every file before processing. Infected files quarantined and never processed. | Residual: zero-day malware not in ClamAV definitions. Mitigated by: daily definition updates, quarantine retention for retroactive analysis. |
| **#6: Denial of service via large uploads** | **Improved.** SQS absorbs burst. Lambda concurrency cap prevents runaway. DLQ catches persistent failures. | Residual: attacker could fill SQS queue with 200 MB uploads. Mitigated by: WAF rate limit, API throttling, S3 POST policy, concurrency cap. |
| **#7: Worker Lambda abuse (slow processing)** | **Improved.** SQS decouples trigger from Lambda. Retries are controlled. Stuck jobs visible via DLQ alarm. | Residual: Lambda timeout (15 min) is generous. Mitigated by: monitoring, manual intervention. |

**New risks introduced:**

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| **ClamAV definition staleness** | Medium | Low | Daily `freshclam` update. Alert if update Lambda fails. Definitions are typically <24 hours old. |
| **EFS availability** | Low | Low | EFS is multi-AZ in eu-west-2. If EFS is unavailable, scan fails → SQS retries → DLQ. |
| **SQS message poisoning** | Low | Very Low | SQS queue policy restricts `SendMessage` to the S3 bucket's ARN only. No external entity can inject messages. |
| **Quarantine file access** | Low | Low | Quarantine prefix has same bucket-level controls (private, encrypted). No presigned URLs generated for quarantine. Access is Lambda IAM only. |

### G.2 CORS / JWT Isolation — Confirmed Unchanged

- **CORS:** No changes to allowed origins, allowed methods, or CORS configuration. S3 CORS for browser uploads unchanged.
- **JWT:** No changes to Cognito configuration, JWKS verification, or token handling. API handler unchanged.
- **Tenant isolation:** `userSub` ownership checks unchanged. New `scanResult` and `expiresAt` fields are per-job (not per-user) and don't affect access control.
- **Presigned URLs:** Upload (POST) and download (GET) URL generation unchanged. No presigned URLs for quarantine prefix.

### G.3 New IAM Permissions

**Worker Lambda — additional permissions needed:**

```yaml
# S3: need DeleteObject for quarantine move (copy+delete pattern)
- Statement:
    Effect: Allow
    Action:
      - s3:GetObject
      - s3:PutObject
      - s3:DeleteObject       # NEW: for quarantine move
    Resource: !Sub "${UploadsBucket.Arn}/*"

# SQS: receive + delete messages
- Statement:
    Effect: Allow
    Action:
      - sqs:ReceiveMessage
      - sqs:DeleteMessage
      - sqs:GetQueueAttributes
    Resource: !GetAtt UploadQueue.Arn

# SNS: publish infection alerts
- Statement:
    Effect: Allow
    Action:
      - sns:Publish
    Resource: !Ref ScanAlertTopic

# CloudWatch: emit custom metrics
- Statement:
    Effect: Allow
    Action:
      - cloudwatch:PutMetricData
    Resource: "*"
    Condition:
      StringEquals:
        cloudwatch:namespace: "PoliticalSolutions/Upload"

# EFS: mounted via VPC config (no explicit IAM policy needed — access point handles it)
```

**Definition Updater Lambda — permissions:**

```yaml
# EFS: write definitions (same access point, write-enabled)
# No S3/DynamoDB access needed
# Internet access needed for freshclam to download definitions
```

**Least privilege notes:**
- Worker does NOT get `sqs:SendMessage` — it cannot put messages back into the queue or DLQ.
- Worker `s3:DeleteObject` is scoped to the uploads bucket only — not any other bucket.
- SNS publish is scoped to the single scan alert topic.
- CloudWatch `PutMetricData` is scoped by condition to our namespace only.
- Definition updater has no DynamoDB or S3 access — it only writes to EFS.

---

## H. Cost & Performance Notes

### H.1 Monthly Cost Drivers (ClamAV on Lambda)

Assumptions: 5,000 files/month, average 20 MB each, scanning takes ~10 s per file.

| Component | Calculation | Monthly cost |
|-----------|-------------|-------------|
| **Worker Lambda** (scan + process) | 5,000 invocations × 2048 MB × 30 s avg = 307,200 GB-s. Free tier: 400,000 GB-s. | **$0** (within free tier) |
| **Worker Lambda** (post-free-tier) | $0.0000166667/GB-s × 307,200 | ~$5.12 |
| **SQS** | 5,000 messages × 2 API calls each (send + receive) = 10,000 requests. Free tier: 1M. | **$0** |
| **EFS** | ClamAV definitions ~400 MB. $0.30/GB-month. | ~$0.12 |
| **Definition Updater Lambda** | 1 invocation/day × 30 days × 512 MB × 60 s = 921 GB-s. | **$0** (free tier) |
| **SNS** | Alert topic. Near-zero unless infected files are common. | ~$0 |
| **CloudWatch custom metrics** | ~6 metrics × $0.30/metric. | ~$1.80 |
| **S3 lifecycle** | No additional cost (built-in). | $0 |
| **DynamoDB TTL** | No additional cost (free). | $0 |
| **Total incremental cost** | | **~$2–7/month** at early stage |

At 50,000 files/month (10x growth): ~$50–60/month. Still negligible.

### H.2 Impact on Job Latency

| Stage | Before hardening | After hardening | Delta |
|-------|-----------------|-----------------|-------|
| SQS delivery | 0 ms (direct trigger) | ~100–500 ms | +500 ms worst case |
| ClamAV scan (20 MB file) | 0 ms (no scan) | 5–15 s | +5–15 s |
| ClamAV scan (200 MB file) | 0 ms | 30–60 s | +30–60 s |
| File processing | 1–300 s (unchanged) | 1–300 s | 0 |
| **Total (typical 20 MB PDF)** | **~5–30 s** | **~15–45 s** | **+10–15 s** |

**User-visible impact:** The new `SCANNING` status shows for 5–15 seconds before transitioning to `PROCESSING`. Frontend polls every 5 s, so the user will see the SCANNING badge for 1–2 poll cycles. Acceptable UX.

**Mitigation for large files:** The 200 MB worst case (60 s scan) is still well within the 15-minute Lambda timeout. The SQS visibility timeout (960 s) covers this comfortably.

### H.3 Selling Points (Post-Hardening)

For client-facing material and sales conversations:

- **"Every file is virus-scanned before processing."** Differentiator for political clients handling sensitive data. Shows we take security seriously.
- **"Automatic data retention enforcement."** Files auto-deleted after 90 days. Demonstrates GDPR compliance by design, not just by policy.
- **"Built for reliability."** Dead-letter queues, automatic retries, idempotent processing. No lost files, no silent failures.
- **"Full audit trail."** Every job has scan results, status history, timestamps. Ready for ICO audits and client DPIAs.
- **"UK data residency."** All scanning and processing happens in London (eu-west-2). No data leaves the UK.
