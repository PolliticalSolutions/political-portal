import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("cognito helpers", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.example.test");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.test/callback");
    sessionStorage.clear();
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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
    const url = new URL(buildSignUpUrl("challenge", { state: "state-1" }));

    expect(url.pathname).toBe("/signup");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(`${window.location.origin}/callback`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("screen_hint")).toBe("signup");
  });

  it("resolves production non-www to canonical www origin", async () => {
    const { resolveCanonicalOrigin, getCanonicalRedirectTarget } = await import("./cognito.js");
    const origin = resolveCanonicalOrigin({
      isProd: true,
      currentOrigin: "https://politicalsolutions.uk",
      currentHostname: "politicalsolutions.uk",
    });

    const target = getCanonicalRedirectTarget({
      isProd: true,
      currentHref: "https://politicalsolutions.uk/callback?code=abc&state=1",
    });

    expect(origin).toBe("https://www.politicalsolutions.uk");
    expect(target).toBe("https://www.politicalsolutions.uk/callback?code=abc&state=1");
  });

  it("uses VITE_PUBLIC_ORIGIN as canonical origin in production", async () => {
    const { resolveCanonicalOrigin } = await import("./cognito.js");
    const origin = resolveCanonicalOrigin({
      isProd: true,
      publicOrigin: "https://www.politicalsolutions.uk/",
      currentOrigin: "https://politicalsolutions.uk",
      currentHostname: "politicalsolutions.uk",
    });
    expect(origin).toBe("https://www.politicalsolutions.uk");
  });

  it("savePkce writes to both sessionStorage and localStorage", async () => {
    const { savePkce } = await import("./cognito.js");
    savePkce("state-save", "verifier-save", { flow: "login" });

    const key = "cognito_pkce_state_v1:state-save";
    expect(sessionStorage.getItem(key)).toContain("verifier-save");
    expect(localStorage.getItem(key)).toContain("verifier-save");
  });

  it("loadPkce prefers sessionStorage when both are present", async () => {
    const { loadPkce } = await import("./cognito.js");
    const key = "cognito_pkce_state_v1:state-load-session";
    sessionStorage.setItem(key, JSON.stringify({ verifier: "session-verifier", meta: { flow: "login" } }));
    localStorage.setItem(key, JSON.stringify({ verifier: "local-verifier", meta: { flow: "signup" } }));

    const record = loadPkce("state-load-session");
    expect(record?.verifier).toBe("session-verifier");
    expect(record?.meta?.flow).toBe("login");
  });

  it("loadPkce falls back to localStorage and rehydrates sessionStorage", async () => {
    const { loadPkce } = await import("./cognito.js");
    const key = "cognito_pkce_state_v1:state-load-local";
    localStorage.setItem(key, JSON.stringify({ verifier: "local-verifier", meta: { flow: "signup" } }));

    const record = loadPkce("state-load-local");
    expect(record?.verifier).toBe("local-verifier");
    expect(sessionStorage.getItem(key)).toContain("local-verifier");
  });

  it("clearPkce removes data from both storages", async () => {
    const { savePkce, clearPkce } = await import("./cognito.js");
    const key = "cognito_pkce_state_v1:state-clear";
    savePkce("state-clear", "verifier-clear", { flow: "login" });
    clearPkce("state-clear");

    expect(sessionStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("exchanges code using localStorage fallback when sessionStorage copy is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "token" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { buildAuthorizeUrl, savePkce, exchangeCodeForTokens } = await import("./cognito.js");
    const key = "cognito_pkce_state_v1:state-exchange";
    const authorizeUrl = new URL(buildAuthorizeUrl("challenge", { state: "state-exchange" }));
    const authorizeRedirectUri = authorizeUrl.searchParams.get("redirect_uri");

    savePkce("state-exchange", "verifier-local-only", { flow: "signup" });
    sessionStorage.removeItem(key);

    await exchangeCodeForTokens("code-123", "state-exchange");

    const body = fetchMock.mock.calls[0][1].body.toString();
    expect(body).toContain("code_verifier=verifier-local-only");
    expect(body).toContain(`redirect_uri=${encodeURIComponent(authorizeRedirectUri)}`);
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });
});
