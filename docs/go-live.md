Go-live: invoice-ready hardening

Scope
- Covers Cognito-gated ops endpoints, Xero invoicing, SES email, and ops visibility.
- Public quote flow must remain available even if Cognito auth is not configured.

Required parameters (SAM stack)
- COGNITO_ISSUER and COGNITO_AUDIENCE for ops and Xero endpoints (fail-closed if missing).
- FROM_EMAIL and OPS_EMAIL_TO for SES notifications.
- XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI for Xero OAuth.
- XERO_SALES_ACCOUNT_CODE and XERO_TAX_TYPE for invoice creation.
- XERO_DUE_DAYS and XERO_EMAIL_INVOICE (optional).
- XERO_TEST_INVOICE_ENABLED (optional).
- ALLOWED_ORIGINS and FRONTEND_BASE_URL for CORS and redirects.
- AlarmTopicArn (optional but recommended).
- DLQ settings and TTL settings (optional).

Amplify environment variables
- VITE_API_BASE_URL=<ApiBaseUrl> (required).

SES verification checklist
- Verify sender identity for FROM_EMAIL in eu-west-2.
- Request production access if still in SES sandbox.
- Confirm OPS_EMAIL_TO can receive mail.

Cognito issuer/audience verification
- Obtain a real access token from the Hosted UI login.
- Decode the JWT payload (base64url) and confirm:
  - iss matches COGNITO_ISSUER exactly (no trailing slash changes).
  - aud or client_id matches COGNITO_AUDIENCE.
- Verify JWKS URL resolves: <issuer>/.well-known/jwks.json.
- If issuer/audience are missing or incorrect, protected endpoints return AUTH_NOT_CONFIGURED (503).

Xero configuration and connect flow
- Ensure Xero app has scopes: offline_access, accounting.transactions, accounting.contacts, accounting.settings.
- Set XERO_REDIRECT_URI to the deployed /xero/callback endpoint.
- Connect Xero in /portal/settings/integrations and confirm tenant is shown.
- If using invoice emails, enable Xero online payments before setting XERO_EMAIL_INVOICE=true.

Test invoice steps
- In /portal/settings/integrations, click "Test invoice creation".
- Confirm draft invoice appears in Xero and portal status updates.

Alarms and DLQ defaults (recommended)
- AlarmTopicArn: an SNS topic monitored by ops.
- Set DLQ target with a retention policy (14 days).
- Keep TTL disabled unless you have an explicit retention policy and compliance sign-off.

Day-2 operations: invoice error codes
- XERO_NOT_CONNECTED: reconnect Xero in Integrations, then retry manually in Xero.
- XERO_CONFIG_MISSING: set sales account code and tax type, then retry.
- XERO_INVOICE_FAILED: check CloudWatch logs, then create invoice manually in Xero.

