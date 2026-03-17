import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  consumePostAuthRedirect,
  isSafeInternalPath,
  setPostAuthRedirect,
} from "./postAuthRedirect.js";

const REDIRECT_KEY = "ps_post_auth_redirect_v1";

describe("isSafeInternalPath", () => {
  it("accepts a simple internal path", () => {
    expect(isSafeInternalPath("/portal")).toBe(true);
  });

  it("accepts a nested internal path", () => {
    expect(isSafeInternalPath("/portal/ops/quotes/ref-123")).toBe(true);
  });

  it("rejects a non-string value", () => {
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
    expect(isSafeInternalPath(42)).toBe(false);
  });

  it("rejects a path that does not start with /", () => {
    expect(isSafeInternalPath("portal")).toBe(false);
    expect(isSafeInternalPath("https://evil.com")).toBe(false);
  });

  it("rejects a protocol-relative URL (//)", () => {
    expect(isSafeInternalPath("//evil.com")).toBe(false);
  });

  it("rejects a path containing ://", () => {
    expect(isSafeInternalPath("/evil://payload")).toBe(false);
  });

  it("rejects javascript: scheme embedded in path", () => {
    // Contains :// so should be rejected
    expect(isSafeInternalPath("/javascript://alert")).toBe(false);
  });
});

describe("setPostAuthRedirect / consumePostAuthRedirect", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("stores a safe path and returns it on consume", () => {
    setPostAuthRedirect("/portal/uploads");
    expect(consumePostAuthRedirect()).toBe("/portal/uploads");
  });

  it("returns the fallback when nothing is stored", () => {
    expect(consumePostAuthRedirect()).toBe("/portal");
    expect(consumePostAuthRedirect("/custom-fallback")).toBe("/custom-fallback");
  });

  it("removes the stored value after consuming it (single-use)", () => {
    setPostAuthRedirect("/portal/pricing");
    consumePostAuthRedirect();
    expect(sessionStorage.getItem(REDIRECT_KEY)).toBeNull();
  });

  it("does not store an unsafe external URL", () => {
    setPostAuthRedirect("https://evil.com/steal");
    expect(sessionStorage.getItem(REDIRECT_KEY)).toBeNull();
  });

  it("does not store a protocol-relative URL", () => {
    setPostAuthRedirect("//evil.com");
    expect(sessionStorage.getItem(REDIRECT_KEY)).toBeNull();
  });

  it("returns the fallback if a previously stored value is later deemed unsafe", () => {
    // Manually force an unsafe value into storage (bypassing setPostAuthRedirect)
    sessionStorage.setItem(REDIRECT_KEY, "//evil.com");
    expect(consumePostAuthRedirect()).toBe("/portal");
    expect(sessionStorage.getItem(REDIRECT_KEY)).toBeNull();
  });
});
