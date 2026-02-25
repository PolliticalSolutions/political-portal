import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("cognito url builders", () => {
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

  it("builds signup URL using hosted ui /signup path", async () => {
    const { buildSignUpUrl } = await import("./cognito.js");
    const url = new URL(buildSignUpUrl("challenge"));

    expect(url.pathname).toBe("/signup");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.test/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("screen_hint")).toBe("signup");
  });
});
