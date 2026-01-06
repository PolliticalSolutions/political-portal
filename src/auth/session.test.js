import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSession, isTokenValid, tokensKey } from "./session.js";

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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("isTokenValid returns false for null/empty token", () => {
    expect(isTokenValid(null)).toBe(false);
    expect(isTokenValid("")).toBe(false);
  });

  it("isTokenValid returns false for invalid JWT format", () => {
    expect(isTokenValid("not.a.jwt")).toBe(false);
  });

  it("isTokenValid returns false when exp is in the past", () => {
    const pastExp = Math.floor(Date.now() / 1000) - 10;
    const token = makeJwt({ exp: pastExp });
    expect(isTokenValid(token)).toBe(false);
  });

  it("isTokenValid returns true when exp is in the future", () => {
    const futureExp = Math.floor(Date.now() / 1000) + 120;
    const token = makeJwt({ exp: futureExp });
    expect(isTokenValid(token)).toBe(true);
  });

  it("getSession returns isAuthed=false when no tokens in sessionStorage", () => {
    const session = getSession();
    expect(session.isAuthed).toBe(false);
    expect(session.tokens).toBeNull();
    expect(session.user).toBeNull();
  });

  it("getSession returns isAuthed=false and clears tokens when expired", () => {
    const expiredExp = Math.floor(Date.now() / 1000) - 5;
    const tokens = {
      id_token: makeJwt({ exp: expiredExp }),
      access_token: makeJwt({ exp: expiredExp }),
    };
    sessionStorage.setItem(tokensKey, JSON.stringify(tokens));

    const session = getSession();

    expect(session.isAuthed).toBe(false);
    expect(session.reason).toBe("expired");
    expect(sessionStorage.getItem(tokensKey)).toBeNull();
  });

  it("getSession returns user claims and expiresAt when valid", () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const idExp = nowSeconds + 600;
    const accessExp = nowSeconds + 900;
    const tokens = {
      id_token: makeJwt({ exp: idExp, email: "user@example.com", sub: "abc123" }),
      access_token: makeJwt({ exp: accessExp }),
    };
    sessionStorage.setItem(tokensKey, JSON.stringify(tokens));

    const session = getSession();

    expect(session.isAuthed).toBe(true);
    expect(session.user).toMatchObject({ email: "user@example.com", sub: "abc123" });
    expect(session.expiresAt).toBe(idExp * 1000);
    expect(session.tokens).toEqual(tokens);
  });
});
