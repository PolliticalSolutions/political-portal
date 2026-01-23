import { cognitoConfig } from "../cognitoConfig.js";
import { clearSession, storeTokens } from "../auth/session.js";
export { decodeJwtPayload, getSession, getStoredTokens, isTokenValid } from "../auth/session.js";

const verifierKey = "cognito_code_verifier";
const redirectKey = "cognito_post_login_redirect";

const hasWindow = typeof window !== "undefined";

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
  sessionStorage.removeItem(verifierKey);
  if (!preserveRedirect) {
    sessionStorage.removeItem(redirectKey);
  }
}

export function buildAuthorizeUrl(codeChallenge, { screenHint } = {}) {
  const url = new URL("/oauth2/authorize", cognitoConfig.domain);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cognitoConfig.clientId);
  url.searchParams.set("redirect_uri", cognitoConfig.redirectUri);
  url.searchParams.set("scope", cognitoConfig.scope);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (screenHint) {
    url.searchParams.set("screen_hint", screenHint);
  }
  return url.toString();
}

export async function startLogin(redirectPath = "/portal", { screenHint } = {}) {
  if (!cognitoConfig.domain || !cognitoConfig.clientId || !cognitoConfig.redirectUri) {
    throw new Error("Configure cognitoConfig.domain, clientId, and redirectUri before logging in.");
  }

  const { verifier, challenge } = await createPkcePair();
  persistVerifier(verifier);
  persistRedirectPath(redirectPath);
  const authorizeUrl = buildAuthorizeUrl(challenge, { screenHint });
  window.location.assign(authorizeUrl);
}

export async function startSignUp(redirectPath = "/portal") {
  return startLogin(redirectPath, { screenHint: "signup" });
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

export async function exchangeCodeForTokens(code) {
  const codeVerifier = readVerifier();
  if (!codeVerifier) {
    throw new Error("Missing PKCE verifier in sessionStorage. Restart login.");
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
  sessionStorage.removeItem(verifierKey);
  return tokens;
}
