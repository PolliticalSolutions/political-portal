import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitEnquiry } from "./enquiryApi.js";

describe("submitEnquiry", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = undefined;
  });

  it("throws when no API URL is provided", async () => {
    await expect(submitEnquiry("", { name: "Alex" })).rejects.toThrow(
      "Missing enquiry API URL."
    );
  });

  it("POSTs to the correct endpoint, stripping trailing slashes", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, requestId: "req-1" }),
    });

    await submitEnquiry("https://api.example.com/", { name: "Alex" });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.com/enquiry",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alex" }),
      })
    );
  });

  it("returns the parsed response data on success", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, requestId: "req-abc" }),
    });

    const result = await submitEnquiry("https://api.example.com", { name: "Alex" });
    expect(result.requestId).toBe("req-abc");
  });

  it("throws on a non-OK HTTP response", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await expect(submitEnquiry("https://api.example.com", {})).rejects.toThrow(
      "Enquiry request failed (500)."
    );
  });

  it("throws when response body returns ok: false", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false }),
    });

    await expect(submitEnquiry("https://api.example.com", {})).rejects.toThrow(
      "Enquiry request did not succeed."
    );
  });

  it("propagates network errors from fetch", async () => {
    global.fetch.mockRejectedValue(new Error("Network failure"));

    await expect(submitEnquiry("https://api.example.com", {})).rejects.toThrow(
      "Network failure"
    );
  });
});
