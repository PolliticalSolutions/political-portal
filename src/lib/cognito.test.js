import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl } from "./cognito.js";

describe("buildAuthorizeUrl", () => {
  it("adds screen_hint=signup when requested", () => {
    const url = new URL(buildAuthorizeUrl("challenge", { screenHint: "signup" }));
    expect(url.searchParams.get("screen_hint")).toBe("signup");
  });

  it("does not add screen_hint for the default login flow", () => {
    const url = new URL(buildAuthorizeUrl("challenge"));
    expect(url.searchParams.has("screen_hint")).toBe(false);
  });
});
