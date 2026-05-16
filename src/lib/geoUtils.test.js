import { describe, it, expect, vi, beforeEach } from "vitest";
import { featureCentroid, getConstituencyCentroids, _resetCentroidCache } from "./geoUtils.js";

beforeEach(() => {
  _resetCentroidCache();
});

describe("featureCentroid", () => {
  it("returns the centroid of a simple Polygon (unit square)", () => {
    const feature = {
      geometry: {
        type: "Polygon",
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
      },
    };
    const result = featureCentroid(feature);
    expect(result[0]).toBeCloseTo(5, 5);
    expect(result[1]).toBeCloseTo(5, 5);
  });

  it("returns the centroid of the LARGEST sub-polygon for MultiPolygon", () => {
    // Two squares: a tiny one near (1,1) and a much larger one near (100, 100).
    // The pin must land on the larger square (centroid ~ [100, 100]).
    const feature = {
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
          [[[90, 90], [110, 90], [110, 110], [90, 110], [90, 90]]],
        ],
      },
    };
    const result = featureCentroid(feature);
    expect(result[0]).toBeCloseTo(100, 5);
    expect(result[1]).toBeCloseTo(100, 5);
  });

  it("warns and returns null for an unsupported geometry type", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = featureCentroid({
      geometry: { type: "Point", coordinates: [1, 2] },
      properties: { PCON24CD: "E00000001" },
    });
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns null for missing geometry", () => {
    expect(featureCentroid({})).toBeNull();
    expect(featureCentroid(null)).toBeNull();
  });
});

describe("getConstituencyCentroids", () => {
  it("builds a Map keyed by uppercase PCON24CD", () => {
    const geoData = {
      features: [
        {
          properties: { PCON24CD: "e14000637" },
          geometry: { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] },
        },
        {
          properties: { PCON24CD: "S14000001" },
          geometry: {
            type: "MultiPolygon",
            coordinates: [[[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]]],
          },
        },
      ],
    };
    const map = getConstituencyCentroids(geoData);
    expect(map.get("E14000637")).toBeDefined();
    expect(map.get("S14000001")).toBeDefined();
    expect(map.size).toBe(2);
  });

  it("returns an empty Map for empty input", () => {
    expect(getConstituencyCentroids({ features: [] }).size).toBe(0);
    expect(getConstituencyCentroids(null).size).toBe(0);
  });
});
