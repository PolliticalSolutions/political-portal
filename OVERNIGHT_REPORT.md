# Overnight Security and Testing Report

Date: 2026-03-17
Branch: security-and-testing

---

## Summary

A comprehensive security and testing pass was completed on the Political Solutions codebase. The primary finding was that **all 44 test suites were broken** before this pass due to an incompatibility between vitest v4, Node 24, and the existing configuration. After fixing the test infrastructure, 46 new unit tests were written and one open redirect security fix was applied.

---

## Phase 1: Repository Analysis

### Test baseline

**Before:** 0/155 tests passing. All 44 suites failing with:
- `"Vitest failed to find the runner"` — vitest v4 module isolation broke `afterEach` in `setupFiles`
- `"SyntaxError: Cannot use import statement outside a module"` — Node 24 `module-sync` condition causes `react-router-dom` CJS loader to import an ESM file

**After (infrastructure fix only):** 44/44 suites, 155/155 tests passing.

### Key files analysed

- Auth flow: `src/lib/cognito.js`, `src/auth/session.js`, `src/pages/Callback.jsx`
- Protected routing: `src/components/ProtectedRoute.jsx`
- Public redirect safety: `src/utils/postAuthRedirect.js`
- API clients: `src/lib/enquiryApi.js`, `src/lib/quoteApi.js`, `src/lib/uploadApi.js`
- Constituency feature: `src/pages/portal/constituency/constituencyApi.js`
- Configuration: `src/config/runtimeConfig.js`, `src/utils/validateEnv.js`

---

## Phase 2: Test Coverage Expansion

### New test files created

| File | Tests added |
|------|-------------|
| `src/utils/postAuthRedirect.test.js` | 13 |
| `src/utils/formatters.test.js` | 5 |
| `src/utils/validateEnv.test.js` | 5 |
| `src/config/runtimeConfig.test.js` | 8 |
| `src/lib/enquiryApi.test.js` | 6 |
| `src/pages/portal/constituency/constituencyApi.test.js` | 9 |
| **Total new** | **46** |

Notable coverage:
- `postAuthRedirect`: all 7 edge cases of `isSafeInternalPath` tested, including `//evil.com` protocol-relative bypass, `javascript://` scheme, and tampered sessionStorage recovery
- `constituencyApi`: Supabase query layer mocked and tested for error propagation and sort order correctness
- `enquiryApi`: trailing slash stripping, error status code propagation, network failures

**Final test count:** 50 suites, 201 tests, all passing.

---

## Phase 3: Security Hardening

### Finding fixed: `consumePostLoginRedirect` — open redirect risk

`src/lib/cognito.js`'s `consumePostLoginRedirect` function returned any stored `sessionStorage` value without path validation. While the function was not called in production code (dead export), it posed a future risk.

**Fix applied:**
- Added `isSafeInternalPath` validation to `consumePostLoginRedirect` so any stored value that is not a safe internal path is discarded and the default path returned.
- Added `isSafeInternalPath` guard to `persistRedirectPath` so only safe paths are stored.

### No XSS sinks found

Full search of `src/` confirmed zero uses of `dangerouslySetInnerHTML`, `innerHTML =`, `eval()`, or `new Function()`.

---

## Phase 4: Threat Model

See `THREAT_MODEL.md` — full STRIDE analysis covering 11 threats across the public SPA, authenticated portal, and PKCE auth flow.

---

## Phase 5: Attack Surface

See `ATTACK_SURFACE.md` — documents all entry points (public + authenticated), data flows, browser storage usage, external service dependencies, and dependency risk assessment.

---

## Phase 6: CI Pipeline Hardening

Updated `.github/workflows/ci.yml`:
- Added a second audit step that fails on `critical`-severity vulnerabilities (previously all audit failures were `continue-on-error: true`).
- Kept `high`-severity audit as informational with `continue-on-error: true`.

**Note:** Coverage reporting was not added to CI in this pass because `@vitest/coverage-v8` is not installed. Installing it requires a `package.json` change and `npm install`, which requires user confirmation before modifying lockfile. See recommendations below.

---

## Phase 7: Validation

### Tests

```
Test Files: 50 passed (50)
Tests:      201 passed (201)
Duration:   ~8s
```

### Build

Not run in this session (no Bash access for full build). Test suite passes cleanly.

---

## Recommendations (priority order)

1. **Install `@vitest/coverage-v8`** and add coverage reporting to CI:
   ```bash
   npm install --save-dev @vitest/coverage-v8
   ```
   Then add to `vite.config.js` test config:
   ```js
   coverage: { provider: "v8", reporter: ["text", "lcov"], thresholds: { lines: 60 } }
   ```

2. **Deploy a Content-Security-Policy** header at the CDN/hosting layer (see FINDINGS.md FINDING-004 for recommended policy).

3. **Add CSP to `verify-prod-headers.ps1`** to assert it is present in production.

4. **Validate Xero redirect URL** in `quoteApi.js` `startXeroConnect` before calling `window.location.assign`.

5. **Consider removing `consumePostLoginRedirect` export** from `cognito.js` — it is now guarded but still dead code.

---

## Files Modified

| File | Change |
|------|--------|
| `vite.config.js` | pool → vmThreads; react-router-dom ESM alias; remove cache: false |
| `src/pages/EnquirePage.test.jsx` | jsdom 28 compatible location assertions |
| `src/lib/cognito.js` | Open redirect fix on `consumePostLoginRedirect` + `persistRedirectPath` |
| `.github/workflows/ci.yml` | Critical-severity audit gate |

## Files Created

| File | Purpose |
|------|---------|
| `src/utils/postAuthRedirect.test.js` | Unit tests |
| `src/utils/formatters.test.js` | Unit tests |
| `src/utils/validateEnv.test.js` | Unit tests |
| `src/config/runtimeConfig.test.js` | Unit tests |
| `src/lib/enquiryApi.test.js` | Unit tests |
| `src/pages/portal/constituency/constituencyApi.test.js` | Unit tests |
| `FINDINGS.md` | Security and testing findings |
| `THREAT_MODEL.md` | STRIDE threat model |
| `ATTACK_SURFACE.md` | Entry points and data flows |
| `OVERNIGHT_REPORT.md` | This document |
