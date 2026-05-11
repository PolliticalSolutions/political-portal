const tokensKey = "cognito_tokens";
const redirectKey = "cognito_post_login_redirect";
const hasWindow = typeof window !== "undefined";

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const base64 = normalized + "=".repeat(padding);
  if (typeof atob === "function") {
    return atob(base64);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64").toString("utf-8");
  }
  return null;
}

export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const json = base64UrlDecode(parts[1]);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getJwtExp(token) {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === "number" ? payload.exp : null;
}

export function isTokenExpired(token, nowMs = Date.now(), skewSec = 60) {
  const exp = getJwtExp(token);
  if (!exp) return true;
  const nowSec = nowMs / 1000;
  return nowSec >= exp - skewSec;
}

function resolveSessionStorage(sessionStorageLike) {
  if (sessionStorageLike) return sessionStorageLike;
  if (!hasWindow) return null;
  return window.sessionStorage;
}

function checkTokensValid(tokens, nowMs) {
  if (!tokens) return false;
  const accessToken = tokens.access_token;
  const idToken = tokens.id_token;
  if (!accessToken && !idToken) return false;
  const accessValid = accessToken ? !isTokenExpired(accessToken, nowMs) : false;
  const idValid = idToken ? !isTokenExpired(idToken, nowMs) : false;
  return accessValid || idValid;
}

// Checks localStorage first (persists across browser restarts), then falls back
// to the passed sessionStorage for backward compatibility.
export function isSessionValid(sessionStorageLike, nowMs = Date.now()) {
  if (hasWindow) {
    const localRaw = localStorage.getItem(tokensKey);
    if (localRaw) {
      const localTokens = safeJsonParse(localRaw);
      if (checkTokensValid(localTokens, nowMs)) return true;
    }
  }

  const storage = resolveSessionStorage(sessionStorageLike);
  if (!storage) return false;
  const raw = storage.getItem(tokensKey);
  if (!raw) return false;
  return checkTokensValid(safeJsonParse(raw), nowMs);
}

export function isTokenValid(token, nowMs = Date.now(), skewSec = 60) {
  return !isTokenExpired(token, nowMs, skewSec);
}

// Reads from localStorage first so tokens survive browser close/reopen.
export function getStoredTokens() {
  if (!hasWindow) return null;
  const raw = localStorage.getItem(tokensKey) ?? sessionStorage.getItem(tokensKey);
  if (!raw) return null;
  return safeJsonParse(raw);
}

// Writes to localStorage (persistent) and sessionStorage (keeps existing code working).
export function storeTokens(tokens) {
  if (!hasWindow) return;
  const value = JSON.stringify(tokens);
  try { localStorage.setItem(tokensKey, value); } catch { /* quota exceeded */ }
  try { sessionStorage.setItem(tokensKey, value); } catch { /* quota exceeded */ }
}

// Clears from both storages so logout is complete.
export function clearSession(
  sessionStorageLike,
  { preserveRedirect = false } = {}
) {
  const storage = resolveSessionStorage(sessionStorageLike);
  if (storage) {
    storage.removeItem(tokensKey);
    if (!preserveRedirect) {
      storage.removeItem(redirectKey);
    }
  }
  if (hasWindow) {
    try { localStorage.removeItem(tokensKey); } catch { /* ignore */ }
  }
}

export function getSession(nowMs = Date.now()) {
  const tokens = getStoredTokens();
  const accessToken = tokens?.access_token;
  const idToken = tokens?.id_token;
  const hasToken = Boolean(accessToken || idToken);
  const sessionValid = hasWindow ? isSessionValid(window.sessionStorage, nowMs) : false;

  if (!hasToken) {
    return { isAuthed: false, user: null, expiresAt: null, tokens: null, reason: "missing" };
  }

  const idPayload = idToken ? decodeJwtPayload(idToken) : null;

  if (!sessionValid) {
    clearSession(window.sessionStorage, { preserveRedirect: true });
    return {
      isAuthed: false,
      user: null,
      expiresAt: null,
      tokens: null,
      reason: "expired",
    };
  }

  const accessExpired = accessToken ? isTokenExpired(accessToken, nowMs) : true;
  const idExpired = idToken ? isTokenExpired(idToken, nowMs) : true;
  const accessExp = accessToken ? getJwtExp(accessToken) : null;
  const idExp = idToken ? getJwtExp(idToken) : null;
  const validExpMs = [];
  if (accessExp && !accessExpired) validExpMs.push(accessExp * 1000);
  if (idExp && !idExpired) validExpMs.push(idExp * 1000);

  return {
    isAuthed: true,
    user: idPayload || null,
    expiresAt: validExpMs.length ? Math.min(...validExpMs) : null,
    tokens,
    reason: null,
  };
}

export { tokensKey };
