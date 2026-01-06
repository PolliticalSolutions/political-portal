const tokensKey = "cognito_tokens";
const hasWindow = typeof window !== "undefined";

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;

  const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;

  try {
    const json = atob(normalized + "=".repeat(padding));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isTokenValid(token, nowMs = Date.now()) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  const expiresAtMs = payload.exp * 1000;
  return expiresAtMs > nowMs;
}

export function getStoredTokens() {
  if (!hasWindow) return null;
  const raw = sessionStorage.getItem(tokensKey);
  if (!raw) return null;
  return safeJsonParse(raw);
}

export function storeTokens(tokens) {
  if (!hasWindow) return;
  sessionStorage.setItem(tokensKey, JSON.stringify(tokens));
}

export function clearSession() {
  if (!hasWindow) return;
  sessionStorage.removeItem(tokensKey);
}

export function getSession(nowMs = Date.now()) {
  const tokens = getStoredTokens();

  if (!tokens?.id_token || !tokens?.access_token) {
    return { isAuthed: false, user: null, expiresAt: null, tokens: null, reason: "missing" };
  }

  const idPayload = decodeJwtPayload(tokens.id_token);
  const accessPayload = decodeJwtPayload(tokens.access_token);

  const idValid = isTokenValid(tokens.id_token, nowMs);
  const accessValid = isTokenValid(tokens.access_token, nowMs);
  const expired = !(idValid && accessValid);

  const expiresAt = Math.min(
    idPayload?.exp ? idPayload.exp * 1000 : Number.POSITIVE_INFINITY,
    accessPayload?.exp ? accessPayload.exp * 1000 : Number.POSITIVE_INFINITY
  );

  if (expired) {
    clearSession();
    return {
      isAuthed: false,
      user: null,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
      tokens: null,
      reason: "expired",
    };
  }

  return {
    isAuthed: true,
    user: idPayload || null,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    tokens,
    reason: null,
  };
}

export { tokensKey };
