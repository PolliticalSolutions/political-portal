import { describe, it, expect } from "vitest";
import { getRegionFromPostcode, getPostcodeArea, POSTCODE_AREA_TO_REGION } from "./postcodeRegions.js";

describe("postcodeRegions", () => {
  it("returns the correct region for canonical London postcodes", () => {
    expect(getRegionFromPostcode("SW1A 1AA")).toBe("London");
    expect(getRegionFromPostcode("E1 6AA")).toBe("London");
    expect(getRegionFromPostcode("ec2a 4pu")).toBe("London"); // case-insensitive
  });

  it("returns the correct region for cross-boundary tiebreakers", () => {
    expect(getRegionFromPostcode("MK9 1AA")).toBe("South East");
    expect(getRegionFromPostcode("CH1 1AA")).toBe("North West");
    expect(getRegionFromPostcode("SY1 1AA")).toBe("Wales");
    expect(getRegionFromPostcode("PE1 1AA")).toBe("East of England");
    expect(getRegionFromPostcode("DN1 1AA")).toBe("Yorkshire and the Humber");
    expect(getRegionFromPostcode("CA1 1AA")).toBe("North West");
  });

  it("returns the correct region for Scotland / Wales / Northern Ireland", () => {
    expect(getRegionFromPostcode("EH1 1YZ")).toBe("Scotland");
    expect(getRegionFromPostcode("CF10 1PG")).toBe("Wales");
    expect(getRegionFromPostcode("BT1 3QH")).toBe("Northern Ireland");
  });

  it("returns null for an unrecognised postcode area", () => {
    expect(getRegionFromPostcode("XX1 1AA")).toBeNull();
    expect(getRegionFromPostcode("ZZ9 9ZZ")).toBeNull();
  });

  it("returns null for empty or malformed input", () => {
    expect(getRegionFromPostcode("")).toBeNull();
    expect(getRegionFromPostcode(null)).toBeNull();
    expect(getRegionFromPostcode("nonsense")).toBeNull();
  });

  it("extracts the postcode area independently of region lookup", () => {
    expect(getPostcodeArea("SW1A 1AA")).toBe("SW");
    expect(getPostcodeArea("b15 2tt")).toBe("B");
    expect(getPostcodeArea("nothing")).toBeNull();
  });

  it("covers all 12 expected regions", () => {
    const regions = new Set(Object.values(POSTCODE_AREA_TO_REGION));
    expect(regions.size).toBe(12);
    expect(regions.has("London")).toBe(true);
    expect(regions.has("Scotland")).toBe(true);
    expect(regions.has("Northern Ireland")).toBe(true);
  });
});
