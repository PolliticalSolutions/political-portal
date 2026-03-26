import { describe, expect, it } from "vitest";

globalThis.__AWS_SDK_MOCK__ = {};
process.env.JOBS_TABLE = "test-jobs";
process.env.UPLOADS_BUCKET = "test-bucket";

const { handler } = await import("../src/worker.mjs");

function sqsEvent(messages) {
  return {
    Records: messages.map((body, i) => ({
      messageId: `msg-${i}`,
      body: JSON.stringify(body),
    })),
  };
}

describe("worker stub", () => {
  it("returns no batch failures without processing any job", async () => {
    const result = await handler(
      sqsEvent([{ jobId: "job-1", bucket: "test-bucket", s3Key: "uploads/u/job-1/file.pdf" }])
    );
    expect(result).toEqual({ batchItemFailures: [] });
  });

  it("handles empty event without error", async () => {
    const result = await handler({ Records: [] });
    expect(result).toEqual({ batchItemFailures: [] });
  });

  it("handles multiple records without error", async () => {
    const result = await handler(
      sqsEvent([
        { jobId: "job-a", bucket: "test-bucket", s3Key: "uploads/u/job-a/a.pdf" },
        { jobId: "job-b", bucket: "test-bucket", s3Key: "uploads/u/job-b/b.pdf" },
      ])
    );
    expect(result).toEqual({ batchItemFailures: [] });
  });
});
