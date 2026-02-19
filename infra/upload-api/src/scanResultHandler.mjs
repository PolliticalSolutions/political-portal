import { createRequire } from "module";

const require = createRequire(import.meta.url);
let AWS;
try {
  AWS = require("aws-sdk");
} catch (error) {
  if (globalThis.__AWS_SDK_MOCK__) {
    AWS = globalThis.__AWS_SDK_MOCK__;
  } else {
    throw error;
  }
}

const REGION = process.env.AWS_REGION || "eu-west-2";
const dynamo = new AWS.DynamoDB.DocumentClient({ region: REGION });
const sqs = new AWS.SQS({ region: REGION });

const JOBS_TABLE = process.env.JOBS_TABLE || "";
const PROCESS_QUEUE_URL = process.env.PROCESS_QUEUE_URL || "";

function logEvent(stage, data = {}) {
  console.log(JSON.stringify({ stage, ts: new Date().toISOString(), ...data }));
}

function isConditionalCheckFailed(error) {
  return error?.code === "ConditionalCheckFailedException";
}

function getEventObjectDetails(event) {
  const detail = event?.detail || {};
  const objectDetails = detail.s3ObjectDetails || detail.object || {};
  const bucket = objectDetails.bucketName || objectDetails.bucket || "";
  const key = objectDetails.objectKey || objectDetails.key || "";
  return { bucket: String(bucket), key: String(key) };
}

function getScanResult(event) {
  const detail = event?.detail || {};
  const raw =
    detail.scanResultDetails?.scanResult ||
    detail.scanResult ||
    detail.result ||
    "";
  const result = String(raw).toUpperCase();
  if (result === "NO_THREATS_FOUND" || result === "CLEAN") return "CLEAN";
  if (result === "THREATS_FOUND" || result === "INFECTED") return "INFECTED";
  if (result === "FAILED") return "FAILED";
  return "UNSUPPORTED";
}

async function findJobByS3Key(key) {
  const parts = key.split("/");
  const parsedJobId = parts.length >= 4 && parts[0] === "uploads" ? parts[2] : "";

  if (parsedJobId) {
    const byId = await dynamo.get({ TableName: JOBS_TABLE, Key: { jobId: parsedJobId } }).promise();
    if (byId.Item && byId.Item.s3Key === key) {
      return byId.Item;
    }
  }

  const byKey = await dynamo
    .query({
      TableName: JOBS_TABLE,
      IndexName: "S3KeyIndex",
      KeyConditionExpression: "s3Key = :key",
      ExpressionAttributeValues: { ":key": key },
      Limit: 1,
    })
    .promise();

  return byKey.Items?.[0] || null;
}

async function markScanClean(jobId, scanResult, eventId) {
  const now = new Date().toISOString();
  try {
    await dynamo
      .update({
        TableName: JOBS_TABLE,
        Key: { jobId },
        UpdateExpression:
          "SET scanResultStatus = :scanResult, scanEventId = :eventId, scanUpdatedAt = :now, updatedAt = :now",
        ConditionExpression: "attribute_not_exists(scanResultStatus)",
        ExpressionAttributeValues: {
          ":scanResult": scanResult,
          ":eventId": eventId,
          ":now": now,
        },
      })
      .promise();
    return true;
  } catch (error) {
    if (isConditionalCheckFailed(error)) return false;
    throw error;
  }
}

async function markScanFailed(jobId, scanResult, eventId) {
  const now = new Date().toISOString();
  const message =
    scanResult === "INFECTED"
      ? "Upload blocked: malware detected by scan."
      : `Upload blocked: scan returned ${scanResult}.`;
  try {
    await dynamo
      .update({
        TableName: JOBS_TABLE,
        Key: { jobId },
        UpdateExpression:
          "SET #status = :failed, #error = :error, scanResultStatus = :scanResult, scanEventId = :eventId, scanUpdatedAt = :now, updatedAt = :now",
        ConditionExpression: "attribute_not_exists(scanResultStatus)",
        ExpressionAttributeNames: {
          "#status": "status",
          "#error": "error",
        },
        ExpressionAttributeValues: {
          ":failed": "FAILED",
          ":error": { message, detail: "Scan gate rejected file before processing." },
          ":scanResult": scanResult,
          ":eventId": eventId,
          ":now": now,
        },
      })
      .promise();
    return true;
  } catch (error) {
    if (isConditionalCheckFailed(error)) return false;
    throw error;
  }
}

async function enqueueForProcessing(job, bucket) {
  await sqs
    .sendMessage({
      QueueUrl: PROCESS_QUEUE_URL,
      MessageBody: JSON.stringify({
        jobId: job.jobId,
        bucket,
        s3Key: job.s3Key,
      }),
    })
    .promise();
}

export async function handler(event) {
  const { bucket, key } = getEventObjectDetails(event);
  if (!key) {
    logEvent("scan_event_ignored", { reason: "missing_object_key" });
    return;
  }

  const job = await findJobByS3Key(key);
  if (!job) {
    logEvent("scan_event_ignored", { reason: "job_not_found" });
    return;
  }

  const scanResult = getScanResult(event);
  const eventId = event?.id || "";

  if (scanResult === "CLEAN") {
    const firstClean = await markScanClean(job.jobId, "NO_THREATS_FOUND", eventId);
    if (!firstClean) {
      logEvent("scan_clean_duplicate", { jobId: job.jobId });
      return;
    }
    await enqueueForProcessing(job, bucket || process.env.UPLOADS_BUCKET || "");
    logEvent("scan_clean_enqueued", { jobId: job.jobId });
    return;
  }

  const firstFailure = await markScanFailed(job.jobId, scanResult, eventId);
  if (!firstFailure) {
    logEvent("scan_failed_duplicate", { jobId: job.jobId, scanResult });
    return;
  }
  logEvent("scan_failed_blocked", { jobId: job.jobId, scanResult });
}
