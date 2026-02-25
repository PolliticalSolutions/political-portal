# Political Portal (Vite + React)

Minimal routing skeleton for politicalsolutions.uk. Vite + React with react-router-dom, ready for AWS Amplify hosting and SPA deep-link rewrites.

## Local development
- Install deps: `npm install`
- Run dev server: `npm run dev` (defaults to http://localhost:5173)
- Preview production build locally: `npm run build && npm run preview`

## Production build
- `npm run build` (outputs to `dist/`)

## Blog comments (Giscus)
- Enable GitHub Discussions in the repository that will host comments.
- Create a Discussions category for blog comments (for example `General` or `Blog`).
- Open https://giscus.app with your repository settings to retrieve `repoId` and `categoryId`.
- Set these environment variables locally (for `.env.local`) and in production (for example Amplify environment variables):
- `VITE_GISCUS_ENABLED=true`
- `VITE_GISCUS_REPO=owner/repo`
- `VITE_GISCUS_REPO_ID=<repoId>`
- `VITE_GISCUS_CATEGORY=<category name>`
- `VITE_GISCUS_CATEGORY_ID=<categoryId>`
- Comments only render when all required Giscus variables are present and enabled.

## Routes to test locally
- Home: `http://localhost:5173/`
- Protected Portal (will redirect to login): `http://localhost:5173/portal`
- Callback with query echo: `http://localhost:5173/callback?code=TEST`

## Cognito Hosted UI + PKCE (no Amplify SDK)
- Configure `src/cognitoConfig.js` with your `domain`, `clientId`, `redirectUri`, and `scope`.
- Start login from `/login` → we generate a PKCE verifier/challenge, store the verifier in `sessionStorage`, and redirect to Cognito Hosted UI.
- Cognito redirects back to `/callback?code=...` → we POST to `/oauth2/token` with the code + verifier and store tokens in `sessionStorage`. `/portal` reads these to enforce access.

## Amplify note
Configure a SPA rewrite so deep links render the React app:
- Source: `/<*>`
- Target: `/index.html`
- Type: `200 (Rewrite)`
