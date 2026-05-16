import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  extractPostcode,
  normalisePostcode,
  validateAndGeocodePostcode,
  bulkGeocodePostcodes,
} from "./postcodeGeocoding.js";

describe("extractPostcode", () => {
  it("extracts a postcode embedded in a longer address", () => {
    expect(extractPostcode("Association office, 14 High Street, SW1A 1AA")).toBe("SW1A 1AA");
  });

  it("handles a postcode with no space", () => {
    expect(extractPostcode("Town Hall, sw1a1aa")).toBe("SW1A 1AA");
  });

  it("is case-insensitive", () => {
    expect(extractPostcode("Visit ec2a 4pu today")).toBe("EC2A 4PU");
  });

  it("returns null when no postcode is present", () => {
    expect(extractPostcode("Just a venue name with no postcode")).toBeNull();
  });

  it("returns null for null/empty input", () => {
    expect(extractPostcode(null)).toBeNull();
    expect(extractPostcode("")).toBeNull();
  });
});

describe("normalisePostcode", () => {
  it("normalises various forms to canonical spacing", () => {
    expect(normalisePostcode("sw1a1aa")).toBe("SW1A 1AA");
    expect(normalisePostcode("SW1A   1AA")).toBe("SW1A 1AA");
    expect(normalisePostcode("  sw1a 1aa  ")).toBe("SW1A 1AA");
  });

  it("returns null for too-short or too-long inputs", () => {
    expect(normalisePostcode("abc")).toBeNull();
    expect(normalisePostcode("ABCDEFGHIJ")).toBeNull();
  });

  it("returns null for null/empty", () => {
    expect(normalisePostcode(null)).toBeNull();
    expect(normalisePostcode("")).toBeNull();
  });
});

describe("validateAndGeocodePostcode", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("returns valid:true with lat/lon for a successful lookup", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 200, result: { latitude: 51.5, longitude: -0.12 } }),
    });
    const result = await validateAndGeocodePostcode("SW1A 1AA");
    expect(result).toEqual({ valid: true, lat: 51.5, lon: -0.12 });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/postcodes/SW1A%201AA"),
      expect.any(Object)
    );
  });

  it("returns valid:false when postcodes.io 404s", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const result = await validateAndGeocodePostcode("XX99 9XX");
    expect(result.valid).toBe(false);
  });

  it("returns valid:false for malformed input without calling fetch", async () => {
    const result = await validateAndGeocodePostcode("nope");
    expect(result.valid).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns valid:false on network error rather than throwing", async () => {
    global.fetch.mockRejectedValue(new Error("offline"));
    const result = await validateAndGeocodePostcode("SW1A 1AA");
    expect(result.valid).toBe(false);
  });
});

describe("bulkGeocodePostcodes", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("posts canonical postcodes and returns a Map of results", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        result: [
          { query: "SW1A 1AA", result: { latitude: 51.5, longitude: -0.12 } },
          { query: "B15 2TT",  result: { latitude: 52.4, longitude: -1.93 } },
          { query: "XX99 9XX", result: null },
        ],
      }),
    });
    const map = await bulkGeocodePostcodes(["sw1a 1aa", "B15 2TT", "XX99 9XX"]);
    expect(map.size).toBe(2);
    expect(map.get("SW1A 1AA")).toEqual({ lat: 51.5, lon: -0.12 });
    expect(map.get("B15 2TT")).toEqual({ lat: 52.4, lon: -1.93 });
    expect(map.has("XX99 9XX")).toBe(false);
  });

  it("returns an empty Map for empty input without calling fetch", async () => {
    const map = await bulkGeocodePostcodes([]);
    expect(map.size).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("filters out malformed postcodes before calling", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ result: [] }) });
    await bulkGeocodePostcodes(["xx", "yyy", null, undefined]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
