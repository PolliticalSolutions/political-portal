import { cognitoConfig } from "../cognitoConfig.js";
import { clearSession, storeTokens } from "../auth/session.js";
export { decodeJwtPayload, getSession, getStoredTokens, isTokenValid } from "../auth/session.js";

const verifierKey = "cognito_code_verifier";
const redirectKey = "cognito_post_login_redirect";
const pkcePrefix = "cognito_pkce_state_v1:";

const hasWindow = typeof window !== "undefined";
const isDev =
  (typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV)) ||
  (typeof process !== "undefined" && process.env?.NODE_ENV !== "production");

function getMissingCognitoEnvKeys() {
  const missing = [];
  if (!cognitoConfig.domain) missing.push("VITE_COGNITO_DOMAIN");
  if (!cognitoConfig.clientId) missing.push("VITE_COGNITO_CLIENT_ID");
  if (!cognitoConfig.redirectUri) missing.push("VITE_COGNITO_REDIRECT_URI");
  return missing;
}

function buildCognitoConfigError(actionLabel) {
  const missingKeys = getMissingCognitoEnvKeys();
  const detail = missingKeys.length
    ? `Missing environment variables: ${missingKeys.join(", ")}.`
    : "Missing required Cognito configuration.";
  const message = isDev
    ? `${actionLabel} is unavailable. ${detail}`
    : `${actionLabel} is currently unavailable. Please contact support.`;
  const error = new Error(message);
  error.missingKeys = missingKeys;
  return error;
}

function base64UrlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

async function createPkcePair() {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const verifier = base64UrlEncode(random);
  const challengeBytes = await sha256(verifier);
  const challenge = base64UrlEncode(challengeBytes);
  return { verifier, challenge };
}

function persistVerifier(verifier) {
  if (hasWindow) {
    sessionStorage.setItem(verifierKey, verifier);
  }
}

function readVerifier() {
  if (!hasWindow) return null;
  return sessionStorage.getItem(verifierKey);
}

function getPkceStorageKey(state) {
  return `${pkcePrefix}${state}`;
}

function createAuthState() {
  const random = new Uint8Array(24);
  crypto.getRandomValues(random);
  return base64UrlEncode(random);
}

function parsePkceRecord(raw, storage, key) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.verifier !== "string" || !parsed.verifier) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function savePkce(state, verifier, meta = {}) {
  if (!hasWindow || !state || !verifier) return;
  const key = getPkceStorageKey(state);
  const payload = JSON.stringify({ verifier, meta, savedAt: Date.now() });
  sessionStorage.setItem(key, payload);
  localStorage.setItem(key, payload);
}

export function loadPkce(state) {
  if (!hasWindow || !state) return null;
  const key = getPkceStorageKey(state);
  const fromSession = parsePkceRecord(sessionStorage.getItem(key), sessionStorage, key);
  if (fromSession) {
    return fromSession;
  }

  const fromLocal = parsePkceRecord(localStorage.getItem(key), localStorage, key);
  if (fromLocal) {
    sessionStorage.setItem(key, JSON.stringify(fromLocal));
    return fromLocal;
  }
  return null;
}

export function clearPkce(state) {
  if (!hasWindow || !state) return;
  const key = getPkceStorageKey(state);
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
}

function clearPkceByPrefix(storage) {
  if (!storage) return;
  const keysToDelete = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && key.startsWith(pkcePrefix)) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach((key) => storage.removeItem(key));
}

function persistTokens(tokens) {
  storeTokens(tokens);
}

function persistRedirectPath(path) {
  if (hasWindow && path) {
    sessionStorage.setItem(redirectKey, path);
  }
}

export function consumePostLoginRedirect(defaultPath = "/portal") {
  if (!hasWindow) return defaultPath;
  const stored = sessionStorage.getItem(redirectKey);
  if (stored) {
    sessionStorage.removeItem(redirectKey);
    return stored;
  }
  return defaultPath;
}

export function clearStoredSession({ preserveRedirect = false } = {}) {
  if (!hasWindow) return;
  clearSession(window.sessionStorage, { preserveRedirect });
  clearPkceByPrefix(sessionStorage);
  clearPkceByPrefix(localStorage);
  sessionStorage.removeItem(verifierKey);
  if (!preserveRedirect) {
    sessionStorage.removeItem(redirectKey);
  }
}

export function buildAuthorizeUrl(codeChallenge, { screenHint, state } = {}) {
  const url = new URL("/oauth2/authorize", cognitoConfig.domain);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cognitoConfig.clientId);
  url.searchParams.set("redirect_uri", cognitoConfig.redirectUri);
  url.searchParams.set("scope", cognitoConfig.scope);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (state) {
    url.searchParams.set("state", state);
  }
  if (screenHint) {
    url.searchParams.set("screen_hint", screenHint);
  }
  return url.toString();
}

export function buildSignUpUrl(codeChallenge, { state } = {}) {
  const url = new URL("/signup", cognitoConfig.domain);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cognitoConfig.clientId);
  url.searchParams.set("redirect_uri", cognitoConfig.redirectUri);
  url.searchParams.set("scope", cognitoConfig.scope);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (state) {
    url.searchParams.set("state", state);
  }
  // Keep a hint as backup for Hosted UI variants that honor this on signup entrypoints.
  url.searchParams.set("screen_hint", "signup");
  return url.toString();
}

function assertLoginConfig(actionLabel) {
  if (!cognitoConfig.domain || !cognitoConfig.clientId || !cognitoConfig.redirectUri) {
    throw buildCognitoConfigError(actionLabel);
  }
}

export async function startLogin(redirectPath = "/portal", { screenHint } = {}) {
  assertLoginConfig("Sign-in");
  const { verifier, challenge } = await createPkcePair();
  const state = createAuthState();
  savePkce(state, verifier, { flow: "login" });
  persistVerifier(verifier);
  persistRedirectPath(redirectPath);
  const authorizeUrl = buildAuthorizeUrl(challenge, { screenHint, state });
  window.location.assign(authorizeUrl);
}

export async function startSignUp(redirectPath = "/portal") {
  assertLoginConfig("Sign-up");
  const { verifier, challenge } = await createPkcePair();
  const state = createAuthState();
  savePkce(state, verifier, { flow: "signup" });
  persistVerifier(verifier);
  persistRedirectPath(redirectPath);
  const signUpUrl = buildSignUpUrl(challenge, { state });
  window.location.assign(signUpUrl);
}

function buildLogoutUrl() {
  const logoutUri = cognitoConfig.logoutUri || cognitoConfig.redirectUri;
  if (!logoutUri) {
    throw new Error("Configure cognitoConfig.logoutUri (or redirectUri) before logging out.");
  }

  const url = new URL("/logout", cognitoConfig.domain);
  url.searchParams.set("client_id", cognitoConfig.clientId);
  url.searchParams.set("logout_uri", logoutUri);
  return url.toString();
}

export function startLogout() {
  if (!cognitoConfig.domain || !cognitoConfig.clientId) {
    throw new Error("Configure cognitoConfig.domain and clientId before logging out.");
  }

  clearStoredSession();
  if (hasWindow) {
    window.location.assign(buildLogoutUrl());
  }
}

function missingPkceHandoffError() {
  const error = new Error("Missing PKCE handoff data.");
  error.code = "PKCE_HANDOFF_MISSING";
  return error;
}

export async function exchangeCodeForTokens(code, state) {
  if (!state) {
    throw missingPkceHandoffError();
  }

  const handoff = loadPkce(state);
  const codeVerifier = handoff?.verifier || readVerifier();
  if (!codeVerifier) {
    throw missingPkceHandoffError();
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cognitoConfig.clientId,
    code_verifier: codeVerifier,
    code,
    redirect_uri: cognitoConfig.redirectUri,
  });

  const tokenUrl = new URL("/oauth2/token", cognitoConfig.domain).toString();
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${message}`);
  }

  const tokens = await response.json();
  persistTokens(tokens);
  clearPkce(state);
  sessionStorage.removeItem(verifierKey);
  return tokens;
}
