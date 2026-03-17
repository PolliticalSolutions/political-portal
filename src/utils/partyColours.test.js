import { describe, expect, it } from "vitest";
import { resolvePartyColour, toHexColor } from "./partyColours.js";

describe("partyColours", () => {
  it("prefers colour_hex from the database when present", () => {
    expect(
      resolvePartyColour({ name: "Labour", short_name: "Lab", colour_hex: "#111111" })
    ).toBe("#111111");
  });

  it("falls back to the shared colour map when colour_hex is missing", () => {
    expect(resolvePartyColour({ name: "Reform UK", short_name: "Reform", colour_hex: null })).toBe(
      "#12B6CF"
    );
    expect(resolvePartyColour("SNP")).toBe("#FDF38E");
  });

  it("normalizes labour co-operative variants to Labour red", () => {
    expect(resolvePartyColour({ name: "Labour Co-operative", colour_hex: null })).toBe("#E4003B");
  });

  it("normalizes hex values without a leading hash", () => {
    expect(toHexColor("0087DC")).toBe("#0087DC");
  });
});
