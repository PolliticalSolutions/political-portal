import { describe, expect, it } from "vitest";
import { isPublicSitePath } from "./publicRoutes.js";

describe("isPublicSitePath", () => {
  it.each([
    "/",
    "/services",
    "/constituency-intelligence",
    "/services/election-support",
    "/enquire",
    "/subscribe",
    "/subscriptions",
    "/cart",
    "/checkout",
    "/checkout/confirmation",
    "/blog",
    "/blog/example-post",
    "/privacy",
    "/terms",
    "/cookies",
  ])("includes the documented public route %s", (pathname) => {
    expect(isPublicSitePath(pathname)).toBe(true);
  });

  it.each([
    "/login",
    "/callback",
    "/signup",
    "/verify",
    "/portal",
    "/portal/uploads",
    "/campaign/volunteer",
    "/campaign/rsvp",
    "/campaign/unsubscribe",
    "/blog/post/nested",
    "/unknown",
  ])("excludes the protected or undocumented route %s", (pathname) => {
    expect(isPublicSitePath(pathname)).toBe(false);
  });

  it("accepts a trailing slash only for an included route", () => {
    expect(isPublicSitePath("/services/")).toBe(true);
    expect(isPublicSitePath("/portal/")).toBe(false);
  });
});
