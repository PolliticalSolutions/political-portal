# Attack Surface

System: Political Solutions Portal
Date: 2026-03-17
Branch: security-and-testing

---

## Entry Points

### Public (unauthenticated)

| Entry Point | Method | Accepts | Notes |
|-------------|--------|---------|-------|
| `/` | GET | — | Static prerendered HTML |
| `/services`, `/services/election-support` | GET | — | Static prerendered HTML |
| `/subscriptions` | GET | — | Static prerendered HTML |
| `/blog`, `/blog/:slug` | GET | — | Static prerendered HTML |
| `/enquire` | GET | `?association=`, `?constituency=`, `?count=` | Query params rendered into form context (no direct DOM write) |
| `/enquire` (form submit) | POST (via fetch) | JSON body to `VITE_ENQUIRY_API_URL/enquiry` | Rate-limited on server; falls back to mailto |
| `/enquire` (mailto fallback) | mailto: URL | — | Navigates to email client; no server call |
| `/login` | GET | — | Starts Cognito PKCE flow |
| `/signup` | GET | — | Starts Cognito PKCE flow (signup hint) |
| `/callback` | GET | `?code=`, `?state=`, `?error=`, `?error_description=` | Code exchange endpoint; PKCE validated |
| `/privacy`, `/terms`, `/cookies` | GET | — | Static content |
| `/robots.txt`, `/sitemap.xml` | GET | — | Static files |
| `*` (unmatched) | GET | — | Redirects to `/` |

### Authenticated (`/portal/*`)

| Entry Point | Method | Accepts | Notes |
|-------------|--------|---------|-------|
| `/portal` | GET | — | Dashboard; requires valid `cognito_tokens` in sessionStorage |
| `/portal/session` | GET | — | Session debug view |
| `/portal/pricing`, `/portal/pricing-rules` | GET | — | Pricing data |
| `/portal/subscriptions` | GET | — | Subscription management |
| `/portal/cart`, `/portal/checkout` | GET/POST | Cart state in sessionStorage | Payment flow |
| `/portal/settings/integrations` | GET | — | Xero integration |
| `/portal/uploads` | GET/POST | File upload (binary) | Upload API; Bearer token required |
| `/portal/ops/quotes`, `/portal/ops/quotes/:ref` | GET | — | Quote management; Bearer token required |
| `/portal/admin/manual-review` | GET | — | Admin review; Bearer token required |
| `/portal/constituency` | GET | — | Constituency index; Supabase anon key |
| `/portal/constituency/:onsCode` | GET | — | Constituency detail; Supabase anon key |

---

## Data Flows

### Enquiry form → API

```
User input (name, email, organisation, role, message, services)
  → client-side validation (required fields, email format)
  → buildEnquiryMessage() — concatenates fields into message string
  → fetch POST to VITE_ENQUIRY_API_URL/enquiry with JSON body
  → [API validates, rate-limits, sends email]
  → success: display requestId
  → failure (network): fall back to window.location.href = mailto: URL
  → failure (429): display rate-limit message + manual mailto link
```

**Inputs reaching the server:** All form field values. No server-side sanitisation visible in client code; assumed at API layer.

### Cognito PKCE flow

```
startLogin()
  → crypto.getRandomValues(32) → verifier (base64url)
  → sha256(verifier) → challenge
  → crypto.getRandomValues(24) → state (base64url)
  → sessionStorage.setItem(pkceKey, {verifier, meta})
  → localStorage.setItem(pkceKey, {verifier, meta})  ← cross-tab fallback
  → window.location.assign(Cognito /oauth2/authorize?...)

[Cognito Hosted UI]
  → redirect to /callback?code=&state=

exchangeCodeForTokens(code, state)
  → loadPkce(state) → reads verifier from sessionStorage/localStorage
  → POST to Cognito /oauth2/token with verifier
  → storeTokens(tokens) → sessionStorage.setItem("cognito_tokens", ...)
  → clearPkce(state) → removes PKCE material
  → navigate(consumePostAuthRedirect("/portal"))
```

### Constituency query (Supabase)

```
ConstituencyIndex mounts
  → searchConstituencies({query, region, country})
  → supabase.from("constituencies").select(...).ilike/eq(...)
  → Supabase cloud (HTTPS, anon key in request header)
  → data rendered into table / map
```

---

## External Dependencies (runtime)

| Service | Auth | Data sent |
|---------|------|-----------|
| AWS Cognito Hosted UI | PKCE | code + verifier |
| AWS Lambda APIs | Bearer access_token | Enquiry/quote payloads |
| Supabase | Anon key | Constituency queries |
| Xero OAuth | Redirect to Xero | None from client |

---

## Browser Storage Usage

| Storage | Key | Content | Cleared on |
|---------|-----|---------|-----------|
| `sessionStorage` | `cognito_tokens` | access_token, id_token, refresh_token | Logout, expiry, tab close |
| `sessionStorage` | `cognito_pkce_state_v1:<state>` | PKCE verifier + meta | After token exchange, logout |
| `sessionStorage` | `cognito_post_login_redirect` | Redirect path (dead) | Logout |
| `sessionStorage` | `ps_post_auth_redirect_v1` | Validated redirect path | After consume |
| `localStorage` | `cognito_pkce_state_v1:<state>` | PKCE verifier (cross-tab backup) | After token exchange, logout |
| `localStorage` | `ps_cookie_notice_ack_v1` | "true" | Manual clear only |
| `sessionStorage` | Cart data | Cart items | Session end |

---

## Network Attack Surface

| Protocol | Endpoint | Exposes |
|----------|----------|---------|
| HTTPS | CDN origin (production) | Static HTML/JS/CSS/assets |
| HTTPS | `VITE_ENQUIRY_API_URL/enquiry` | Enquiry submission |
| HTTPS | `VITE_API_BASE_URL/*` | Quote, upload, Xero APIs |
| HTTPS | `VITE_SUPABASE_URL` | Constituency data reads |
| HTTPS | AWS Cognito domain | Auth code exchange |

All API communications are HTTPS. No HTTP fallback.

---

## Dependency Attack Surface

Key runtime dependencies and their attack surface:

| Package | Version | Risk |
|---------|---------|------|
| `react`, `react-dom` | ^19.2.3 | Core render; XSS if dangerouslySetInnerHTML used (not found) |
| `react-router-dom` | ^7.10.1 | Navigation; open redirect if misconfigured (mitigated) |
| `@supabase/supabase-js` | ^2.99.2 | DB queries; anon key bundled (accepted) |
| `react-markdown` | ^10.1.0 | Markdown rendering in blog; renders `<a>` links (no `dangerouslySetInnerHTML`) |
| `@giscus/react` | ^3.1.0 | Third-party comment widget (GitHub Discussions); third-party script loaded in iframe |

`@giscus/react` loads a third-party iframe for comments. While iframes are sandboxed, the comment widget has access to its own origin and posts messages to the parent. This is standard for Giscus and considered acceptable.
