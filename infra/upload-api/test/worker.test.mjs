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
  rangeHeader: "%PDF-",
  fullBody: "a,b\n1,2\n",
};

const makePromise = (value) => ({ promise: async () => value });

const createAwsMock = () => {
  class DocumentClient {
    get(params) {
      return makePromise({ Item: jobsMap.get(params.Key.jobId) });
    }
    update(params) {
      const jobId = params.Key.jobId;
      const existing = jobsMap.get(jobId) || { jobId };
      if (params.ConditionExpression && existing.status !== "QUEUED") {
        const error = new Error("Conditional check failed");
        error.code = "ConditionalCheckFailedException";
        return { promise: async () => Promise.reject(error) };
      }

      const names = params.ExpressionAttributeNames || {};
      const values = params.ExpressionAttributeValues || {};
      if (values[":processing"]) existing.status = values[":processing"];
      if (values[":status"]) existing.status = values[":status"];
      if (values[":now"]) existing.updatedAt = values[":now"];
      if (values[":output"]) existing.output = values[":output"];
      if (values[":error"]) existing.error = values[":error"];
      if (names["#status"] && values[":failed"]) existing.status = values[":failed"];
      jobsMap.set(jobId, existing);
      return makePromise({});
    }
  }

  class S3 {
    headObject() {
      calls.headObject += 1;
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
  behavior.rangeHeader = "%PDF-";
  behavior.fullBody = "a,b\n1,2\n";
});

describe("upload processor worker (SQS)", () => {
  it("processes a valid queued message and returns no batch failures", async () => {
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

  it("marks FAILED and returns batch item failure for retry/DLQ", async () => {
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

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: "msg-3" }] });
    expect(jobsMap.get("job-3").status).toBe("FAILED");
    expect(jobsMap.get("job-3").error.message).toContain("Invalid PDF header");
  });
});
