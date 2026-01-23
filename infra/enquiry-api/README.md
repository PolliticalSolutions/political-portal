# Enquiry API (SAM + SES)

This folder contains a SAM stack to provide `/enquiry`, `/quote-requests`, and Xero integration endpoints
backed by Lambda, SES, DynamoDB, and SSM.
The endpoints are intended to be called from the SPA when `VITE_API_BASE_URL` is configured.

## Prerequisites
- AWS CLI configured for the target account.
- AWS SAM CLI installed.
- SES email identity verified for the sender address (`FromEmail`).

## SES setup
1) Verify an email address or domain in SES (region: eu-west-2 by default).
2) If your SES account is in sandbox mode, request production access before sending to arbitrary addresses.

## Deploy
See `docs/enquiry-api-deploy.md` for step-by-step deployment and Amplify configuration.
For quote + Xero-specific setup, see `docs/quote-api.md`.

## Outputs
The stack outputs `ApiBaseUrl` (base URL) and `EnquiryEndpoint` (full endpoint).

## Notes
- The Lambda uses `AWS_REGION` (defaulting to eu-west-2) for SES.
- CORS is configured via `AllowedOrigins` and returned by the handler.
- Ops endpoints and Xero connect/status require Cognito JWTs when configured.
- Optional controls: TTL (`QuoteTtlEnabled`), alarms (`AlarmTopicArn`), test invoice (`XeroTestInvoiceEnabled`).
