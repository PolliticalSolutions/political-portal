import { getDocumentClient } from "./dynamoClient.mjs";

const ORGANISATIONS_TABLE = process.env.ORGANISATIONS_TABLE || "";
const ACTIVE_ORGTYPE_INDEX = "ActiveOrgTypeIndex";

function normalizeOrgType(value) {
  const normalized = (value || "").toString().trim().toUpperCase();
  if (normalized === "ASSOCIATION" || normalized === "FEDERATION") return normalized;
  return "";
}

function normalizePconCodes(value) {
  const raw = Array.isArray(value) ? value : [];
  return raw.map((entry) => (entry || "").toString().trim().toUpperCase()).filter(Boolean);
}

function normalizeOrg(item) {
  if (!item) return null;
  return {
    orgId: (item.orgId || "").toString().trim(),
    name: (item.name || "").toString().trim(),
    orgType: normalizeOrgType(item.orgType),
    pconCodes: normalizePconCodes(item.pconCodes),
    isActive: Boolean(item.isActive),
  };
}

export function createOrgsRepo({
  dynamo = getDocumentClient(),
  tableName = ORGANISATIONS_TABLE,
  indexName = ACTIVE_ORGTYPE_INDEX,
} = {}) {
  if (!tableName) {
    throw new Error("ORGANISATIONS_TABLE is not configured.");
  }

  return {
    async getOrganisation(orgId) {
      if (!orgId) return null;
      const result = await dynamo.get({ TableName: tableName, Key: { orgId } }).promise();
      return normalizeOrg(result.Item || null);
    },

    async listOrganisations({ orgType = "", active = true, limit = 100 } = {}) {
      const normalizedOrgType = normalizeOrgType(orgType);
      const activeKey = active ? "ACTIVE" : "INACTIVE";
      const safeLimit = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 100));

      if (!normalizedOrgType) {
        return [];
      }

      const result = await dynamo
        .query({
          TableName: tableName,
          IndexName: indexName,
          KeyConditionExpression: "activeOrgTypeKey = :activeOrgTypeKey",
          ExpressionAttributeValues: {
            ":activeOrgTypeKey": `${activeKey}#${normalizedOrgType}`,
          },
          ScanIndexForward: true,
          Limit: safeLimit,
        })
        .promise();

      return (result.Items || []).map(normalizeOrg).filter(Boolean);
    },
  };
}

export const orgsRepo = ORGANISATIONS_TABLE ? createOrgsRepo() : null;
