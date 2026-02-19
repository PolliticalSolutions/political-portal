import { getDocumentClient } from "./dynamoClient.mjs";

const SUBMISSIONS_TABLE = process.env.SUBMISSIONS_TABLE || "";
const USER_ID_INDEX = "UserIdCreatedAtIndex";

export function createSubmissionsRepo({
  dynamo = getDocumentClient(),
  tableName = SUBMISSIONS_TABLE,
  userIdIndexName = USER_ID_INDEX,
} = {}) {
  if (!tableName) {
    throw new Error("SUBMISSIONS_TABLE is not configured.");
  }

  return {
    async createSubmission(record) {
      if (!record?.submissionId) {
        throw new Error("submissionId is required.");
      }

      const item = {
        createdAt: new Date().toISOString(),
        status: "RECEIVED",
        ...record,
      };

      await dynamo
        .put({
          TableName: tableName,
          Item: item,
          ConditionExpression: "attribute_not_exists(submissionId)",
        })
        .promise();

      return item;
    },

    async getSubmission(submissionId) {
      if (!submissionId) return null;
      const result = await dynamo.get({ TableName: tableName, Key: { submissionId } }).promise();
      return result.Item || null;
    },

    async listSubmissionsByUser(userId, { limit = 25 } = {}) {
      if (!userId) return [];
      const queryLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25));

      const result = await dynamo
        .query({
          TableName: tableName,
          IndexName: userIdIndexName,
          KeyConditionExpression: "userId = :userId",
          ExpressionAttributeValues: {
            ":userId": userId,
          },
          ScanIndexForward: false,
          Limit: queryLimit,
        })
        .promise();

      return result.Items || [];
    },
  };
}

export const submissionsRepo = SUBMISSIONS_TABLE ? createSubmissionsRepo() : null;
