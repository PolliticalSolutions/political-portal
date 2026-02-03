import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("buildAuthorizeUrl", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.example.test");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.test/callback");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("adds screen_hint=signup when requested", async () => {
    const { buildAuthorizeUrl } = await import("./cognito.js");
    const url = new URL(buildAuthorizeUrl("challenge", { screenHint: "signup" }));
    expect(url.searchParams.get("screen_hint")).toBe("signup");
  });

  it("does not add screen_hint for the default login flow", async () => {
    const { buildAuthorizeUrl } = await import("./cognito.js");
    const url = new URL(buildAuthorizeUrl("challenge"));
    expect(url.searchParams.has("screen_hint")).toBe(false);
  });
});
