import { describe, expect, it } from "vitest";
import { getTwfyApiKey, hasTwfyApiKey } from "./twfy.js";

describe("getTwfyApiKey", () => {
  it("returns a trimmed API key when configured", () => {
    expect(getTwfyApiKey({ VITE_TWFY_API_KEY: "  abc123  " })).toBe("abc123");
  });

  it("returns an empty string when the key is missing", () => {
    expect(getTwfyApiKey({})).toBe("");
    expect(getTwfyApiKey({ VITE_TWFY_API_KEY: "" })).toBe("");
  });
});

describe("hasTwfyApiKey", () => {
  it("returns true when a non-empty API key is present", () => {
    expect(hasTwfyApiKey({ VITE_TWFY_API_KEY: "abc123" })).toBe(true);
  });

  it("returns false when the API key is missing or blank", () => {
    expect(hasTwfyApiKey({})).toBe(false);
    expect(hasTwfyApiKey({ VITE_TWFY_API_KEY: "   " })).toBe(false);
  });
});
