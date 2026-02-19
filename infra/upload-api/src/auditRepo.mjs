import crypto from "crypto";
import { getDocumentClient } from "./dynamoClient.mjs";

const AUDIT_TABLE = process.env.AUDIT_TABLE || "";

function nowIso() {
  return new Date().toISOString();
}

function sanitizeString(value, max = 300) {
  if (value === undefined || value === null) return "";
  return value.toString().trim().slice(0, max);
}

export function createAuditRepo({ dynamo = getDocumentClient(), tableName = AUDIT_TABLE } = {}) {
  if (!tableName) {
    throw new Error("AUDIT_TABLE is not configured.");
  }

  return {
    async writeAudit({ action, actor = {}, target = {}, metadata = {}, createdAt } = {}) {
      const created = createdAt || nowIso();
      const actorId = sanitizeString(actor.actorId || actor.sub || actor.userId || "system", 120);
      const targetKey = sanitizeString(target.targetKey || target.id || target.userId || "unknown", 180);
      const item = {
        auditId: crypto.randomUUID(),
        action: sanitizeString(action, 120),
        actorId,
        actorSub: sanitizeString(actor.sub, 120),
        actorEmail: sanitizeString(actor.email, 200),
        targetKey,
        targetType: sanitizeString(target.type, 80),
        metadata,
        createdAt: created,
      };

      await dynamo
        .put({
          TableName: tableName,
          Item: item,
        })
        .promise();

      return item;
    },
  };
}

export const auditRepo = AUDIT_TABLE ? createAuditRepo() : null;
