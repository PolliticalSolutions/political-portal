import { beforeEach, describe, expect, it } from "vitest";

const jobsMap = new Map();
const queueMessages = [];

const makePromise = (value) => ({ promise: async () => value });

const createAwsMock = () => {
  class DocumentClient {
    get(params) {
      return makePromise({ Item: jobsMap.get(params.Key.jobId) });
    }
    query(params) {
      const key = params.ExpressionAttributeValues?.[":key"];
      const job = Array.from(jobsMap.values()).find((item) => item.s3Key === key);
      return makePromise({ Items: job ? [job] : [] });
    }
    update(params) {
      const jobId = params.Key.jobId;
      const existing = jobsMap.get(jobId);
      if (!existing) return makePromise({});
      if (params.ConditionExpression && existing.scanResultStatus) {
        const error = new Error("Conditional check failed");
        error.code = "ConditionalCheckFailedException";
        return { promise: async () => Promise.reject(error) };
      }

      const values = params.ExpressionAttributeValues || {};
      if (values[":scanResult"]) existing.scanResultStatus = values[":scanResult"];
      if (values[":eventId"]) existing.scanEventId = values[":eventId"];
      if (values[":now"]) existing.updatedAt = values[":now"];
      if (values[":failed"]) existing.status = values[":failed"];
      if (values[":error"]) existing.error = values[":error"];
      jobsMap.set(jobId, existing);
      return makePromise({});
    }
  }

  class SQS {
    sendMessage(params) {
      queueMessages.push(params);
      return makePromise({ MessageId: "msg-1" });
    }
  }

  return {
    DynamoDB: { DocumentClient },
    SQS,
  };
};

globalThis.__AWS_SDK_MOCK__ = createAwsMock();
process.env.JOBS_TABLE = "test-jobs";
process.env.UPLOADS_BUCKET = "test-bucket";
process.env.PROCESS_QUEUE_URL = "https://sqs.eu-west-2.amazonaws.com/123/process-queue";

const { handler } = await import("../src/scanResultHandler.mjs");

function buildScanEvent({ id = "evt-1", result = "NO_THREATS_FOUND", key = "uploads/sub/job-1/file.csv" } = {}) {
  return {
    id,
    detail: {
      scanResultDetails: {
        scanResult: result,
      },
      s3ObjectDetails: {
        bucketName: "test-bucket",
        objectKey: key,
      },
    },
  };
}

beforeEach(() => {
  jobsMap.clear();
  queueMessages.length = 0;
  jobsMap.set("job-1", {
    jobId: "job-1",
    status: "QUEUED",
    s3Key: "uploads/sub/job-1/file.csv",
  });
});

describe("scan result handler", () => {
  it("enqueues clean files exactly once", async () => {
    await handler(buildScanEvent({ id: "evt-clean-1", result: "NO_THREATS_FOUND" }));
    await handler(buildScanEvent({ id: "evt-clean-2", result: "NO_THREATS_FOUND" }));

    expect(queueMessages).toHaveLength(1);
    const body = JSON.parse(queueMessages[0].MessageBody);
    expect(body.jobId).toBe("job-1");
    expect(body.s3Key).toBe("uploads/sub/job-1/file.csv");
    expect(jobsMap.get("job-1").scanResultStatus).toBe("NO_THREATS_FOUND");
  });

  it("does not enqueue infected files and marks the job failed", async () => {
    await handler(buildScanEvent({ id: "evt-mal-1", result: "THREATS_FOUND" }));

    expect(queueMessages).toHaveLength(0);
    const job = jobsMap.get("job-1");
    expect(job.status).toBe("FAILED");
    expect(job.scanResultStatus).toBe("INFECTED");
    expect(job.error.message).toContain("malware detected");
  });

  it("does not enqueue unsupported/failed scan outcomes", async () => {
    await handler(buildScanEvent({ id: "evt-fail-1", result: "FAILED" }));
    expect(queueMessages).toHaveLength(0);
    expect(jobsMap.get("job-1").status).toBe("FAILED");
    expect(jobsMap.get("job-1").scanResultStatus).toBe("FAILED");
  });
});
