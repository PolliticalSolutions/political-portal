import { getDocumentClient } from "./dynamoClient.mjs";

const JOBS_TABLE = process.env.JOBS_TABLE || "";
const MANUAL_REVIEW_INDEX = "ManualReviewIndex";
const ALLOWED_STATUSES = new Set(["OPEN", "NEEDS_INFO", "RESOLVED"]);
const ALLOWED_DECISIONS = new Set(["APPROVE", "REJECT", "NEEDS_INFO"]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(value, fallback = "OPEN") {
  const normalized = (value || "").toString().trim().toUpperCase();
  if (!ALLOWED_STATUSES.has(normalized)) return fallback;
  return normalized;
}

function normalizeDecision(value) {
  const normalized = (value || "").toString().trim().toUpperCase();
  if (!ALLOWED_DECISIONS.has(normalized)) return "";
  return normalized;
}

function manualReviewKey(status) {
  return `MR#${normalizeStatus(status)}`;
}

function encodeCursor(key) {
  if (!key) return "";
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function createManualReviewRepo({
  dynamo = getDocumentClient(),
  tableName = JOBS_TABLE,
  indexName = MANUAL_REVIEW_INDEX,
} = {}) {
  if (!tableName) throw new Error("JOBS_TABLE is not configured.");

  return {
    async getJob(jobId) {
      if (!jobId) return null;
      const result = await dynamo.get({ TableName: tableName, Key: { jobId } }).promise();
      return result.Item || null;
    },

    async listJobs({ status = "OPEN", limit = 50, cursor = "" } = {}) {
      const normalizedStatus = normalizeStatus(status, "OPEN");
      const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
      const result = await dynamo
        .query({
          TableName: tableName,
          IndexName: indexName,
          KeyConditionExpression: "manualReviewKey = :manualReviewKey",
          ExpressionAttributeValues: { ":manualReviewKey": manualReviewKey(normalizedStatus) },
          ScanIndexForward: false,
          Limit: safeLimit,
          ...(decodeCursor(cursor) ? { ExclusiveStartKey: decodeCursor(cursor) } : {}),
        })
        .promise();

      return {
        items: result.Items || [],
        nextCursor: encodeCursor(result.LastEvaluatedKey),
      };
    },

    async resolveJob({
      jobId,
      decision,
      note,
      reviewedBy,
      reviewedEmail = "",
      correctedElectionId = "",
    }) {
      const normalizedDecision = normalizeDecision(decision);
      if (!normalizedDecision) throw new Error("decision is invalid.");
      const current = await this.getJob(jobId);
      if (!current) return { before: null, after: null };

      const reviewStatus = normalizedDecision === "NEEDS_INFO" ? "NEEDS_INFO" : "RESOLVED";
      const isRejected = normalizedDecision === "REJECT";
      const updateValues = {
        ":reviewStatus": reviewStatus,
        ":decision": normalizedDecision,
        ":note": (note || "").toString().trim(),
        ":reviewedAt": nowIso(),
        ":reviewedBy": (reviewedBy || "").toString().trim(),
        ":reviewedEmail": (reviewedEmail || "").toString().trim(),
        ":manualReviewKey": manualReviewKey(reviewStatus),
        ":blocked": normalizedDecision === "APPROVE" ? false : true,
        ":statusRejected": "REJECTED",
      };

      const expressionParts = [
        "manualReviewStatus = :reviewStatus",
        "manualReviewDecision = :decision",
        "manualReviewNote = :note",
        "reviewedAt = :reviewedAt",
        "reviewedBy = :reviewedBy",
        "reviewedByEmail = :reviewedEmail",
        "manualReviewKey = :manualReviewKey",
        "blocked = :blocked",
        "updatedAt = :reviewedAt",
      ];

      if (correctedElectionId) {
        expressionParts.push("correctedElectionId = :correctedElectionId");
        updateValues[":correctedElectionId"] = correctedElectionId;
      }
      if (isRejected) {
        expressionParts.push("#status = :statusRejected");
      }

      await dynamo
        .update({
          TableName: tableName,
          Key: { jobId },
          UpdateExpression: `SET ${expressionParts.join(", ")}`,
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: updateValues,
          ConditionExpression: "attribute_exists(jobId)",
        })
        .promise();

      const after = await this.getJob(jobId);
      return { before: current, after };
    },
  };
}

export const manualReviewRepo = JOBS_TABLE ? createManualReviewRepo() : null;
