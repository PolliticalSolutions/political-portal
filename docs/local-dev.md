# Local Development Setup

## 1) Create local environment file
Copy `.env.example` to `.env.local` and fill values:

```powershell
Copy-Item .env.example .env.local
```

## 2) Required values
Set the Cognito and API values from Amplify environment variables:
- `VITE_COGNITO_DOMAIN`
- `VITE_COGNITO_CLIENT_ID`
- `VITE_COGNITO_REDIRECT_URI`
- `VITE_COGNITO_LOGOUT_URI`
- `VITE_API_BASE_URL` and/or `VITE_ENQUIRY_API_URL`

For local auth, Cognito callback URLs must include `http://localhost:5173/callback`.

## 3) Keep secrets out of git
Do not commit `.env.local`.
The repository keeps `.env.local` and `.env.*` ignored, while `.env.example` stays tracked.
