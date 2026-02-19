/**
 * Upload worker — triggered by S3 ObjectCreated events on the uploads/ prefix.
 *
 * Processing pipeline (placeholder):
 *   PDF  → writes a CSV manifest: jobId,filename,processedAt
 *   CSV  → validates parseability, normalises line endings, copies as output
 *
 * Swap the "process" section below with the real OCR command when ready.
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

async function processRecord(bucket, rawKey) {
  // S3 keys can have + encoded spaces
  const key = rawKey.replace(/\+/g, " ");

  // Expected format: uploads/{userSub}/{jobId}/{filename}
  const parts = key.split("/");
  if (parts.length < 4 || parts[0] !== "uploads") {
    logEvent("worker_skip", { reason: "unexpected_key_format", key });
    return;
  }

  const jobId = parts[2];
  const filename = parts.slice(3).join("/");

  logEvent("worker_start", { jobId, filename, key });

  // Fetch the job record
  const getResult = await dynamo.get({ TableName: JOBS_TABLE, Key: { jobId } }).promise();
  const job = getResult.Item;
  if (!job) {
    logEvent("worker_skip", { reason: "job_not_found", jobId });
    return;
  }

  await updateJobStatus(jobId, "PROCESSING");

  try {
    // ── Validate uploaded object before processing ─────────────────────────
    const head = await s3.headObject({ Bucket: bucket, Key: key }).promise();
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
        .getObject({ Bucket: bucket, Key: key, Range: "bytes=0-4" })
        .promise();
      const header = Buffer.from(headerObj.Body || "").toString("utf-8");
      if (header !== "%PDF-") {
        throw new Error("Invalid PDF header; expected %PDF- signature.");
      }
    } else if (fileType !== "csv") {
      throw new Error(`Unsupported fileType: ${fileType}`);
    }

    // ── Download the uploaded file ──────────────────────────────────────────
    const fileObj = await s3.getObject({ Bucket: bucket, Key: key }).promise();
    const fileBuffer = Buffer.from(fileObj.Body);
    const now = new Date().toISOString();

    // ── Process (placeholder — swap for real OCR integration) ───────────────
    let outputContent;
    if (fileType === "pdf") {
      // TODO: replace with actual OCR command, e.g. call Textract or tesseract
      // For now write a CSV manifest as placeholder output
      outputContent = `jobId,filename,processedAt\n"${jobId}","${filename.replace(/"/g, '""')}","${now}"\n`;
    } else if (fileType === "csv") {
      // Validate CSV is parseable (at least one non-empty row)
      const text = fileBuffer.toString("utf-8");
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) {
        throw new Error("CSV file is empty or contains no data rows.");
      }
      // Normalise line endings and re-emit
      outputContent = lines.join("\n") + "\n";
    }

    // ── Upload output ───────────────────────────────────────────────────────
    const outputKey = `outputs/${jobId}/result.csv`;
    await s3
      .putObject({
        Bucket: UPLOADS_BUCKET,
        Key: outputKey,
        Body: outputContent,
        ContentType: "text/csv",
      })
      .promise();

    // ── Mark SUCCEEDED ──────────────────────────────────────────────────────
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
  } catch (err) {
    logEvent("worker_failed", { jobId, message: err.message });
    await updateJobStatus(jobId, "FAILED", {
      error: { message: err.message, detail: err.stack || "" },
    });
  }
}

export async function handler(event) {
  const records = event.Records || [];
  await Promise.all(
    records.map(async (record) => {
      const bucket = record.s3.bucket.name;
      const key = record.s3.object.key;
      await processRecord(bucket, key);
    })
  );
}
