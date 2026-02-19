import { getDocumentClient } from "./dynamoClient.mjs";

const USERS_TABLE = process.env.USERS_TABLE || "";
const STATUS_INDEX = "StatusCreatedAtIndex";
const ALLOWED_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(value, fallback = "PENDING") {
  const normalized = (value || "").toString().trim().toUpperCase();
  if (!ALLOWED_STATUSES.has(normalized)) return fallback;
  return normalized;
}

function normalizeOrgType(value) {
  const normalized = (value || "").toString().trim().toUpperCase();
  if (normalized === "ASSOCIATION" || normalized === "FEDERATION") return normalized;
  return "";
}

function normalizePconCodes(singleCode, multipleCodes) {
  const codes = Array.isArray(multipleCodes) ? multipleCodes : singleCode ? [singleCode] : [];
  return codes.map((entry) => (entry || "").toString().trim().toUpperCase()).filter(Boolean);
}

export function createUsersRepo({ dynamo = getDocumentClient(), tableName = USERS_TABLE } = {}) {
  if (!tableName) {
    throw new Error("USERS_TABLE is not configured.");
  }

  return {
    async getUser(userId) {
      if (!userId) return null;
      const result = await dynamo.get({ TableName: tableName, Key: { userId } }).promise();
      return result.Item || null;
    },

    async putUserIfAbsent(userRecord) {
      if (!userRecord?.userId) {
        throw new Error("userId is required.");
      }
      const item = {
        status: "PENDING",
        createdAt: nowIso(),
        ...userRecord,
      };

      try {
        await dynamo
          .put({
            TableName: tableName,
            Item: item,
            ConditionExpression: "attribute_not_exists(userId)",
          })
          .promise();
        return { created: true, item };
      } catch (error) {
        if (error?.code === "ConditionalCheckFailedException") {
          const existing = await this.getUser(item.userId);
          return { created: false, item: existing };
        }
        throw error;
      }
    },

    async updateUserStatus({
      userId,
      status,
      orgId,
      orgType,
      allowedPconCodes,
      approvedAt,
      approvedBy,
      requestedOrgId,
    }) {
      if (!userId) throw new Error("userId is required.");
      if (!status) throw new Error("status is required.");

      const names = { "#status": "status" };
      const values = { ":status": status, ":updatedAt": nowIso() };
      const updates = ["#status = :status", "updatedAt = :updatedAt"];

      if (requestedOrgId !== undefined) {
        names["#requestedOrgId"] = "requestedOrgId";
        values[":requestedOrgId"] = requestedOrgId;
        updates.push("#requestedOrgId = :requestedOrgId");
      }
      if (orgId !== undefined) {
        names["#orgId"] = "orgId";
        values[":orgId"] = orgId;
        updates.push("#orgId = :orgId");
      }
      if (orgType !== undefined) {
        names["#orgType"] = "orgType";
        values[":orgType"] = orgType;
        updates.push("#orgType = :orgType");
      }
      if (allowedPconCodes !== undefined) {
        names["#allowedPconCodes"] = "allowedPconCodes";
        values[":allowedPconCodes"] = allowedPconCodes;
        updates.push("#allowedPconCodes = :allowedPconCodes");
      }
      if (approvedAt !== undefined) {
        names["#approvedAt"] = "approvedAt";
        values[":approvedAt"] = approvedAt;
        updates.push("#approvedAt = :approvedAt");
      }
      if (approvedBy !== undefined) {
        names["#approvedBy"] = "approvedBy";
        values[":approvedBy"] = approvedBy;
        updates.push("#approvedBy = :approvedBy");
      }

      await dynamo
        .update({
          TableName: tableName,
          Key: { userId },
          UpdateExpression: `SET ${updates.join(", ")}`,
          ConditionExpression: "attribute_exists(userId)",
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        })
        .promise();

      return this.getUser(userId);
    },

    async listUsersByStatus(status = "PENDING", { limit = 50 } = {}) {
      const normalizedStatus = normalizeStatus(status, "PENDING");
      const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
      const result = await dynamo
        .query({
          TableName: tableName,
          IndexName: STATUS_INDEX,
          KeyConditionExpression: "#status = :status",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":status": normalizedStatus },
          ScanIndexForward: true,
          Limit: safeLimit,
        })
        .promise();
      return result.Items || [];
    },

    async updateRequestedFields({
      userId,
      requestedOrgId,
      requestedOrgType,
      requestedPconCode,
      requestedPconCodes,
    }) {
      if (!userId) throw new Error("userId is required.");

      const pconCodes = normalizePconCodes(requestedPconCode, requestedPconCodes);
      const names = {
        "#updatedAt": "updatedAt",
        "#requestedOrgId": "requestedOrgId",
        "#requestedOrgType": "requestedOrgType",
        "#requestedPconCode": "requestedPconCode",
        "#requestedPconCodes": "requestedPconCodes",
        "#status": "status",
      };
      const values = {
        ":updatedAt": nowIso(),
        ":requestedOrgId": (requestedOrgId || "").toString().trim(),
        ":requestedOrgType": normalizeOrgType(requestedOrgType),
        ":requestedPconCode": (requestedPconCode || "").toString().trim().toUpperCase(),
        ":requestedPconCodes": pconCodes,
        ":pending": "PENDING",
      };

      await dynamo
        .update({
          TableName: tableName,
          Key: { userId },
          UpdateExpression:
            "SET #updatedAt = :updatedAt, #requestedOrgId = :requestedOrgId, #requestedOrgType = :requestedOrgType, #requestedPconCode = :requestedPconCode, #requestedPconCodes = :requestedPconCodes",
          ConditionExpression: "attribute_exists(userId) AND #status = :pending",
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        })
        .promise();

      return this.getUser(userId);
    },

    async approveUser({ userId, orgId, orgType, allowedPconCodes, approvedBy }) {
      if (!userId) throw new Error("userId is required.");
      if (!orgId) throw new Error("orgId is required.");
      if (!Array.isArray(allowedPconCodes) || allowedPconCodes.length === 0) {
        throw new Error("allowedPconCodes is required.");
      }

      const normalizedCodes = allowedPconCodes
        .map((entry) => (entry || "").toString().trim().toUpperCase())
        .filter(Boolean);
      if (normalizedCodes.length === 0) {
        throw new Error("allowedPconCodes is required.");
      }

      return this.updateUserStatus({
        userId,
        status: "APPROVED",
        orgId: orgId.toString().trim(),
        orgType: normalizeOrgType(orgType),
        allowedPconCodes: normalizedCodes,
        approvedAt: nowIso(),
        approvedBy: (approvedBy || "").toString().trim(),
      });
    },

    async rejectUser({ userId, rejectedBy, reason = "" }) {
      if (!userId) throw new Error("userId is required.");
      const names = {
        "#status": "status",
        "#rejectedAt": "rejectedAt",
        "#rejectedBy": "rejectedBy",
        "#rejectedReason": "rejectedReason",
      };
      const values = {
        ":status": "REJECTED",
        ":rejectedAt": nowIso(),
        ":rejectedBy": (rejectedBy || "").toString().trim(),
        ":rejectedReason": (reason || "").toString().trim(),
        ":updatedAt": nowIso(),
      };

      await dynamo
        .update({
          TableName: tableName,
          Key: { userId },
          UpdateExpression:
            "SET #status = :status, #rejectedAt = :rejectedAt, #rejectedBy = :rejectedBy, #rejectedReason = :rejectedReason, updatedAt = :updatedAt",
          ConditionExpression: "attribute_exists(userId)",
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        })
        .promise();

      return this.getUser(userId);
    },
  };
}

export const usersRepo = USERS_TABLE ? createUsersRepo() : null;
