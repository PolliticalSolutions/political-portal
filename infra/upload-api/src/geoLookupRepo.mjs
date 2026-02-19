import { getDocumentClient } from "./dynamoClient.mjs";

const GEO_LOOKUP_TABLE = process.env.GEO_LOOKUP_TABLE || "";
const GEO_LOOKUP_MODE = (process.env.GEO_LOOKUP_MODE || "auto").toLowerCase();
const GEO_LOOKUP_WARD_KEY_ATTR = process.env.GEO_LOOKUP_WARD_KEY_ATTR || "wardCode";
const GEO_LOOKUP_PCON_ATTR = process.env.GEO_LOOKUP_PCON_ATTR || "pconCode";
const GEO_LOOKUP_PK_ATTR = process.env.GEO_LOOKUP_PK_ATTR || "pk";
const GEO_LOOKUP_SK_ATTR = process.env.GEO_LOOKUP_SK_ATTR || "sk";
const GEO_LOOKUP_WARD_PK_PREFIX = process.env.GEO_LOOKUP_WARD_PK_PREFIX || "WARD#";

function normalizeCode(value) {
  return (value || "").toString().trim().toUpperCase();
}

function uniqueCodes(values) {
  return Array.from(new Set(values.map(normalizeCode).filter(Boolean)));
}

function extractPconCode(item, configuredAttr) {
  if (!item || typeof item !== "object") return "";
  const candidates = [
    configuredAttr,
    "pconCode",
    "PCON24CD",
    "constituencyCode",
    "pcon",
    "pcon24Code",
  ];

  for (const attr of candidates) {
    const value = normalizeCode(item[attr]);
    if (value) return value;
  }

  return "";
}

function buildWardLookupKeys(wardCode, options) {
  const mode = options.mode;
  const keys = [];

  if (mode === "auto" || mode === "direct") {
    keys.push({ [options.wardKeyAttr]: wardCode });
  }

  if (mode === "auto" || mode === "composite") {
    const wardPk = `${options.wardPkPrefix}${wardCode}`;
    keys.push({ [options.pkAttr]: wardPk, [options.skAttr]: wardPk });
    keys.push({ [options.pkAttr]: wardPk, [options.skAttr]: "META" });
  }

  return keys;
}

export function createGeoLookupRepo({
  dynamo = getDocumentClient(),
  tableName = GEO_LOOKUP_TABLE,
  mode = GEO_LOOKUP_MODE,
  wardKeyAttr = GEO_LOOKUP_WARD_KEY_ATTR,
  pconAttr = GEO_LOOKUP_PCON_ATTR,
  pkAttr = GEO_LOOKUP_PK_ATTR,
  skAttr = GEO_LOOKUP_SK_ATTR,
  wardPkPrefix = GEO_LOOKUP_WARD_PK_PREFIX,
} = {}) {
  if (!tableName) {
    throw new Error("GEO_LOOKUP_TABLE is not configured.");
  }

  const options = {
    mode,
    wardKeyAttr,
    pconAttr,
    pkAttr,
    skAttr,
    wardPkPrefix,
  };

  return {
    async getWardRecord(wardCode) {
      const normalizedWardCode = normalizeCode(wardCode);
      if (!normalizedWardCode) return null;

      const lookupKeys = buildWardLookupKeys(normalizedWardCode, options);
      for (const key of lookupKeys) {
        const result = await dynamo.get({ TableName: tableName, Key: key }).promise();
        if (result.Item) {
          return result.Item;
        }
      }

      return null;
    },

    async wardsBelongToPcon(wardCodes = [], pconCode = "") {
      const normalizedPconCode = normalizeCode(pconCode);
      const normalizedWards = uniqueCodes(Array.isArray(wardCodes) ? wardCodes : []);
      if (!normalizedPconCode) {
        return { ok: false, invalidWardCodes: normalizedWards };
      }
      if (normalizedWards.length === 0) {
        return { ok: true, invalidWardCodes: [] };
      }

      const invalidWardCodes = [];
      for (const wardCode of normalizedWards) {
        const item = await this.getWardRecord(wardCode);
        const wardPconCode = extractPconCode(item, options.pconAttr);
        if (!wardPconCode || wardPconCode !== normalizedPconCode) {
          invalidWardCodes.push(wardCode);
        }
      }

      return { ok: invalidWardCodes.length === 0, invalidWardCodes };
    },
  };
}

export const geoLookupRepo = GEO_LOOKUP_TABLE ? createGeoLookupRepo() : null;
