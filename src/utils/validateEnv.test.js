import { afterEach, describe, expect, it, vi } from "vitest";
import { getMissingEnvKeys, validateEnv } from "./validateEnv.js";

describe("getMissingEnvKeys", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns all required keys when none are set", () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "");
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "");

    const missing = getMissingEnvKeys();
    expect(missing).toContain("VITE_COGNITO_DOMAIN");
    expect(missing).toContain("VITE_COGNITO_CLIENT_ID");
    expect(missing).toContain("VITE_COGNITO_REDIRECT_URI");
    expect(missing).toContain("VITE_API_BASE_URL");
    expect(missing).toContain("VITE_ENQUIRY_API_URL");
  });

  it("returns an empty array when all required env vars are set", () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "auth.example.com");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client123");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.com/callback");
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "");

    const missing = getMissingEnvKeys();
    expect(missing).toHaveLength(0);
  });

  it("accepts VITE_ENQUIRY_API_URL as the sole API base URL", () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "auth.example.com");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client123");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.com/callback");
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://enquiry.example.com");

    const missing = getMissingEnvKeys();
    expect(missing).not.toContain("VITE_API_BASE_URL");
    expect(missing).not.toContain("VITE_ENQUIRY_API_URL");
  });
});

describe("validateEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws with missingKeys when required vars are absent", () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "");
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "");

    let thrown;
    try {
      validateEnv();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect(thrown.missingKeys).toBeInstanceOf(Array);
    expect(thrown.missingKeys.length).toBeGreaterThan(0);
  });

  it("does not throw when all required vars are set", () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "auth.example.com");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client123");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.com/callback");
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "");

    expect(() => validateEnv()).not.toThrow();
  });
});
