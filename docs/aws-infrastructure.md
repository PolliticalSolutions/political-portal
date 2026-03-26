# AWS Infrastructure Reference

Complete reference for all AWS resources, environment variables, deployment commands, and known gotchas.

---

## API Gateway stacks

Two upload-api stacks exist. Always target `ps-upload-api-prod` for production changes.

| Stack name | API Gateway ID | Purpose |
|---|---|---|
| `upload-api` | `ra5ljyj9b0` | Legacy / dev stack — NOT used by Amplify |
| `ps-upload-api-prod` | `77i4hpcez8` | **Production** — used by Amplify frontend |
| `ps-enquiry-api-prod` | (see CloudFormation outputs) | Enquiry, quotes, Stripe, Xero |

Base URLs:
- Upload API (prod): `https://77i4hpcez8.execute-api.eu-west-2.amazonaws.com`
- Upload API (dev): `https://ra5ljyj9b0.execute-api.eu-west-2.amazonaws.com`

---

## Lambda functions

### upload-api stack (`ps-upload-api-prod`)

| Logical name | Deployed name | Runtime | Timeout | Purpose |
|---|---|---|---|---|
| `UploadFunction` | `ps-upload-api-prod-UploadFunction-jCpdeALbGNCB` | Node 20 | 15s | HTTP API handler — auth, jobs, elections, users, orgs |
| `WorkerFunction` | `ps-upload-api-prod-WorkerFunction-UVo8NrkgHGS4` | Node 20 | 900s | SQS consumer — processes uploaded files |
| `ScanResultHandlerFunction` | `ps-upload-api-prod-ScanResultHandlerFunction-705dJCHelW3n` | Node 20 | 30s | GuardDuty scan result handler |

Source: `infra/upload-api/src/`
- `handler.mjs` — routes HTTP events (GET /elections, POST /jobs, etc.)
- `electionsRepo.mjs` — DynamoDB access for elections (uses full pagination scan)
- `usersRepo.mjs` — user records; `putUserIfAbsent` defaults to `status: "APPROVED"`
- `submissionsRepo.mjs` — upload job records
- `orgsRepo.mjs` — organisation records
- `geoLookupRepo.mjs` — ward→PCON lookup
- `auditRepo.mjs` — audit log writes
- `worker.mjs` — processes SQS messages from WorkerFunction
- `scanResultHandler.mjs` — processes GuardDuty EventBridge events

### enquiry-api stack (`ps-enquiry-api-prod`)

| Logical name | Runtime | Timeout | Purpose |
|---|---|---|---|
| `EnquiryFunction` | Node 20 | 15s | Enquiries, quote requests, Xero invoice creation, auth callbacks |
| `StripeFunction` | Node 20 | 29s | Stripe payments, subscription management, Cognito user provisioning |

Source: `infra/enquiry-api/src/` (EnquiryFunction) and `infra/enquiry-api/stripe-src/` (StripeFunction)

---

## DynamoDB tables

### upload-api tables (prefixed `ps-upload-api-prod-`)

| Table | Key | GSIs | Purpose |
|---|---|---|---|
| `ps-upload-api-prod-jobs` | `jobId` (HASH) | `UserSubIndex` (userSub+createdAt), `S3KeyIndex` (s3Key), `ManualReviewIndex` (manualReviewKey+createdAt) | Upload job records |
| `ps-upload-api-prod-users` | `userId` (HASH) | `StatusCreatedAtIndex` (status+createdAt) | User approval records, `allowedPconCodes`, org assignments |
| `ps-upload-api-prod-elections` | `electionId+pconCode` composite | — | Elections; two record types: `ELECTION` (canonical) and `ELECTION_PROJECTION` (per-constituency) |
| `ps-upload-api-prod-organisations` | `orgId` (HASH) | — | Organisation records |
| `ps-upload-api-prod-audit-log` | `auditId` (HASH) | — | Audit trail |
| `ps-upload-api-prod-submissions` | — | — | Processed submission results |

### enquiry-api tables (prefixed `ps-enquiry-api-prod-`)

| Table | Purpose |
|---|---|
| `ps-enquiry-api-prod-quote-requests` | Quote request records |
| `ps-enquiry-api-prod-quote-idempotency` | Idempotency keys for quote submission |

---

## Environment variables

### Frontend (Vite / Amplify)

Set in `.env` for local dev; Amplify environment variables for production.

| Variable | Purpose | Where |
|---|---|---|
| `VITE_UPLOAD_API_URL` | Base URL for upload API | `https://77i4hpcez8.execute-api.eu-west-2.amazonaws.com` |
| `VITE_SUPABASE_URL` | Supabase project URL | Constituency intelligence |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | Constituency intelligence |
| `VITE_COGNITO_DOMAIN` | Cognito hosted UI domain | Auth |
| `VITE_COGNITO_CLIENT_ID` | Cognito app client ID | Auth |
| `VITE_COGNITO_REDIRECT_URI` | Post-auth redirect | Auth |
| `VITE_ENQUIRY_API_URL` | Enquiry API base URL | Quote/contact forms |

### upload-api Lambda (set via SAM parameters / CloudFormation)

| Variable | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) |
| `JOBS_TABLE` | DynamoDB jobs table name |
| `USERS_TABLE` | DynamoDB users table name |
| `ELECTIONS_TABLE` | DynamoDB elections table name |
| `ORGANISATIONS_TABLE` | DynamoDB organisations table name |
| `AUDIT_TABLE` | DynamoDB audit log table name |
| `SUBMISSIONS_TABLE` | DynamoDB submissions table name |
| `UPLOADS_BUCKET` | S3 bucket for file uploads |
| `PROCESS_QUEUE_URL` | SQS queue URL for worker jobs |
| `COGNITO_ISSUER` | Cognito issuer URL for JWT verification |
| `COGNITO_AUDIENCE` | Cognito app client ID (JWT `aud` / `client_id`) |
| `ADMIN_SUB_ALLOWLIST` | Comma-separated Cognito subs with admin access |
| `GEO_LOOKUP_TABLE` | External PCON/ward lookup table name |
| `GEO_LOOKUP_MODE` | `auto` |

### enquiry-api Lambda

| Variable | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | CORS allowed origins |
| `FROM_EMAIL` | SES sender address |
| `TO_EMAIL` | Enquiry recipient address |
| `OPS_EMAIL_TO` | Ops notifications recipient |
| `FRONTEND_BASE_URL` | For auth callback URLs |
| `QUOTE_REQUESTS_TABLE` | DynamoDB quote requests table |
| `IDEMPOTENCY_TABLE` | DynamoDB idempotency table |
| `COGNITO_ISSUER` | JWT verification |
| `COGNITO_AUDIENCE` | JWT verification |
| `ANTHROPIC_API_KEY` | Claude API key (blog automation) |
| `ANTHROPIC_MODEL` | Claude model ID |
| `XERO_*` | Xero OAuth + invoice configuration |

### Stripe Lambda (enquiry-api stripe-src)

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `SUPABASE_URL` | Supabase URL (subscription management) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `COGNITO_USER_POOL_ID` | User pool for new account creation |
| `COGNITO_TEMP_PASSWORD` | Temp password for provisioned users |
| `SES_FROM_EMAIL` | SES sender for welcome emails |

---

## Deployment commands

### upload-api (production)

```sh
ALLOWED_ORIGINS="https://www.politicalsolutions.uk,http://localhost:5173" \
COGNITO_ISSUER="https://cognito-idp.eu-west-2.amazonaws.com/<pool-id>" \
COGNITO_AUDIENCE="<client-id>" \
scripts/deploy-upload-api.sh
```

Default `STACK_NAME=ps-upload-api-prod`. To deploy to the dev stack: `STACK_NAME=upload-api`.

SAM CLI on Windows requires PowerShell:
```powershell
& "C:\Program Files\Amazon\AWSSAMCLI\bin\sam.cmd" build
& "C:\Program Files\Amazon\AWSSAMCLI\bin\sam.cmd" deploy ...
```

### enquiry-api (production)

```sh
ALLOWED_ORIGINS="https://www.politicalsolutions.uk,http://localhost:5173" \
FROM_EMAIL="noreply@politicalsolutions.uk" \
TO_EMAIL="ops@politicalsolutions.uk" \
scripts/deploy-enquiry-api.sh
```

Default `STACK_NAME=ps-enquiry-api-prod`.

### Frontend (Amplify)

Push to `main` branch — Amplify auto-deploys. Build command: `npm run build`.

---

## Known gotchas

### Two upload-api stacks

`upload-api` (dev, API ID `ra5ljyj9b0`) and `ps-upload-api-prod` (prod, API ID `77i4hpcez8`) are completely separate stacks with separate DynamoDB tables, S3 buckets, and Lambda functions. Amplify uses `ps-upload-api-prod`. All production fixes must be deployed there.

### DynamoDB scan pagination

The elections table stores both `ELECTION` (canonical record) and `ELECTION_PROJECTION` (per-constituency record, 1 per PCON) record types. With 650+ large projection records, a single Scan page hits the 1MB limit before reaching the canonical `ELECTION` record. Always paginate fully using `LastEvaluatedKey`:

```js
let lastKey;
do {
  const params = { ... };
  if (lastKey) params.ExclusiveStartKey = lastKey;
  const result = await dynamo.scan(params).promise();
  // process items
  lastKey = result.LastEvaluatedKey;
} while (lastKey);
```

`dynamodb:Scan` must be explicitly granted in IAM — it is separate from `Query`/`GetItem`.

### PCON code formats

2019 boundary codes: `E14000xxx` (4-digit suffix)
2024 boundary codes: `E14001xxx` (4-digit suffix, different range)

The elections table and GeoJSON use 2024 codes (`E14001xxx`). Restricting a user's `allowedPconCodes` to an old-format code blocks all 2024-boundary uploads. Setting `allowedPconCodes: []` means unrestricted.

### Cognito JWT `aud` vs `client_id`

Cognito access tokens include `client_id` but not `aud`. The upload-api handler verifies against `payload.aud || payload.client_id`. Ensure `COGNITO_AUDIENCE` matches the app client ID.

### User auto-approval

`usersRepo.putUserIfAbsent` defaults to `status: "APPROVED"`. New users created on first API call are immediately approved. Manual DynamoDB edits are required to restrict or reject users. Deployed to `ps-upload-api-prod` on 2026-03-23.

### WAF status

WAF is disabled on both stacks (can be re-enabled by setting `WafEnabled=true` at deploy time).

### AWS CLI on Windows / git bash

Passing paths starting with `/aws/lambda/` to AWS CLI in git bash causes path mangling (bash treats it as a file path). Use PowerShell for CloudWatch and other path-argument commands.

### node_modules in stripe-src

`infra/enquiry-api/stripe-src/node_modules/` is gitignored. Do not stage it.
