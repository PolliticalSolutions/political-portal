// Minimal HMAC-SHA256 JWT helper for volunteer RSVP / unsubscribe tokens.
// No JWT library — per the no-new-packages constraint. Uses Node's built-in
// crypto module. URL-safe base64 (no padding) for the encoded segments.

import crypto from "node:crypto";

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str) {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function timingSafeEqualString(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Sign a payload as a compact JWT (HS256). Adds `iat` if not present.
 *
 * @param {object} payload   — the claims to encode
 * @param {string} secret    — HMAC secret (Lambda env var)
 * @param {{ expiresInSeconds?: number }} [opts]
 * @returns {string}         — `header.payload.signature`
 */
export function signToken(payload, secret, opts = {}) {
  if (!secret) throw new Error("signToken: secret is required");
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = {
    iat: now,
    ...payload,
  };
  if (opts.expiresInSeconds && !body.exp) {
    body.exp = now + opts.expiresInSeconds;
  }
  const h = base64UrlEncode(JSON.stringify(header));
  const p = base64UrlEncode(JSON.stringify(body));
  const signingInput = `${h}.${p}`;
  const sig = crypto.createHmac("sha256", secret).update(signingInput).digest();
  const s = base64UrlEncode(sig);
  return `${signingInput}.${s}`;
}

/**
 * Verify a token. Returns the payload on success; throws on bad signature,
 * malformed token, unsupported algorithm, or expiry.
 *
 * @param {string} token
 * @param {string} secret
 * @returns {object} — payload claims
 */
export function verifyToken(token, secret) {
  if (!secret) throw new Error("verifyToken: secret is required");
  if (typeof token !== "string" || token.length === 0) throw new Error("verifyToken: token is empty");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("verifyToken: malformed token");
  const [h, p, s] = parts;

  let header;
  try {
    header = JSON.parse(base64UrlDecode(h));
  } catch {
    throw new Error("verifyToken: invalid header");
  }
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new Error("verifyToken: unsupported algorithm");
  }

  const signingInput = `${h}.${p}`;
  const expectedSig = base64UrlEncode(
    crypto.createHmac("sha256", secret).update(signingInput).digest()
  );
  if (!timingSafeEqualString(s, expectedSig)) {
    throw new Error("verifyToken: bad signature");
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(p));
  } catch {
    throw new Error("verifyToken: invalid payload");
  }

  if (typeof payload.exp === "number") {
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      const err = new Error("verifyToken: token expired");
      err.expired = true;
      throw err;
    }
  }

  return payload;
}
