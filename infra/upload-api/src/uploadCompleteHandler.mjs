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

async function findJobByS3Key(key) {
  const parts = key.split("/");
  const parsedJobId = parts.length >= 4 && parts[0] === "uploads" ? parts[2] : "";

  if (parsedJobId) {
    const byId = await dynamo
      .get({ TableName: JOBS_TABLE, Key: { jobId: parsedJobId } })
      .promise();
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

export async function handler(event) {
  const records = event.Records || [];
  for (const record of records) {
    const bucket = record.s3?.bucket?.name || "";
    const key = decodeURIComponent((record.s3?.object?.key || "").replace(/\+/g, " "));

    if (!key) {
      logEvent("upload_complete_ignored", { reason: "missing_key" });
      continue;
    }

    const job = await findJobByS3Key(key);
    if (!job) {
      logEvent("upload_complete_ignored", { reason: "job_not_found", key });
      continue;
    }

    if (job.status !== "QUEUED") {
      logEvent("upload_complete_skipped", { jobId: job.jobId, status: job.status });
      continue;
    }

    await sqs
      .sendMessage({
        QueueUrl: PROCESS_QUEUE_URL,
        MessageBody: JSON.stringify({ jobId: job.jobId, bucket, s3Key: job.s3Key }),
      })
      .promise();

    logEvent("upload_complete_enqueued", { jobId: job.jobId });
  }
}
