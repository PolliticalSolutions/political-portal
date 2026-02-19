import { beforeEach, describe, expect, it } from "vitest";

const jobsMap = new Map();
const updates = [];
const uploads = [];

const makePromise = (value) => ({ promise: async () => value });

const createAwsMock = () => {
  class DocumentClient {
    get(params) {
      return makePromise({ Item: jobsMap.get(params.Key.jobId) });
    }
    update(params) {
      updates.push(params);
      return makePromise({});
    }
  }

  class S3 {
    headObject() {
      return makePromise({ ContentLength: 1024 });
    }
    getObject(params) {
      if (params.Range) {
        return makePromise({ Body: Buffer.from("%PDF-") });
      }
      return makePromise({ Body: Buffer.from("a,b\n1,2\n") });
    }
    putObject(params) {
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

function s3Event(key) {
  return {
    Records: [
      {
        s3: {
          bucket: { name: "test-bucket" },
          object: { key },
        },
      },
    ],
  };
}

beforeEach(() => {
  jobsMap.clear();
  updates.length = 0;
  uploads.length = 0;
});

describe("upload worker validation", () => {
  it("fails PDF jobs when magic bytes are invalid", async () => {
    jobsMap.set("job-pdf", {
      jobId: "job-pdf",
      fileType: "pdf",
      expectedFileType: "pdf",
      expectedSize: 1024,
    });

    globalThis.__AWS_SDK_MOCK__.S3.prototype.getObject = function getObject(params) {
      if (params.Range) return makePromise({ Body: Buffer.from("NOTPD") });
      return makePromise({ Body: Buffer.from("irrelevant") });
    };

    await handler(s3Event("uploads/user/job-pdf/file.pdf"));

    const failedUpdate = updates.find((u) => u.ExpressionAttributeValues?.[":status"] === "FAILED");
    expect(failedUpdate).toBeTruthy();
    expect(failedUpdate.ExpressionAttributeValues[":error"].message).toContain("Invalid PDF header");
    expect(uploads).toHaveLength(0);
  });

  it("fails jobs when uploaded size does not match expected size", async () => {
    jobsMap.set("job-csv", {
      jobId: "job-csv",
      fileType: "csv",
      expectedFileType: "csv",
      expectedSize: 5000,
    });

    globalThis.__AWS_SDK_MOCK__.S3.prototype.headObject = function headObject() {
      return makePromise({ ContentLength: 1024 });
    };

    await handler(s3Event("uploads/user/job-csv/file.csv"));

    const failedUpdate = updates.find((u) => u.ExpressionAttributeValues?.[":status"] === "FAILED");
    expect(failedUpdate).toBeTruthy();
    expect(failedUpdate.ExpressionAttributeValues[":error"].message).toContain("does not match expected size");
    expect(uploads).toHaveLength(0);
  });
});
