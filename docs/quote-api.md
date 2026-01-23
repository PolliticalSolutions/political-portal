# Quote + Xero API (SAM + SES + DynamoDB)

## Overview
This stack extends the enquiry API with quote requests, Xero OAuth, and invoice creation.
Region assumption: eu-west-2.

## SES prerequisites
1) Verify a sender identity (email or domain) in SES (eu-west-2) for `FromEmail`.
2) If your SES account is in sandbox, request production access before sending to arbitrary recipients.

## Deploy (SAM)
Option A (script):
```
ALLOWED_ORIGINS="https://www.politicalsolutions.uk,http://localhost:5173" \
FROM_EMAIL="verified-sender@example.com" \
TO_EMAIL="paul@politicalsolutions.uk" \
OPS_EMAIL_TO="ops@politicalsolutions.uk" \
FRONTEND_BASE_URL="https://www.politicalsolutions.uk" \
XERO_CLIENT_ID="<xero-client-id>" \
XERO_CLIENT_SECRET="<xero-client-secret>" \
XERO_REDIRECT_URI="https://<api-id>.execute-api.eu-west-2.amazonaws.com/xero/callback" \
XERO_TOKEN_PARAM_NAME="/political-solutions/xero" \
XERO_SALES_ACCOUNT_CODE="200" \
XERO_TAX_TYPE="OUTPUT" \
XERO_INVOICE_STATUS="DRAFT" \
XERO_DUE_DAYS="7" \
XERO_EMAIL_INVOICE="false" \
XERO_TEST_INVOICE_ENABLED="true" \
XERO_STATE_SECRET="<random-secret>" \
COGNITO_ISSUER="https://cognito-idp.eu-west-2.amazonaws.com/<user-pool-id>" \
COGNITO_AUDIENCE="<app-client-id>" \
QUOTE_TTL_ENABLED="false" \
QUOTE_TTL_DAYS="90" \
ALARM_TOPIC_ARN="arn:aws:sns:eu-west-2:123456789012:alerts" \
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
    FrontendBaseUrl="https://www.politicalsolutions.uk" \
    XeroClientId="<xero-client-id>" \
    XeroClientSecret="<xero-client-secret>" \
    XeroRedirectUri="https://<api-id>.execute-api.eu-west-2.amazonaws.com/xero/callback" \
    XeroTokenParamName="/political-solutions/xero" \
    XeroSalesAccountCode="200" \
    XeroTaxType="OUTPUT" \
    XeroInvoiceStatus="DRAFT" \
    XeroDueDays=7 \
    XeroEmailInvoice=false \
    XeroTestInvoiceEnabled=true \
    XeroStateSecret="<random-secret>" \
    CognitoIssuer="https://cognito-idp.eu-west-2.amazonaws.com/<user-pool-id>" \
    CognitoAudience="<app-client-id>" \
    QuoteTtlEnabled=false \
    QuoteTtlDays=90 \
    AlarmTopicArn="arn:aws:sns:eu-west-2:123456789012:alerts" \
    ThrottlingRateLimit=20 \
    ThrottlingBurstLimit=40 \
    WafEnabled=true \
    WafRateLimit=300 \
    WafManagedRulesEnabled=true \
    WafLoggingEnabled=true \
    WafLogRetentionDays=14 \
  --region eu-west-2
```

## Amplify environment variables
Set:
```
VITE_API_BASE_URL=<ApiBaseUrl>
```
Optional fallback (legacy enquiry form only):
```
VITE_ENQUIRY_API_URL=<ApiBaseUrl>
```

## Xero app setup
1) Create a Xero OAuth2 app in the Xero developer portal.
2) Set the redirect URI to:
   `https://<api-id>.execute-api.eu-west-2.amazonaws.com/xero/callback`
3) Copy the Client ID and Client Secret into the SAM deploy parameters.
4) Ensure scopes include:
   `offline_access accounting.transactions accounting.contacts accounting.settings`

## Portal auth for ops endpoints
- `/xero/connect`, `/xero/status` (full detail), `/xero/test-invoice`, and `/quote-requests` list/admin require
  a valid Cognito JWT in the `Authorization` header.
- Configure `CognitoIssuer` and `CognitoAudience` to enable JWT verification.

## Connect Xero from the portal
1) Sign in to the portal.
2) Navigate to `/portal/settings/integrations`.
3) Click **Connect Xero** and complete the OAuth flow.
4) The integration status should show as Connected.

## Ops quotes admin
- `/portal/ops/quotes` lists recent quote requests and Xero status.
- `/portal/ops/quotes/<reference>` shows detail and a copy-ready summary.

## Invoice creation behavior
- Invoices are created only when the user checks “Create invoice in Xero now” and Xero is connected.
- Invoice status defaults to DRAFT (override with `XeroInvoiceStatus=AUTHORISED` if needed).
- Payment happens via Xero’s own online payment setup (no in-app card payments).
- Optional: set `XeroEmailInvoice=true` to email invoices automatically after creation.
- Optional: set `XeroTestInvoiceEnabled=true` to allow test invoice creation from the portal.

## Operational controls
- Optional TTL: set `QuoteTtlEnabled=true` and `QuoteTtlDays=<n>` to expire quote records.
- CloudWatch alarms are created for Lambda Errors and Throttles; set `AlarmTopicArn` to receive alerts.

## Verification (curl)
```
curl -i -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "test-key-123",
    "customer": {
      "fullName": "Test User",
      "email": "test@example.com",
      "organisation": "Example Org",
      "role": "Chair"
    },
    "notes": "Test quote request",
    "complianceAcknowledged": true,
    "createInvoice": false,
    "lineItems": [
      {
        "sku": "subscription-foundation",
        "name": "Foundation subscription",
        "category": "subscription",
        "quantity": 1,
        "areaId": "Alpha Association",
        "areaName": "Alpha Association",
        "billingPeriod": "monthly",
        "unitPrice": 50,
        "priceDisplay": "£50.00 per month",
        "complianceLabel": "Capability subscription (not election-specific)",
        "invoiceDescription": "Capability-only subscription."
      }
    ],
    "totals": { "oneOffSubtotal": 0, "subscriptionSubtotal": 50, "subtotal": 50 }
  }' \
  https://<ApiBaseUrl>/quote-requests
```
