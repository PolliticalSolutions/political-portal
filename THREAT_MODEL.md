# Threat Model

System: Political Solutions Portal
Date: 2026-03-17
Branch: security-and-testing

---

## System Overview

Political Solutions Portal is a React 19 SPA with SSR prerender, served from a CDN. It provides:
- **Public marketing pages** — Home, Services, Subscriptions, Blog, Enquire
- **Authenticated portal** — `/portal/*`, protected by AWS Cognito PKCE auth flow
- **Constituency Intelligence** — Supabase-backed data for UK constituency election data
- **Backend APIs** — AWS Lambda/SAM (enquiry, upload, quotes)

---

## Assets

| Asset | Classification | Location |
|-------|---------------|----------|
| Cognito access_token / id_token | Sensitive — grants API access | `sessionStorage["cognito_tokens"]` |
| PKCE verifier/state | Ephemeral secret — must be kept until callback | `sessionStorage` + `localStorage` |
| Post-auth redirect path | Low sensitivity | `sessionStorage["ps_post_auth_redirect_v1"]` |
| Cookie notice acknowledgement | Non-sensitive | `localStorage["ps_cookie_notice_ack_v1"]` |
| Supabase anon key | Low sensitivity (read-only public data) | Env var / bundled at build |
| User identity (name, email in JWT) | Personal data | `sessionStorage` via id_token |
| Enquiry form submissions | Personal data — name, email, message | Transit to API / email |

---

## Trust Boundary Map

```
Browser (user-controlled) ─────────────────────────────────────────────
│  React SPA (static CDN assets)
│    ↕ sessionStorage (tokens)
│    ↕ localStorage (PKCE, cookie ack)
│    ↕ fetch() with Bearer token ──────→ AWS Lambda APIs (HTTPS)
│    ↕ Supabase JS SDK ────────────────→ Supabase cloud (HTTPS, anon key)
│    ↕ window.location.assign() ───────→ AWS Cognito Hosted UI (HTTPS)
└───────────────────────────────────────────────────────────────────────
                    ↑ CDN (CloudFront or similar)
                    ↑ Origin (S3 or similar)
```

---

## Threat Actors

| Actor | Capability | Likely motivation |
|-------|-----------|------------------|
| Unauthenticated web user | Browser access to public pages | Scraping, reconnaissance |
| Authenticated portal user | Full portal access with valid tokens | Data access, competitor intel |
| Compromised third-party script | XSS if injected | Token theft, data exfiltration |
| Network attacker (MITM) | Passive/active interception | Token theft |
| Malicious redirect target | Phishing after open redirect | Credential theft |
| Compromised CDN/supply chain | Malicious asset injection | Mass token theft |

---

## Threat Enumeration (STRIDE)

### Spoofing

| ID | Threat | Likelihood | Impact | Mitigation |
|----|--------|-----------|--------|------------|
| S-1 | PKCE state forgery — attacker forges the `state` param in the callback URL to bind their session | Low | High | `state` is verified against stored PKCE record (`loadPkce(state)`); mismatched state → `PKCE_HANDOFF_MISSING` error |
| S-2 | Token forgery — attacker crafts a fake JWT in sessionStorage | Very Low | High | Tokens are only used as API bearer tokens; the backend validates signatures via Cognito JWKS |
| S-3 | Host spoofing in production — attacker hosts a clone at a different origin | Low | Medium | `resolveCanonicalOrigin` + `ensureCanonicalHost` redirects to `www.politicalsolutions.uk` in production |

### Tampering

| ID | Threat | Likelihood | Impact | Mitigation |
|----|--------|-----------|--------|------------|
| T-1 | SessionStorage tampering by co-tenant JS (XSS) | Low | High | No XSS sinks found (FINDING-005); Content-Security-Policy not yet deployed (FINDING-004) |
| T-2 | LocalStorage PKCE tampering — attacker writes a malicious verifier before auth flow | Very Low | Medium | PKCE verifier is single-use, bound to a random `state` value; mismatched verifier causes code exchange failure |
| T-3 | Open redirect via stored redirect path | Very Low | Medium | `consumePostAuthRedirect` validates with `isSafeInternalPath`; dead export `consumePostLoginRedirect` is unvalidated but unused (FINDING-002) |

### Repudiation

| ID | Threat | Likelihood | Impact | Mitigation |
|----|--------|-----------|--------|------------|
| R-1 | Enquiry submission without attribution | Low | Low | API attaches `userAgent` and `timestampIso` from client; IP logged at Lambda/API Gateway level |

### Information Disclosure

| ID | Threat | Likelihood | Impact | Mitigation |
|----|--------|-----------|--------|------------|
| I-1 | Token read via XSS | Low | High | `sessionStorage` not accessible cross-origin; no XSS sinks found; CSP absent (FINDING-004) |
| I-2 | Sensitive data in `console.*` output visible in DevTools | Low | Low | Portal only; logged data is operational (ONS codes, not PII) — see FINDING-008 |
| I-3 | JWT payload readable client-side | Accepted | Low | JWTs are decoded client-side by design (standard pattern); payload is non-sensitive identity claims |
| I-4 | Supabase anon key bundled in JS | Accepted | Low | Anon key is intentionally public; Supabase RLS provides actual access control |
| I-5 | Environment variable leakage via VITE_ bundle | Low | Medium | All VITE_ vars are bundled; ensure no secrets are stored with VITE_ prefix in CI/CD |

### Denial of Service

| ID | Threat | Likelihood | Impact | Mitigation |
|----|--------|-----------|--------|------------|
| D-1 | Enquiry API spam | Medium | Low | Rate limiting returns 429 with `too_many_requests` error; client handles gracefully |
| D-2 | Supabase query abuse | Low | Low | Anon key scoped by RLS; read-only constituency data |

### Elevation of Privilege

| ID | Threat | Likelihood | Impact | Mitigation |
|----|--------|-----------|--------|------------|
| E-1 | Unauthenticated access to `/portal` | Very Low | High | `ProtectedRoute` checks `isAuthed`; server validates tokens via Bearer auth |
| E-2 | Expired token reuse | Very Low | Medium | `isTokenExpired` applies 60-second clock skew; expired sessions are cleared and re-auth required |

---

## Key Security Controls

| Control | Implementation |
|---------|---------------|
| Authentication | AWS Cognito PKCE — short-lived auth codes, cryptographic verifier |
| Session management | Tokens in `sessionStorage` (cleared on tab close), 60-second expiry skew |
| Open redirect prevention | `isSafeInternalPath` validation on all post-auth redirect paths |
| Input validation | Client-side form validation before API submission |
| Encoded path parameters | `encodeURIComponent(referenceId)` on API URL construction |
| HTTP security headers | HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy (per verify-prod-headers.ps1) |
| Idle session timeout | 4-minute warning + 1-minute countdown then auto-logout |

---

## Gaps / Recommendations

1. **Deploy a Content-Security-Policy** — highest value addition; add to CDN/hosting config and verify in CI.
2. **Remove dead export `consumePostLoginRedirect`** — eliminates potential future open redirect if code is accidentally reused.
3. **Validate Xero redirect URL client-side** — verify `redirectUrl` starts with `https://login.xero.com/` before `window.location.assign`.
4. **Add coverage thresholds to CI** — prevents regressions going undetected; requires installing `@vitest/coverage-v8`.
5. **Escalate npm audit failures** — current CI ignores all audit failures; consider failing on `critical`-severity.
