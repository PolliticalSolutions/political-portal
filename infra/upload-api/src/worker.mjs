/**
 * Upload processor worker — triggered by SQS messages from scan result handler.
 *
 * Queue payload:
 *   { jobId, bucket, s3Key }
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

function logEvent(stage, data = {}) {
  console.log(JSON.stringify({ stage, ts: new Date().toISOString(), ...data }));
}

function isConditionalCheckFailed(error) {
  return error?.code === "ConditionalCheckFailedException";
}

function parseQueueMessage(record) {
  let payload = null;
  try {
    payload = JSON.parse(record.body || "{}");
  } catch {
    throw new Error("Invalid SQS message JSON.");
  }
  const jobId = (payload.jobId || "").toString();
  const bucket = (payload.bucket || UPLOADS_BUCKET || "").toString();
  const s3Key = (payload.s3Key || "").toString();
  if (!jobId || !bucket || !s3Key) {
    throw new Error("SQS message is missing required fields.");
  }
  return { jobId, bucket, s3Key };
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
  const { jobId, bucket, s3Key } = message;
  logEvent("worker_start", { jobId, key: s3Key });

  const canProcess = await markProcessing(jobId);
  if (!canProcess) {
    logEvent("worker_noop", { jobId, reason: "already_transitioned" });
    return;
  }

  try {
    const getResult = await dynamo.get({ TableName: JOBS_TABLE, Key: { jobId } }).promise();
    const job = getResult.Item;
    if (!job) {
      throw new Error("Job not found.");
    }

    const head = await s3.headObject({ Bucket: bucket, Key: s3Key }).promise();
    const actualSize = Number(head.ContentLength || 0);
    if (!Number.isFinite(actualSize) || actualSize <= 0) {
      throw new Error("Uploaded object size is invalid.");
    }
    if (actualSize > MAX_FILE_SIZE_BYTES) {
      throw new Error("Uploaded object exceeds 200 MB size limit.");
    }
    if (typeof job.expectedSize === "number" && job.expectedSize > 0 && actualSize !== job.expectedSize) {
      throw new Error(`Uploaded object size (${actualSize}) does not match expected size (${job.expectedSize}).`);
    }

    const fileType = (job.expectedFileType || job.fileType || "").toLowerCase();
    if (fileType === "pdf") {
      const headerObj = await s3
        .getObject({ Bucket: bucket, Key: s3Key, Range: "bytes=0-4" })
        .promise();
      const header = Buffer.from(headerObj.Body || "").toString("utf-8");
      if (header !== "%PDF-") {
        throw new Error("Invalid PDF header; expected %PDF- signature.");
      }
    } else if (fileType !== "csv") {
      throw new Error(`Unsupported fileType: ${fileType}`);
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
        throw new Error("CSV file is empty or contains no data rows.");
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
    logEvent("worker_failed", { jobId, message: error.message });
    await updateJobStatus(jobId, "FAILED", {
      error: { message: error.message, detail: error.stack || "" },
    });
    throw error;
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
        failures.push({ itemIdentifier: record.messageId });
      }
    })
  );

  return { batchItemFailures: failures };
}
