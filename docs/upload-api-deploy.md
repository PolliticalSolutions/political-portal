# Upload API deployment (SAM + S3 + DynamoDB)

## Overview
Deploys the upload processing API alongside the existing enquiry-api.
Region assumption: eu-west-2.

Stack creates:
- Private S3 bucket (uploads input + processed outputs)
- DynamoDB table with GSI for per-user job listing
- HTTP API Gateway + Lambda for job CRUD and presigned URL generation
- Worker Lambda triggered by S3 ObjectCreated (processes uploaded files)
- Optional WAF with rate limiting and AWS Managed Rules

## Prerequisites
- AWS CLI configured for the target account
- AWS SAM CLI installed (`pip install aws-sam-cli`)
- Cognito User Pool and App Client IDs from the existing Cognito setup
  (same pool used by the enquiry-api and portal login)

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
