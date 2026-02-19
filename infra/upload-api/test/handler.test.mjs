import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";

const jobsMap = new Map();
let lastPresignedPostParams = null;
const sentQueueMessages = [];

const makePromise = (value) => ({ promise: async () => value });

const createAwsMock = () => {
  class DocumentClient {
    put(params) {
      const item = params.Item;
      if (item?.jobId) jobsMap.set(item.jobId, { ...item });
      return makePromise({});
    }
    get(params) {
      const jobId = params.Key?.jobId;
      return makePromise({ Item: jobsMap.get(jobId) });
    }
    update() {
      return makePromise({});
    }
    query() {
      return makePromise({ Items: [] });
    }
  }

  class S3 {
    createPresignedPost(params, callback) {
      lastPresignedPostParams = params;
      callback(null, {
        url: "https://mock-bucket.s3.amazonaws.com",
        fields: {
          key: params.Fields.key,
          policy: "mock-policy",
          "x-amz-signature": "mock-signature",
          "Content-Type": params.Fields["Content-Type"],
        },
      });
    }
    getSignedUrlPromise(operation, params) {
      return Promise.resolve(`https://mock-bucket.s3.amazonaws.com/${params.Key}?op=${operation}`);
    }
  }

  class SQS {
    sendMessage(params) {
      sentQueueMessages.push(params);
      return makePromise({ MessageId: "msg-1" });
    }
  }

  return {
    DynamoDB: { DocumentClient },
    S3,
    SQS,
  };
};

globalThis.__AWS_SDK_MOCK__ = createAwsMock();

process.env.JOBS_TABLE = "test-jobs";
process.env.UPLOADS_BUCKET = "test-bucket";
process.env.COGNITO_ISSUER = "https://cognito-idp.eu-west-2.amazonaws.com/test-pool";
process.env.COGNITO_AUDIENCE = "test-client-id";
process.env.ALLOWED_ORIGINS = "http://localhost:5173";

const { handler } = await import("../src/handler.mjs");

function buildEvent({ method, path, body, headers = {} } = {}) {
  return {
    requestContext: { http: { method, path, sourceIp: "1.2.3.4" } },
    headers,
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
    queryStringParameters: {},
  };
}

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" });
const JWKS_KID = "test-key-1";

function toBase64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function createJwt(overrides = {}) {
  const header = { alg: "RS256", typ: "JWT", kid: JWKS_KID };
  const payload = {
    sub: "user-sub-1",
    iss: process.env.COGNITO_ISSUER,
    aud: process.env.COGNITO_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    ...overrides,
  };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(signingInput), privateKey)
    .toString("base64url");
  return `${signingInput}.${signature}`;
}

function buildAuthEvent({ method, path, body } = {}) {
  return buildEvent({
    method,
    path,
    body,
    headers: { authorization: `Bearer ${createJwt()}` },
  });
}

beforeEach(() => {
  jobsMap.clear();
  lastPresignedPostParams = null;
  sentQueueMessages.length = 0;
  delete process.env.ENABLE_GUARDDUTY_SCAN;
  delete process.env.BYPASS_SCAN_WHEN_DISABLED;
  delete process.env.PROCESS_QUEUE_URL;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      keys: [{ ...jwk, kid: JWKS_KID, alg: "RS256", use: "sig" }],
    }),
  });
});

describe("POST /jobs", () => {
  it("returns presigned POST payload and stores expected file metadata", async () => {
    const event = buildAuthEvent({
      method: "POST",
      path: "/jobs",
      body: {
        filename: "batch.csv",
        fileType: "csv",
        size: 1024,
        metadata: { clientName: "North Association", notes: "Batch 1" },
      },
    });

    const res = await handler(event);
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);

    expect(body.jobId).toBeTruthy();
    expect(body.s3Key).toMatch(/^uploads\/user-sub-1\//);
    expect(body.upload).toEqual({
      url: "https://mock-bucket.s3.amazonaws.com",
      fields: expect.objectContaining({
        key: body.s3Key,
        policy: "mock-policy",
        "x-amz-signature": "mock-signature",
      }),
    });

    expect(lastPresignedPostParams.Conditions).toContainEqual([
      "content-length-range",
      1,
      200 * 1024 * 1024,
    ]);

    const stored = jobsMap.get(body.jobId);
    expect(stored.expectedFileType).toBe("csv");
    expect(stored.expectedSize).toBe(1024);
    expect(stored.expiresAt).toBeTypeOf("number");
    expect(stored.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects invalid fileType", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/jobs",
        body: { filename: "doc.exe", fileType: "exe", size: 10 },
      })
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("invalid_file_type");
  });

  it("requires file size", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/jobs",
        body: { filename: "doc.pdf", fileType: "pdf" },
      })
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("size_required");
  });

  it("rejects files above 200 MB", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/jobs",
        body: {
          filename: "too-big.pdf",
          fileType: "pdf",
          size: 200 * 1024 * 1024 + 1,
        },
      })
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("file_too_large");
  });

  it("sets BYPASSED scan status without enqueuing when scan is disabled", async () => {
    process.env.ENABLE_GUARDDUTY_SCAN = "false";
    process.env.BYPASS_SCAN_WHEN_DISABLED = "true";

    const event = buildAuthEvent({
      method: "POST",
      path: "/jobs",
      body: {
        filename: "batch.csv",
        fileType: "csv",
        size: 1024,
      },
    });

    const res = await handler(event);
    expect(res.statusCode).toBe(201);

    const body = JSON.parse(res.body);
    const stored = jobsMap.get(body.jobId);
    expect(stored.scanResultStatus).toBe("BYPASSED");
    expect(sentQueueMessages).toHaveLength(0);
  });
});

describe("Auth and misc routes", () => {
  it("returns 401 when no Authorization header is present", async () => {
    const res = await handler(buildEvent({ method: "POST", path: "/jobs" }));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("missing_token");
  });

  it("returns 404 for unknown routes", async () => {
    const res = await handler(buildEvent({ method: "GET", path: "/unknown" }));
    expect(res.statusCode).toBe(404);
  });

  it("returns 200 for OPTIONS", async () => {
    const res = await handler(buildEvent({ method: "OPTIONS", path: "/jobs" }));
    expect(res.statusCode).toBe(200);
  });
});
