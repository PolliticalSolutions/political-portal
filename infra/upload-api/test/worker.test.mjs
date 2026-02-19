import { beforeEach, describe, expect, it } from "vitest";

const jobsMap = new Map();
const uploads = [];
const calls = {
  headObject: 0,
  getObject: 0,
  putObject: 0,
};
const behavior = {
  headContentLength: 1024,
  headThrows: null,
  rangeHeader: "%PDF-",
  fullBody: "a,b\n1,2\n",
};

const makePromise = (value) => ({ promise: async () => value });

const createAwsMock = () => {
  class DocumentClient {
    get(params) {
      return makePromise({ Item: jobsMap.get(params.Key.jobId) });
    }
    query(params) {
      const s3Key = params.ExpressionAttributeValues?.[":s3Key"];
      const match = [...jobsMap.values()].find((job) => job.s3Key === s3Key);
      return makePromise({ Items: match ? [match] : [] });
    }
    update(params) {
      const jobId = params.Key.jobId;
      const existing = jobsMap.get(jobId) || { jobId };
      const updateExpression = params.UpdateExpression || "";

      if (params.ConditionExpression?.includes(":queued") && existing.status !== "QUEUED") {
        const error = new Error("Conditional check failed");
        error.code = "ConditionalCheckFailedException";
        return { promise: async () => Promise.reject(error) };
      }
      if (params.ConditionExpression?.includes(":processing") && existing.status !== "PROCESSING") {
        const error = new Error("Conditional check failed");
        error.code = "ConditionalCheckFailedException";
        return { promise: async () => Promise.reject(error) };
      }

      const values = params.ExpressionAttributeValues || {};
      if (updateExpression.includes(":processing") && values[":processing"]) existing.status = values[":processing"];
      if (updateExpression.includes(":queued") && values[":queued"]) existing.status = values[":queued"];
      if (updateExpression.includes(":status") && values[":status"]) existing.status = values[":status"];
      if (updateExpression.includes(":now") && values[":now"]) existing.updatedAt = values[":now"];
      if (updateExpression.includes(":output") && values[":output"]) existing.output = values[":output"];
      if (updateExpression.includes(":error") && values[":error"]) existing.error = values[":error"];

      jobsMap.set(jobId, existing);
      return makePromise({});
    }
  }

  class S3 {
    headObject() {
      calls.headObject += 1;
      if (behavior.headThrows) {
        return { promise: async () => Promise.reject(behavior.headThrows) };
      }
      return makePromise({ ContentLength: behavior.headContentLength });
    }
    getObject(params) {
      calls.getObject += 1;
      if (params.Range) {
        return makePromise({ Body: Buffer.from(behavior.rangeHeader) });
      }
      return makePromise({ Body: Buffer.from(behavior.fullBody) });
    }
    putObject(params) {
      calls.putObject += 1;
      uploads.push(params);
      return makePromise({});
    }
  }

  return {
    DynamoDB: { DocumentClient },
    S3,
  };
};

globalThis.__AWS_SDK_MOCK__ = createAwsMock();
process.env.JOBS_TABLE = "test-jobs";
process.env.UPLOADS_BUCKET = "test-bucket";

const { handler } = await import("../src/worker.mjs");

function sqsEvent(message, messageId = "msg-1") {
  return {
    Records: [
      {
        messageId,
        body: JSON.stringify(message),
      },
    ],
  };
}

beforeEach(() => {
  jobsMap.clear();
  uploads.length = 0;
  calls.headObject = 0;
  calls.getObject = 0;
  calls.putObject = 0;
  behavior.headContentLength = 1024;
  behavior.headThrows = null;
  behavior.rangeHeader = "%PDF-";
  behavior.fullBody = "a,b\n1,2\n";
});

describe("upload processor worker (SQS)", () => {
  it("processes a valid queued custom message and returns no batch failures", async () => {
    jobsMap.set("job-1", {
      jobId: "job-1",
      status: "QUEUED",
      filename: "input.pdf",
      fileType: "pdf",
      expectedFileType: "pdf",
      expectedSize: 1024,
      s3Key: "uploads/user/job-1/input.pdf",
    });

    const result = await handler(
      sqsEvent({
        jobId: "job-1",
        bucket: "test-bucket",
        s3Key: "uploads/user/job-1/input.pdf",
      })
    );

    expect(result).toEqual({ batchItemFailures: [] });
    expect(jobsMap.get("job-1").status).toBe("SUCCEEDED");
    expect(uploads).toHaveLength(1);
  });

  it("processes S3-event-shaped SQS body and resolves job via S3KeyIndex", async () => {
    jobsMap.set("job-s3", {
      jobId: "job-s3",
      status: "QUEUED",
      filename: "input.pdf",
      fileType: "pdf",
      expectedFileType: "pdf",
      expectedSize: 1024,
      s3Key: "uploads/user-s3/job-s3/input.pdf",
    });

    const result = await handler(
      sqsEvent({
        Records: [
          {
            s3: {
              bucket: { name: "test-bucket" },
              object: { key: "uploads%2Fuser-s3%2Fjob-s3%2Finput.pdf" },
            },
          },
        ],
      })
    );

    expect(result).toEqual({ batchItemFailures: [] });
    expect(jobsMap.get("job-s3").status).toBe("SUCCEEDED");
  });

  it("noops duplicate messages when status is already transitioned", async () => {
    jobsMap.set("job-2", {
      jobId: "job-2",
      status: "SUCCEEDED",
      filename: "done.csv",
      fileType: "csv",
      expectedFileType: "csv",
      expectedSize: 1024,
      s3Key: "uploads/user/job-2/done.csv",
    });

    const result = await handler(
      sqsEvent({
        jobId: "job-2",
        bucket: "test-bucket",
        s3Key: "uploads/user/job-2/done.csv",
      })
    );

    expect(result).toEqual({ batchItemFailures: [] });
    expect(calls.headObject).toBe(0);
    expect(calls.putObject).toBe(0);
  });

  it("marks FAILED and ACKs validation failures", async () => {
    jobsMap.set("job-3", {
      jobId: "job-3",
      status: "QUEUED",
      filename: "bad.pdf",
      fileType: "pdf",
      expectedFileType: "pdf",
      expectedSize: 1024,
      s3Key: "uploads/user/job-3/bad.pdf",
    });

    behavior.rangeHeader = "NOTPD";
    behavior.fullBody = "irrelevant";

    const result = await handler(
      sqsEvent(
        {
          jobId: "job-3",
          bucket: "test-bucket",
          s3Key: "uploads/user/job-3/bad.pdf",
        },
        "msg-3"
      )
    );

    expect(result).toEqual({ batchItemFailures: [] });
    expect(jobsMap.get("job-3").status).toBe("FAILED");
    expect(jobsMap.get("job-3").error.message).toContain("Invalid PDF header");
  });

  it("returns batch item failure for NoSuchKey and resets status to QUEUED", async () => {
    jobsMap.set("job-4", {
      jobId: "job-4",
      status: "QUEUED",
      filename: "later.pdf",
      fileType: "pdf",
      expectedFileType: "pdf",
      expectedSize: 1024,
      s3Key: "uploads/user/job-4/later.pdf",
    });

    const noSuchKeyError = new Error("Not Found");
    noSuchKeyError.code = "NoSuchKey";
    behavior.headThrows = noSuchKeyError;

    const result = await handler(
      sqsEvent(
        {
          jobId: "job-4",
          bucket: "test-bucket",
          s3Key: "uploads/user/job-4/later.pdf",
        },
        "msg-4"
      )
    );

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: "msg-4" }] });
    expect(jobsMap.get("job-4").status).toBe("QUEUED");
  });
});
