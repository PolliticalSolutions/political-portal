# Security and Testing Findings

Generated: 2026-03-17
Branch: security-and-testing

---

## Test Infrastructure

### FINDING-001: All tests were failing before this pass (vitest v4 + Node 24)

**Severity:** Critical (blocked all CI test validation)
**Status:** Fixed

vitest v4 changed module isolation behaviour. Combined with Node 24's handling of the `module-sync` export condition in react-router-dom, **all 44 test suites failed** before any code changes.

Root causes:
1. Default `threads` pool in vitest v4 creates fresh module instances per file, causing "Vitest failed to find the runner" for any file that registers `afterEach` hooks in a `setupFiles` module.
2. Node 24 resolves `require("react-router/dom")` to the `.mjs` ESM build via the `module-sync` condition, producing `SyntaxError: Cannot use import statement outside a module` in jsdom's CJS loader.
3. jsdom 28 makes `window.location` non-configurable, breaking tests that used `Object.defineProperty(window, "location", ...)`.

**Fixes applied:**
- `vite.config.js`: switched `pool` to `"vmThreads"` (uses VM contexts that properly share the vitest runner instance).
- `vite.config.js`: added `alias` to point `react-router-dom` at its ESM `dist/index.mjs`, bypassing the CJS/ESM conflict entirely.
- `EnquirePage.test.jsx`: rewrote `window.location.href` assertions to be compatible with jsdom 28 (no interception of location assignments; DOM-visible side-effects verified instead).

**After fixes:** 44/44 suites, 155/155 tests passing.

---

## Security Findings

### FINDING-002: `consumePostLoginRedirect` — dead export with open redirect risk

**Severity:** Low (function is not called in production code)
**Status:** Informational — consider removing the export

`src/lib/cognito.js` exports `consumePostLoginRedirect` (line 219). This function reads a path from `sessionStorage` and returns it without validating it is a safe internal path. If the function were wired up to a navigation call (e.g. `window.location.assign(consumed)`), an attacker who could write an arbitrary string to `sessionStorage["cognito_post_login_redirect"]` could achieve open redirect.

**Actual risk:** Production `Callback.jsx` uses `consumePostAuthRedirect` from `postAuthRedirect.js` (which correctly validates with `isSafeInternalPath`). The `consumePostLoginRedirect` export is dead code.

**Recommendation:** Remove `consumePostLoginRedirect` from `cognito.js` to eliminate the dead code and avoid future accidental misuse.

---

### FINDING-003: `startXeroConnect` redirects to server-supplied URL without client-side validation

**Severity:** Low (requires first-party API to be compromised)
**Location:** `src/lib/quoteApi.js` line 62–71

`window.location.assign(redirectUrl)` where `redirectUrl` comes from the API response. If the backend were compromised or returned an attacker-controlled URL, this would redirect the user to an arbitrary site. Since `redirectUrl` is a Xero OAuth URL constructed by the first-party backend, this is acceptable at present, but the pattern is worth noting.

**Recommendation:** Add a client-side check that `redirectUrl` begins with `https://login.xero.com/` before assigning.

---

### FINDING-004: No Content-Security-Policy header

**Severity:** Medium
**Status:** Informational — not introduced by this codebase (deployment platform dependent)

The `verify-prod-headers.ps1` script checks for HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy but does **not** check for `Content-Security-Policy`. The production site has no CSP verified in CI.

A CSP would significantly reduce XSS impact (though no XSS vectors were found — see FINDING-005).

**Recommendation:** Add a CSP header at the hosting/CDN layer. Minimum useful policy:
```
Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self' https://*.supabase.co https://*.amazonaws.com; img-src 'self' data:; frame-ancestors 'none'
```
Update `verify-prod-headers.ps1` to assert its presence.

---

### FINDING-005: No `dangerouslySetInnerHTML` or `eval` usage

**Severity:** N/A — clean
**Status:** Confirmed safe

A full search of `src/` found zero uses of `dangerouslySetInnerHTML`, `innerHTML =`, `eval()`, or `new Function()`. No XSS sinks were identified in the React component layer.

---

### FINDING-006: Token stored in `sessionStorage` — acceptable choice

**Severity:** N/A — design decision noted
**Location:** `src/auth/session.js`

Cognito tokens (access_token, id_token) are stored in `sessionStorage["cognito_tokens"]`. This is cleared on tab/window close and is not accessible cross-origin. The alternative (memory-only) would lose tokens on page refresh. The risk is limited to XSS attacks that can read `sessionStorage`, which is mitigated by the absence of XSS sinks (FINDING-005).

---

### FINDING-007: PKCE state stored in both `sessionStorage` and `localStorage`

**Severity:** Low
**Location:** `src/lib/cognito.js` — `savePkce()` function

PKCE verifiers are written to both `sessionStorage` and `localStorage` as a cross-tab fallback. `localStorage` persists until explicitly cleared or until `clearPkce` / `clearStoredSession` is called. The PKCE material is cleared after token exchange and on logout (`clearPkceByPrefix`). The residual window between login initiation and callback handling is short.

**Recommendation:** This is an acceptable tradeoff for cross-tab resilience. No immediate action required, but monitor if auth flow is redesigned.

---

### FINDING-008: `console.log`/`console.warn`/`console.error` in production code

**Severity:** Low (informational leakage)
**Files affected:**
- `src/pages/portal/constituency/ConstituencyIndex.jsx` — `console.warn` on invalid/duplicate ONS codes
- `src/pages/portal/constituency/ConstituencyMapClient.jsx` — `console.error` on GeoJSON problems
- `src/main.jsx` — `console.error` on unhandled rejection
- `src/components/ErrorBoundary.jsx` — `console.error` on caught errors

These are behind the authenticated portal (`/portal`) and contain no sensitive data. They are acceptable for operational debugging. Consider replacing with a structured logger that can be silenced in production if desired.

---

## Test Coverage

### New tests added in this pass

| File | Tests | Coverage target |
|------|-------|-----------------|
| `src/utils/postAuthRedirect.test.js` | 13 | Open redirect guards, sessionStorage lifecycle |
| `src/utils/formatters.test.js` | 5 | Currency formatting edge cases |
| `src/utils/validateEnv.test.js` | 5 | Environment variable validation logic |
| `src/config/runtimeConfig.test.js` | 8 | URL normalisation, env var precedence |
| `src/lib/enquiryApi.test.js` | 6 | HTTP client error paths, trailing-slash normalisation |
| `src/pages/portal/constituency/constituencyApi.test.js` | 9 | Supabase query layer, error propagation, sort order |

**Totals before this pass:** 44 suites × failing = 0 tests
**After infrastructure fix:** 44 suites, 155 tests passing
**After new test files:** 50 suites, 201 tests passing

---

## CI Pipeline

### FINDING-009: `npm audit` configured `continue-on-error: true`

**Severity:** Low
**Location:** `.github/workflows/ci.yml`

The audit step will not block a merge even if high-severity vulnerabilities are found. This is intentional (avoids false positive blocks from transitive deps), but means vulnerabilities can be silently introduced.

**Recommendation:** Review audit output regularly. Consider failing the build on `critical`-severity findings while keeping `continue-on-error` for `high`.

### FINDING-010: No coverage enforcement in CI

**Severity:** Low
**Location:** `.github/workflows/ci.yml`

Tests run but no minimum coverage threshold is configured. Coverage reporting requires `@vitest/coverage-v8` (not currently installed).

**Recommendation:** Install `@vitest/coverage-v8` and add a coverage gate (e.g. 60% line coverage minimum) to the CI pipeline.
