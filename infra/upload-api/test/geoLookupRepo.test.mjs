import { describe, expect, it, vi } from "vitest";
import { createGeoLookupRepo } from "../src/geoLookupRepo.mjs";

function resolved(value) {
  return { promise: async () => value };
}

describe("geoLookupRepo", () => {
  it("validates wards against pcon using direct ward key pattern", async () => {
    const get = vi.fn(({ Key }) => {
      if (Key.wardCode === "W1001") {
        return resolved({ Item: { wardCode: "W1001", pconCode: "E14000637" } });
      }
      if (Key.wardCode === "W1002") {
        return resolved({ Item: { wardCode: "W1002", pconCode: "E14000637" } });
      }
      return resolved({ Item: null });
    });

    const repo = createGeoLookupRepo({
      dynamo: { get },
      tableName: "geo",
      mode: "direct",
      wardKeyAttr: "wardCode",
      pconAttr: "pconCode",
    });

    const valid = await repo.wardsBelongToPcon(["W1001", "W1002"], "E14000637");
    expect(valid).toEqual({ ok: true, invalidWardCodes: [] });

    const invalid = await repo.wardsBelongToPcon(["W1001", "W9999"], "E14000637");
    expect(invalid.ok).toBe(false);
    expect(invalid.invalidWardCodes).toEqual(["W9999"]);
  });

  it("falls back to composite PK/SK lookup pattern", async () => {
    const get = vi.fn(({ Key }) => {
      if (Key.pk === "WARD#W2001" && Key.sk === "WARD#W2001") {
        return resolved({ Item: { pk: "WARD#W2001", sk: "WARD#W2001", PCON24CD: "E14000637" } });
      }
      return resolved({ Item: null });
    });

    const repo = createGeoLookupRepo({
      dynamo: { get },
      tableName: "geo",
      mode: "composite",
      pkAttr: "pk",
      skAttr: "sk",
      wardPkPrefix: "WARD#",
      pconAttr: "PCON24CD",
    });

    const result = await repo.wardsBelongToPcon(["W2001"], "E14000637");
    expect(result).toEqual({ ok: true, invalidWardCodes: [] });
  });
});
