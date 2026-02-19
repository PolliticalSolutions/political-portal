/**
 * Upload processor worker — triggered by SQS messages.
 *
 * Supported SQS message body shapes:
 * 1) Custom payload from scan handler: { jobId, bucket, s3Key }
 * 2) S3 event payload: { Records: [{ s3: { bucket: { name }, object: { key } } }] }
 */

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
const s3 = new AWS.S3({ region: REGION });

const JOBS_TABLE = process.env.JOBS_TABLE || "";
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET || "";
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

class RetryableProcessingError extends Error {}
class ValidationError extends Error {}

function logEvent(stage, data = {}) {
  console.log(JSON.stringify({ stage, ts: new Date().toISOString(), ...data }));
}

function isConditionalCheckFailed(error) {
  return error?.code === "ConditionalCheckFailedException";
}

function isNoSuchKey(error) {
  return error?.code === "NoSuchKey" || error?.name === "NoSuchKey";
}

function decodeS3Key(key) {
  return decodeURIComponent((key || "").replace(/\+/g, " "));
}

function parseQueueMessage(record) {
  let payload = null;
  try {
    payload = JSON.parse(record.body || "{}");
  } catch {
    throw new Error("Invalid SQS message JSON.");
  }

  if (payload?.Records?.[0]?.s3?.bucket?.name && payload?.Records?.[0]?.s3?.object?.key) {
    const bucket = payload.Records[0].s3.bucket.name.toString();
    const s3Key = decodeS3Key(payload.Records[0].s3.object.key.toString());
    return { bucket, s3Key, jobId: "" };
  }

  const jobId = (payload?.jobId || "").toString();
  const bucket = (payload?.bucket || UPLOADS_BUCKET || "").toString();
  const s3Key = (payload?.s3Key || "").toString();
  if (!bucket || !s3Key) {
    throw new Error("SQS message is missing required fields.");
  }
  return { jobId, bucket, s3Key };
}

async function findJobByS3Key(s3Key) {
  const result = await dynamo
    .query({
      TableName: JOBS_TABLE,
      IndexName: "S3KeyIndex",
      KeyConditionExpression: "s3Key = :s3Key",
      ExpressionAttributeValues: {
        ":s3Key": s3Key,
      },
      Limit: 1,
    })
    .promise();
  return (result.Items || [])[0] || null;
}

async function resolveJob(message) {
  if (message.jobId) {
    const result = await dynamo.get({ TableName: JOBS_TABLE, Key: { jobId: message.jobId } }).promise();
    const job = result.Item || null;
    return { job, jobId: message.jobId };
  }

  const job = await findJobByS3Key(message.s3Key);
  if (!job?.jobId) {
    throw new RetryableProcessingError(`No job found for uploaded key ${message.s3Key}.`);
  }
  return { job, jobId: job.jobId };
}

async function markProcessing(jobId) {
  const now = new Date().toISOString();
  try {
    await dynamo
      .update({
        TableName: JOBS_TABLE,
        Key: { jobId },
        UpdateExpression: "SET #status = :processing, updatedAt = :now",
        ConditionExpression: "#status = :queued",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":queued": "QUEUED",
          ":processing": "PROCESSING",
          ":now": now,
        },
      })
      .promise();
    return true;
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return false;
    }
    throw error;
  }
}

async function resetToQueued(jobId) {
  await dynamo
    .update({
      TableName: JOBS_TABLE,
      Key: { jobId },
      UpdateExpression: "SET #status = :queued, updatedAt = :now",
      ConditionExpression: "#status = :processing",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":queued": "QUEUED",
        ":processing": "PROCESSING",
        ":now": new Date().toISOString(),
      },
    })
    .promise();
}

async function updateJobStatus(jobId, status, extra = {}) {
  const now = new Date().toISOString();
  const expressionParts = ["#status = :status", "updatedAt = :now"];
  const attrNames = { "#status": "status" };
  const attrValues = { ":status": status, ":now": now };

  if (extra.output) {
    expressionParts.push("#output = :output");
    attrNames["#output"] = "output";
    attrValues[":output"] = extra.output;
  }
  if (extra.error) {
    expressionParts.push("#error = :error");
    attrNames["#error"] = "error";
    attrValues[":error"] = extra.error;
  }

  await dynamo
    .update({
      TableName: JOBS_TABLE,
      Key: { jobId },
      UpdateExpression: `SET ${expressionParts.join(", ")}`,
      ExpressionAttributeNames: attrNames,
      ExpressionAttributeValues: attrValues,
    })
    .promise();
}

async function processJobMessage(message) {
  const { job, jobId } = await resolveJob(message);
  const bucket = message.bucket || UPLOADS_BUCKET;
  const s3Key = message.s3Key || job?.s3Key || "";
  logEvent("worker_start", { jobId, key: s3Key });

  const reviewStatus = (job?.manualReviewStatus || "").toString().trim().toUpperCase();
  const reviewDecision = (job?.manualReviewDecision || "").toString().trim().toUpperCase();
  const requiresManualReview = job?.requiresManualReview === true;
  const blockedByReview =
    requiresManualReview &&
    (job?.blocked === true || reviewStatus === "OPEN" || reviewStatus === "NEEDS_INFO" || reviewDecision === "REJECT");
  if (blockedByReview) {
    logEvent("worker_noop", { jobId, reason: "manual_review_blocked", reviewStatus, reviewDecision });
    return;
  }

  const canProcess = await markProcessing(jobId);
  if (!canProcess) {
    logEvent("worker_noop", { jobId, reason: "already_transitioned" });
    return;
  }

  try {
    const head = await s3.headObject({ Bucket: bucket, Key: s3Key }).promise();
    const actualSize = Number(head.ContentLength || 0);
    if (!Number.isFinite(actualSize) || actualSize <= 0) {
      throw new ValidationError("Uploaded object size is invalid.");
    }
    if (actualSize > MAX_FILE_SIZE_BYTES) {
      throw new ValidationError("Uploaded object exceeds 200 MB size limit.");
    }
    if (typeof job.expectedSize === "number" && job.expectedSize > 0 && actualSize !== job.expectedSize) {
      throw new ValidationError(
        `Uploaded object size (${actualSize}) does not match expected size (${job.expectedSize}).`
      );
    }

    const fileType = (job.expectedFileType || job.fileType || "").toLowerCase();
    if (fileType === "pdf") {
      const headerObj = await s3
        .getObject({ Bucket: bucket, Key: s3Key, Range: "bytes=0-4" })
        .promise();
      const header = Buffer.from(headerObj.Body || "").toString("utf-8");
      if (header !== "%PDF-") {
        throw new ValidationError("Invalid PDF header; expected %PDF- signature.");
      }
    } else if (fileType !== "csv") {
      throw new ValidationError(`Unsupported fileType: ${fileType}`);
    }

    const fileObj = await s3.getObject({ Bucket: bucket, Key: s3Key }).promise();
    const fileBuffer = Buffer.from(fileObj.Body);
    const now = new Date().toISOString();

    let outputContent;
    if (fileType === "pdf") {
      outputContent = `jobId,filename,processedAt\n"${jobId}","${job.filename.replace(/"/g, '""')}","${now}"\n`;
    } else {
      const text = fileBuffer.toString("utf-8");
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length === 0) {
        throw new ValidationError("CSV file is empty or contains no data rows.");
      }
      outputContent = lines.join("\n") + "\n";
    }

    const outputKey = `outputs/${jobId}/result.csv`;
    await s3
      .putObject({
        Bucket: UPLOADS_BUCKET,
        Key: outputKey,
        Body: outputContent,
        ContentType: "text/csv",
      })
      .promise();

    await updateJobStatus(jobId, "SUCCEEDED", {
      output: {
        outputPrefix: `outputs/${jobId}/`,
        files: [
          {
            key: outputKey,
            name: "result.csv",
            contentType: "text/csv",
            size: Buffer.byteLength(outputContent, "utf-8"),
          },
        ],
      },
    });

    logEvent("worker_succeeded", { jobId, outputKey });
  } catch (error) {
    if (isNoSuchKey(error)) {
      logEvent("worker_retry", { jobId, reason: "no_such_key", message: error.message });
      await resetToQueued(jobId);
      throw new RetryableProcessingError("Uploaded object not found yet.");
    }

    if (error instanceof ValidationError) {
      logEvent("worker_failed_validation", { jobId, message: error.message });
      await updateJobStatus(jobId, "FAILED", {
        error: { code: "VALIDATION_FAILED", message: error.message, detail: error.stack || "" },
      });
      return;
    }

    logEvent("worker_retry", { jobId, reason: "transient_error", message: error.message });
    await resetToQueued(jobId);
    throw new RetryableProcessingError(error.message);
  }
}

export async function handler(event) {
  const records = event.Records || [];
  const failures = [];

  await Promise.all(
    records.map(async (record) => {
      try {
        const message = parseQueueMessage(record);
        await processJobMessage(message);
      } catch (error) {
        logEvent("worker_message_failed", {
          messageId: record.messageId,
          error: error.message,
        });
        if (error instanceof RetryableProcessingError) {
          failures.push({ itemIdentifier: record.messageId });
        }
      }
    })
  );

  return { batchItemFailures: failures };
}
