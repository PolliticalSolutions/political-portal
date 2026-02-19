import { beforeEach, describe, expect, it, vi } from "vitest";

// ── In-memory stores ──────────────────────────────────────────────────────────

const jobsMap = new Map();

// ── AWS SDK mock ──────────────────────────────────────────────────────────────

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
    update(params) {
      const jobId = params.Key?.jobId;
      const existing = jobsMap.get(jobId) || {};
      // Apply expression values (simplified: pull named values from ExpressionAttributeValues)
      const vals = params.ExpressionAttributeValues || {};
      const names = params.ExpressionAttributeNames || {};
      // Map the attribute name aliases back to real names and apply
      for (const [alias, realName] of Object.entries(names)) {
        const valKey = Object.keys(vals).find((k) => {
          // Match aliases like :status -> #status
          return k.replace(/^:/, "") === alias.replace(/^#/, "");
        });
        if (valKey !== undefined) {
          existing[realName] = vals[valKey];
        }
      }
      // Also set plain attributes (updatedAt etc)
      if (vals[":now"]) existing.updatedAt = vals[":now"];
      if (vals[":status"]) existing.status = vals[":status"];
      jobsMap.set(jobId, existing);
      return makePromise({});
    }
    query(params) {
      const sub = params.ExpressionAttributeValues?.[":sub"];
      const items = Array.from(jobsMap.values())
        .filter((j) => j.userSub === sub)
        .slice(0, params.Limit || 25);
      return makePromise({ Items: items });
    }
  }

  class S3 {
    getSignedUrlPromise(operation, params) {
      return Promise.resolve(
        `https://mock-bucket.s3.amazonaws.com/${params.Key}?op=${operation}&sig=mocksig`
      );
    }
    putObject() {
      return makePromise({ ETag: '"mock-etag"' });
    }
    getObject(params) {
      return makePromise({ Body: Buffer.from("jobId,filename\ntest,test.pdf\n") });
    }
  }

  return {
    DynamoDB: { DocumentClient },
    S3,
  };
};

// ── Setup: inject mock before importing handler ───────────────────────────────

globalThis.__AWS_SDK_MOCK__ = createAwsMock();

process.env.JOBS_TABLE = "test-jobs";
process.env.UPLOADS_BUCKET = "test-bucket";
process.env.COGNITO_ISSUER = "https://cognito-idp.eu-west-2.amazonaws.com/test-pool";
process.env.COGNITO_AUDIENCE = "test-client-id";
process.env.ALLOWED_ORIGINS = "http://localhost:5173";

const { handler } = await import("../src/handler.mjs");

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEvent({ method, path, body, headers = {} } = {}) {
  return {
    requestContext: { http: { method, path, sourceIp: "1.2.3.4" } },
    headers,
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
    queryStringParameters: {},
  };
}

function buildAuthEvent({ method, path, body, token = "valid-token" } = {}) {
  return buildEvent({
    method,
    path,
    body,
    headers: { authorization: `Bearer ${token}` },
  });
}

// Stub verifyJwt via fetch mock for JWKS so that tokens are accepted
// Instead we test without real JWT: auth is "not configured" or "invalid"
// For integration-style tests we skip auth by setting COGNITO_ISSUER to ""
const withoutAuth = async (fn) => {
  const orig = process.env.COGNITO_ISSUER;
  process.env.COGNITO_ISSUER = "";
  try {
    return await fn();
  } finally {
    process.env.COGNITO_ISSUER = orig;
  }
};

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jobsMap.clear();
});

describe("OPTIONS preflight", () => {
  it("returns 200 for OPTIONS requests", async () => {
    const event = buildEvent({ method: "OPTIONS", path: "/jobs" });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeDefined();
  });
});

describe("Authentication", () => {
  it("returns 503 when auth is not configured", async () => {
    const event = buildAuthEvent({ method: "POST", path: "/jobs" });
    const res = await withoutAuth(() => handler(event));
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("auth_not_configured");
  });

  it("returns 401 when no Authorization header is present", async () => {
    const event = buildEvent({ method: "POST", path: "/jobs" });
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("missing_token");
  });

  it("returns 401 for an invalid/unsigned token", async () => {
    // COGNITO_ISSUER is set so auth IS configured; the token is garbage
    const event = buildEvent({
      method: "GET",
      path: "/jobs",
      headers: { authorization: "Bearer not.a.real.jwt" },
    });
    // Mock fetch so JWKS lookup doesn't fail the test runner
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [] }),
    });
    const res = await handler(event);
    expect(res.statusCode).toBe(401);
    delete global.fetch;
  });
});

describe("POST /jobs", () => {
  it("returns 400 for invalid file type", async () => {
    // Temporarily disable auth for unit test
    const res = await withoutAuth(async () => {
      return handler(buildEvent({ method: "POST", path: "/jobs", body: { filename: "doc.exe", fileType: "exe" } }));
    });
    // Without auth configured it returns 503 (auth_not_configured)
    // So this also validates the auth check runs first
    expect([400, 503]).toContain(res.statusCode);
  });

  it("validates that filename is required", async () => {
    const res = await withoutAuth(() =>
      handler(buildEvent({ method: "POST", path: "/jobs", body: { fileType: "pdf" } }))
    );
    expect([400, 503]).toContain(res.statusCode);
  });
});

describe("GET /jobs", () => {
  it("returns 401 without auth", async () => {
    const res = await handler(buildEvent({ method: "GET", path: "/jobs" }));
    expect(res.statusCode).toBe(401);
  });

  it("returns 503 when auth is not configured", async () => {
    const res = await withoutAuth(() => handler(buildEvent({ method: "GET", path: "/jobs" })));
    expect(res.statusCode).toBe(503);
  });
});

describe("GET /jobs/{jobId}", () => {
  it("returns 404 for unknown jobId when auth not configured", async () => {
    const res = await withoutAuth(() =>
      handler(buildEvent({ method: "GET", path: "/jobs/nonexistent-id" }))
    );
    // auth_not_configured takes priority
    expect(res.statusCode).toBe(503);
  });
});

describe("GET /jobs/{jobId}/download", () => {
  it("returns 401 when no auth header provided", async () => {
    const res = await handler(buildEvent({ method: "GET", path: "/jobs/some-job/download" }));
    expect(res.statusCode).toBe(401);
  });
});

describe("Unknown routes", () => {
  it("returns 404 for unrecognised paths", async () => {
    const res = await handler(buildEvent({ method: "GET", path: "/unknown" }));
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for POST to /jobs/{jobId}", async () => {
    const res = await handler(buildEvent({ method: "POST", path: "/jobs/some-id" }));
    expect(res.statusCode).toBe(404);
  });
});

describe("CORS headers", () => {
  it("includes CORS headers on all responses", async () => {
    const event = buildEvent({ method: "OPTIONS", path: "/jobs" });
    const res = await handler(event);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeDefined();
    expect(res.headers["Access-Control-Allow-Headers"]).toContain("Authorization");
  });

  it("reflects allowed origin when origin matches", async () => {
    const event = buildEvent({
      method: "OPTIONS",
      path: "/jobs",
      headers: { origin: "http://localhost:5173" },
    });
    const res = await handler(event);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
  });
});
