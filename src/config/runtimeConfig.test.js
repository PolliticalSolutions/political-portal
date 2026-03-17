import { afterEach, describe, expect, it, vi } from "vitest";
import { getApiBaseUrl, getRuntimeConfig, getSiteUrl } from "./runtimeConfig.js";

describe("getRuntimeConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("strips trailing slashes from base URLs", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com///");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://enquiry.example.com/");
    vi.stubEnv("VITE_UPLOAD_API_URL", "https://upload.example.com/");
    const config = getRuntimeConfig();
    expect(config.apiBaseUrlExplicit).toBe("https://api.example.com");
    expect(config.enquiryApiUrl).toBe("https://enquiry.example.com");
    expect(config.uploadApiBaseUrl).toBe("https://upload.example.com");
  });

  it("returns the default site URL when VITE_SITE_URL is not set", () => {
    vi.stubEnv("VITE_SITE_URL", "");
    const config = getRuntimeConfig();
    expect(config.siteUrl).toBe("https://politicalsolutions.uk");
  });

  it("returns the configured site URL when set", () => {
    vi.stubEnv("VITE_SITE_URL", "https://staging.politicalsolutions.uk/");
    const config = getRuntimeConfig();
    expect(config.siteUrl).toBe("https://staging.politicalsolutions.uk");
  });

  it("prefers VITE_API_BASE_URL over VITE_ENQUIRY_API_URL for apiBaseUrl", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://enquiry.example.com");
    const config = getRuntimeConfig();
    expect(config.apiBaseUrl).toBe("https://api.example.com");
  });

  it("falls back to VITE_ENQUIRY_API_URL for apiBaseUrl when VITE_API_BASE_URL is absent", () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://enquiry.example.com");
    const config = getRuntimeConfig();
    expect(config.apiBaseUrl).toBe("https://enquiry.example.com");
  });

  it("returns empty strings for unset optional keys", () => {
    vi.stubEnv("VITE_UPLOAD_API_URL", "");
    vi.stubEnv("VITE_COGNITO_LOGOUT_URI", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
    const config = getRuntimeConfig();
    expect(config.uploadApiBaseUrl).toBe("");
    expect(config.cognitoLogoutUri).toBe("");
    expect(config.supabaseUrl).toBe("");
    expect(config.supabaseAnonKey).toBe("");
  });
});

describe("getSiteUrl / getApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getSiteUrl returns the default when not configured", () => {
    vi.stubEnv("VITE_SITE_URL", "");
    expect(getSiteUrl()).toBe("https://politicalsolutions.uk");
  });

  it("getApiBaseUrl returns the configured API base URL", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "");
    expect(getApiBaseUrl()).toBe("https://api.example.com");
  });
});
