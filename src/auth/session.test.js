import { afterEach, describe, expect, it } from "vitest";
import { decodeJwtPayload, getSession, isSessionValid, isTokenExpired, tokensKey } from "./session.js";

function makeJwt(payloadObj) {
  const header = { alg: "none", typ: "JWT" };
  const encode = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode(header)}.${encode(payloadObj)}.sig`;
}

describe("session helpers", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("decodeJwtPayload works for base64url payload", () => {
    const token = makeJwt({ sub: "user-123", exp: 1710000000 });
    const payload = decodeJwtPayload(token);
    expect(payload).toMatchObject({ sub: "user-123", exp: 1710000000 });
  });

  it("isTokenExpired returns true when exp is in the past", () => {
    const nowMs = 1000 * 1000;
    const token = makeJwt({ exp: 900 });
    expect(isTokenExpired(token, nowMs)).toBe(true);
  });

  it("isTokenExpired returns false when exp is in the future", () => {
    const nowMs = 1000 * 1000;
    const token = makeJwt({ exp: 2000 });
    expect(isTokenExpired(token, nowMs)).toBe(false);
  });

  it("isTokenExpired treats expiring within skew as expired", () => {
    const nowMs = 1000 * 1000;
    const token = makeJwt({ exp: 1030 });
    expect(isTokenExpired(token, nowMs, 60)).toBe(true);
  });

  it("isSessionValid returns false when missing token", () => {
    sessionStorage.clear();
    expect(isSessionValid(sessionStorage, Date.now())).toBe(false);
  });

  it("isSessionValid returns false when token is expired", () => {
    const nowMs = 1000 * 1000;
    const tokens = { access_token: makeJwt({ exp: 900 }) };
    sessionStorage.setItem(tokensKey, JSON.stringify(tokens));
    expect(isSessionValid(sessionStorage, nowMs)).toBe(false);
  });

  it("isSessionValid returns true when token is valid", () => {
    const nowMs = 1000 * 1000;
    const tokens = { access_token: makeJwt({ exp: 2000 }) };
    sessionStorage.setItem(tokensKey, JSON.stringify(tokens));
    expect(isSessionValid(sessionStorage, nowMs)).toBe(true);
  });

  it("getSession preserves the redirect path when an expired session is detected", () => {
    const nowMs = 1000 * 1000;
    const tokens = { access_token: makeJwt({ exp: 900 }) };
    sessionStorage.setItem(tokensKey, JSON.stringify(tokens));
    sessionStorage.setItem("cognito_post_login_redirect", "/portal");

    const session = getSession(nowMs);

    expect(session.reason).toBe("expired");
    expect(sessionStorage.getItem("cognito_post_login_redirect")).toBe("/portal");
    expect(sessionStorage.getItem(tokensKey)).toBeNull();
  });
});
