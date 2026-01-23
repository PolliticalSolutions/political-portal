# Enquiry API deployment (SAM + SES)

## Overview
This document describes how to deploy the enquiry API and wire it into Amplify.
Region assumption: eu-west-2.

## SES verification (required)
1) In SES (eu-west-2), verify a sender identity (email or domain) to use as `FromEmail`.
2) If your account is in SES sandbox, request production access before sending to arbitrary addresses.
3) Decide your destination `ToEmail` (e.g. enquiries mailbox).

## Deploy
Option A (script):
```
ALLOWED_ORIGINS="https://www.politicalsolutions.uk,http://localhost:5173" \
FROM_EMAIL="verified-sender@example.com" \
TO_EMAIL="paul@politicalsolutions.uk" \
OPS_EMAIL_TO="ops@politicalsolutions.uk" \
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
STACK_NAME="ps-enquiry-api-prod" \
./scripts/deploy-enquiry-api.sh
```

Option B (manual):
```
cd infra/enquiry-api
sam build
sam deploy --resolve-s3 \
  --stack-name ps-enquiry-api-prod \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    AllowedOrigins="https://www.politicalsolutions.uk,http://localhost:5173" \
    FromEmail="verified-sender@example.com" \
    ToEmail="paul@politicalsolutions.uk" \
    OpsEmailTo="ops@politicalsolutions.uk" \
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
  --stack-name ps-enquiry-api-prod \
  --query "Stacks[0].Outputs"
```
Look for `ApiBaseUrl`.

## Amplify configuration
Set the environment variable:
```
VITE_API_BASE_URL=<ApiBaseUrl>
```
Legacy (enquiry page fallback):
```
VITE_ENQUIRY_API_URL=<ApiBaseUrl>
```
Important:
- Use the base URL only (no trailing `/enquiry` needed).
- A trailing slash is OK.
- Example: `https://abc123.execute-api.eu-west-2.amazonaws.com`

## Verification (curl)
```
curl -i -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "organisation": "Example Org",
    "message": "Hello from curl",
    "context": {"source": "manual"},
    "pageUrl": "https://www.politicalsolutions.uk/enquire",
    "userAgent": "curl",
    "timestampIso": "2025-01-01T12:00:00Z"
  }' \
  https://<ApiBaseUrl>/enquiry
```
Expected response:
```
{ "ok": true, "requestId": "<id>" }
```

## Throttling + 429s
- Default stage throttling is 20 rps with a 40 burst.
- Override via `ThrottlingRateLimit` and `ThrottlingBurstLimit` parameters.
- If the per-IP limit is exceeded, the API returns HTTP 429 with `Retry-After: 60`.

## WAF protection
- WAF adds a rate-based rule and AWS Managed Rules (Common + KnownBadInputs + IP reputation + Anonymous IPs).
- Defaults:
  - `WafEnabled=true`
  - `WafRateLimit=300` (requests per 5 minutes per IP)
  - `WafManagedRulesEnabled=true`
- To temporarily disable managed rules (e.g. false positives), deploy with `WafManagedRulesEnabled=false`.
- Verification:
  - AWS Console: WAF → Web ACLs → select the ACL → Associated AWS resources should list the API Gateway stage.
  - CloudWatch metrics: look for AllowedRequests and BlockedRequests under the Web ACL metrics.

## WAF logging & tuning
- Logging:
  - WAF console → Web ACL → Logging and metrics → logging enabled.
  - CloudWatch Logs: `/aws/waf/<stack-name>` should exist and receive events.
- Useful fields:
  - `action` (ALLOW/BLOCK)
  - `terminatingRuleId`
  - `ruleGroupList` (managed rule groups and evaluated rules)
  - `httpRequest.clientIp`, `httpRequest.uri`, `httpRequest.args`, `httpRequest.headers`
- Tuning:
  - If false positives occur, redeploy with `WafManagedRulesEnabled=false` while investigating.
  - Longer-term, add explicit exclusions or rule overrides (not implemented in this milestone).
- Retention:
  - Default is 14 days. Override with `WafLogRetentionDays`.
