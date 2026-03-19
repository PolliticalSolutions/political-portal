import { describe, expect, it } from "vitest";
import {
  WARWICKSHIRE_COUNTY_COUNCIL,
  getCompositionQuality,
  isWarwickshireVerified,
} from "./localGovQuality.js";

describe("localGovQuality", () => {
  it("treats Warwickshire as manually verified", () => {
    const authority = {
      name: WARWICKSHIRE_COUNTY_COUNCIL,
      composition: { Conservative: 40 },
    };

    expect(isWarwickshireVerified(authority)).toBe(true);
    expect(getCompositionQuality(authority)).toMatchObject({
      status: "verified",
      label: "Manually verified",
    });
  });

  it("marks non-Warwickshire authorities with composition as unverified", () => {
    const authority = {
      name: "Kent County Council",
      composition: { Conservative: 30, Labour: 10 },
    };

    expect(getCompositionQuality(authority)).toMatchObject({
      status: "unverified",
      label: "Unverified — data pending review",
    });
  });

  it("marks null composition as missing", () => {
    const authority = {
      name: "Essex County Council",
      composition: null,
    };

    expect(getCompositionQuality(authority)).toMatchObject({
      status: "missing",
      label: "Composition data not yet available",
    });
  });
});
