import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";

const jobsMap = new Map();
const usersMap = new Map();
const geoMap = new Map();
const electionsMap = new Map();
const organisationsMap = new Map();
const auditMap = new Map();
let lastPresignedPostParams = null;

const makePromise = (value) => ({ promise: async () => value });

function evaluateCondition(params, currentItem) {
  const condition = params.ConditionExpression || "";
  if (!condition) return true;

  if (condition.includes("attribute_not_exists(userId)")) {
    if (currentItem && currentItem.userId) return false;
  }
  if (condition.includes("attribute_exists(userId)")) {
    if (!currentItem || !currentItem.userId) return false;
  }
  if (condition.includes("#status = :pending")) {
    const statusName = params.ExpressionAttributeNames?.["#status"] || "status";
    const expected = params.ExpressionAttributeValues?.[":pending"];
    if ((currentItem?.[statusName] || "") !== expected) return false;
  }
  if (condition.includes("attribute_not_exists(#email) OR #email = :empty")) {
    const emailName = params.ExpressionAttributeNames?.["#email"] || "email";
    const emptyValue = params.ExpressionAttributeValues?.[":empty"] || "";
    if (currentItem?.[emailName] && currentItem[emailName] !== emptyValue) return false;
  }

  return true;
}

function resolveAttributeName(token, names = {}) {
  if (!token) return "";
  if (token.startsWith("#")) return names[token] || token;
  return token;
}

function applyUpdateExpression(item, params) {
  const expression = params.UpdateExpression || "";
  const setPrefix = "SET ";
  if (!expression.startsWith(setPrefix)) return item;

  const assignments = expression
    .slice(setPrefix.length)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const assignment of assignments) {
    const [rawKey, rawValue] = assignment.split("=").map((part) => part.trim());
    const key = resolveAttributeName(rawKey, params.ExpressionAttributeNames);
    const value = params.ExpressionAttributeValues?.[rawValue];
    item[key] = value;
  }

  return item;
}

const createAwsMock = () => {
  class DocumentClient {
    put(params) {
      if (params.TableName === process.env.JOBS_TABLE) {
        const item = params.Item;
        if (item?.jobId) jobsMap.set(item.jobId, { ...item });
        return makePromise({});
      }

      if (params.TableName === process.env.USERS_TABLE) {
        const item = params.Item;
        const existing = usersMap.get(item.userId);
        if (!evaluateCondition(params, existing)) {
          const err = new Error("ConditionalCheckFailedException");
          err.code = "ConditionalCheckFailedException";
          throw err;
        }
        usersMap.set(item.userId, { ...item });
      }

      if (params.TableName === process.env.ELECTIONS_TABLE) {
        const item = params.Item;
        if (item?.electionId) {
          electionsMap.set(item.electionId, { ...item });
        }
      }

      if (params.TableName === process.env.ORGANISATIONS_TABLE) {
        const item = params.Item;
        if (item?.orgId) {
          organisationsMap.set(item.orgId, { ...item });
        }
      }

      if (params.TableName === process.env.AUDIT_TABLE) {
        const item = params.Item;
        if (item?.auditId) {
          auditMap.set(item.auditId, { ...item });
        }
      }

      return makePromise({});
    }

    get(params) {
      if (params.TableName === process.env.JOBS_TABLE) {
        const jobId = params.Key?.jobId;
        return makePromise({ Item: jobsMap.get(jobId) });
      }

      if (params.TableName === process.env.USERS_TABLE) {
        const userId = params.Key?.userId;
        return makePromise({ Item: usersMap.get(userId) });
      }

      if (params.TableName === process.env.ELECTIONS_TABLE) {
        const electionId = params.Key?.electionId || "";
        return makePromise({ Item: electionsMap.get(electionId) || null });
      }

      if (params.TableName === process.env.GEO_LOOKUP_TABLE) {
        const wardCode = params.Key?.wardCode || "";
        return makePromise({ Item: geoMap.get(wardCode) || null });
      }

      if (params.TableName === process.env.ORGANISATIONS_TABLE) {
        const orgId = params.Key?.orgId || "";
        return makePromise({ Item: organisationsMap.get(orgId) || null });
      }

      return makePromise({ Item: null });
    }

    update(params) {
      if (params.TableName === process.env.JOBS_TABLE) {
        const jobId = params.Key?.jobId;
        const current = jobsMap.get(jobId);
        if (params.ConditionExpression?.includes("attribute_exists(jobId)") && !current) {
          const err = new Error("ConditionalCheckFailedException");
          err.code = "ConditionalCheckFailedException";
          throw err;
        }
        const next = applyUpdateExpression({ ...(current || { jobId }) }, params);
        jobsMap.set(jobId, next);
      }

      if (params.TableName === process.env.USERS_TABLE) {
        const userId = params.Key?.userId;
        const current = usersMap.get(userId);
        if (!evaluateCondition(params, current)) {
          const err = new Error("ConditionalCheckFailedException");
          err.code = "ConditionalCheckFailedException";
          throw err;
        }
        const next = applyUpdateExpression({ ...(current || { userId }) }, params);
        usersMap.set(userId, next);
      }
      return makePromise({});
    }

    query(params) {
      if (params.TableName === process.env.USERS_TABLE && params.IndexName === "StatusCreatedAtIndex") {
        const status = params.ExpressionAttributeValues?.[":status"];
        const items = Array.from(usersMap.values())
          .filter((item) => item.status === status)
          .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
        return makePromise({ Items: items.slice(0, params.Limit || 50) });
      }

      if (params.TableName === process.env.JOBS_TABLE && params.IndexName === "UserSubIndex") {
        const sub = params.ExpressionAttributeValues?.[":sub"];
        const items = Array.from(jobsMap.values()).filter((item) => item.userSub === sub);
        return makePromise({ Items: items.slice(0, params.Limit || 25) });
      }

      if (params.TableName === process.env.JOBS_TABLE && params.IndexName === "ManualReviewIndex") {
        const key = params.ExpressionAttributeValues?.[":manualReviewKey"];
        let items = Array.from(jobsMap.values())
          .filter((item) => item.manualReviewKey === key)
          .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        if (params.ExclusiveStartKey?.jobId) {
          const idx = items.findIndex((item) => item.jobId === params.ExclusiveStartKey.jobId);
          if (idx >= 0) items = items.slice(idx + 1);
        }
        const limited = items.slice(0, params.Limit || 50);
        const last = limited.length < items.length ? limited[limited.length - 1] : null;
        return makePromise({
          Items: limited,
          LastEvaluatedKey: last ? { jobId: last.jobId, createdAt: last.createdAt, manualReviewKey: last.manualReviewKey } : undefined,
        });
      }

      if (params.TableName === process.env.ELECTIONS_TABLE && params.IndexName === "StatusPconDateIndex") {
        const statusPconKey = params.ExpressionAttributeValues?.[":statusPconKey"];
        const items = Array.from(electionsMap.values())
          .filter((item) => item.statusPconKey === statusPconKey)
          .sort((a, b) => (a.dateElectionKey || "").localeCompare(b.dateElectionKey || ""));
        return makePromise({ Items: items });
      }

      if (params.TableName === process.env.ORGANISATIONS_TABLE && params.IndexName === "ActiveOrgTypeIndex") {
        const key = params.ExpressionAttributeValues?.[":activeOrgTypeKey"];
        const items = Array.from(organisationsMap.values())
          .filter((item) => item.activeOrgTypeKey === key)
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        return makePromise({ Items: items.slice(0, params.Limit || 100) });
      }

      return makePromise({ Items: [] });
    }

    delete(params) {
      if (params.TableName === process.env.ELECTIONS_TABLE) {
        const electionId = params.Key?.electionId || "";
        electionsMap.delete(electionId);
      }
      return makePromise({});
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

  return {
    DynamoDB: { DocumentClient },
    S3,
  };
};

globalThis.__AWS_SDK_MOCK__ = createAwsMock();

process.env.JOBS_TABLE = "test-jobs";
process.env.USERS_TABLE = "test-users";
process.env.ELECTIONS_TABLE = "test-elections";
process.env.ORGANISATIONS_TABLE = "test-orgs";
process.env.AUDIT_TABLE = "test-audit";
process.env.GEO_LOOKUP_TABLE = "test-geo";
process.env.UPLOADS_BUCKET = "test-bucket";
process.env.COGNITO_ISSUER = "https://cognito-idp.eu-west-2.amazonaws.com/test-pool";
process.env.COGNITO_AUDIENCE = "test-client-id";
process.env.ALLOWED_ORIGINS = "http://localhost:5173";
process.env.ADMIN_SUB_ALLOWLIST = "admin-sub";

const { handler } = await import("../src/handler.mjs");

function buildEvent({ method, path, body, headers = {}, queryStringParameters = {} } = {}) {
  return {
    requestContext: { http: { method, path, sourceIp: "1.2.3.4" } },
    headers,
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
    queryStringParameters,
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
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

function buildAuthEvent({ method, path, body, sub = "user-sub-1", queryStringParameters, claims = {} } = {}) {
  return buildEvent({
    method,
    path,
    body,
    queryStringParameters,
    headers: { authorization: `Bearer ${createJwt({ sub, ...claims })}` },
  });
}

beforeEach(() => {
  jobsMap.clear();
  usersMap.clear();
  geoMap.clear();
  electionsMap.clear();
  organisationsMap.clear();
  auditMap.clear();
  lastPresignedPostParams = null;
  usersMap.set("user-sub-1", {
    userId: "user-sub-1",
    status: "APPROVED",
    orgId: "org-a",
    orgType: "ASSOCIATION",
    allowedPconCodes: ["E14000637"],
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  geoMap.set("W1001", { wardCode: "W1001", pconCode: "E14000637" });
  geoMap.set("W9999", { wardCode: "W9999", pconCode: "E14000000" });
  electionsMap.set("election-allowed", {
    electionId: "election-allowed",
    recordType: "ELECTION",
    name: "Allowed Election",
    date: "2026-05-07",
    electionType: "LOCAL",
    status: "OPEN",
    pconCodes: ["E14000637"],
  });
  electionsMap.set("election-closed", {
    electionId: "election-closed",
    recordType: "ELECTION",
    name: "Closed Election",
    date: "2026-05-08",
    electionType: "LOCAL",
    status: "CLOSED",
    pconCodes: ["E14000637"],
  });
  electionsMap.set("election-other-pcon", {
    electionId: "election-other-pcon",
    recordType: "ELECTION",
    name: "Other Constituency Election",
    date: "2026-05-09",
    electionType: "LOCAL",
    status: "OPEN",
    pconCodes: ["E14009999"],
  });
  electionsMap.set("election-allowed#E14000637", {
    electionId: "election-allowed#E14000637",
    recordType: "ELECTION_PROJECTION",
    canonicalElectionId: "election-allowed",
    pconCode: "E14000637",
    status: "OPEN",
    statusPconKey: "OPEN#E14000637",
    dateElectionKey: "2026-05-07#election-allowed",
    date: "2026-05-07",
    name: "Allowed Election",
    electionType: "LOCAL",
    pconCodes: ["E14000637"],
  });
  electionsMap.set("election-upcoming#E14000637", {
    electionId: "election-upcoming#E14000637",
    recordType: "ELECTION_PROJECTION",
    canonicalElectionId: "election-upcoming",
    pconCode: "E14000637",
    status: "UPCOMING",
    statusPconKey: "UPCOMING#E14000637",
    dateElectionKey: "2026-04-01#election-upcoming",
    date: "2026-04-01",
    name: "Upcoming Election",
    electionType: "PCC",
    pconCodes: ["E14000637"],
  });
  organisationsMap.set("org-request-1", {
    orgId: "org-request-1",
    name: "Requested Organisation",
    orgType: "ASSOCIATION",
    isActive: true,
    pconCodes: ["E14000999"],
    activeOrgTypeKey: "ACTIVE#ASSOCIATION",
  });
  organisationsMap.set("org-inactive", {
    orgId: "org-inactive",
    name: "Inactive Organisation",
    orgType: "ASSOCIATION",
    isActive: false,
    pconCodes: ["E14000999"],
    activeOrgTypeKey: "INACTIVE#ASSOCIATION",
  });
  jobsMap.set("mr-open-1", {
    jobId: "mr-open-1",
    userSub: "user-sub-1",
    userId: "user-sub-1",
    orgId: "org-a",
    filename: "mr-open.csv",
    fileType: "csv",
    s3Key: "uploads/user-sub-1/mr-open-1/mr-open.csv",
    status: "QUEUED",
    requiresManualReview: true,
    manualReviewStatus: "OPEN",
    manualReviewReason: "Election missing from configured list.",
    manualReviewKey: "MR#OPEN",
    pconCode: "E14000637",
    electionId: "OTHER",
    createdAt: "2026-01-04T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
  });
  jobsMap.set("mr-resolved-1", {
    jobId: "mr-resolved-1",
    userSub: "user-sub-1",
    userId: "user-sub-1",
    orgId: "org-a",
    filename: "mr-resolved.csv",
    fileType: "csv",
    s3Key: "uploads/user-sub-1/mr-resolved-1/mr-resolved.csv",
    status: "QUEUED",
    requiresManualReview: true,
    manualReviewStatus: "RESOLVED",
    manualReviewKey: "MR#RESOLVED",
    pconCode: "E14000637",
    electionId: "OTHER",
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  });

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      keys: [{ ...jwk, kid: JWKS_KID, alg: "RS256", use: "sig" }],
    }),
  });
});

describe("User application endpoints", () => {
  it("GET /me creates a pending user if missing and stores email from claims", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/me",
        sub: "new-user-sub",
        claims: { email: "new.user@example.com" },
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.userId).toBe("new-user-sub");
    expect(body.user.status).toBe("PENDING");
    expect(body.user.email).toBe("new.user@example.com");
    expect(usersMap.get("new-user-sub")?.status).toBe("PENDING");
    expect(usersMap.get("new-user-sub")?.email).toBe("new.user@example.com");
  });

  it("GET /me backfills email when existing user email is blank", async () => {
    usersMap.set("blank-email-user", {
      userId: "blank-email-user",
      status: "PENDING",
      email: "",
      requestedOrgId: "org-request-1",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/me",
        sub: "blank-email-user",
        claims: { email: "blank.backfill@example.com" },
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe("blank.backfill@example.com");
    expect(body.user.status).toBe("PENDING");
    expect(body.user.requestedOrgId).toBe("org-request-1");
    expect(usersMap.get("blank-email-user")?.email).toBe("blank.backfill@example.com");
  });

  it("GET /me does not overwrite existing email", async () => {
    usersMap.set("existing-email-user", {
      userId: "existing-email-user",
      status: "PENDING",
      email: "already.set@example.com",
      requestedOrgId: "org-request-1",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/me",
        sub: "existing-email-user",
        claims: { email: "new.email@example.com" },
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe("already.set@example.com");
    expect(body.user.status).toBe("PENDING");
    expect(body.user.requestedOrgId).toBe("org-request-1");
    expect(usersMap.get("existing-email-user")?.email).toBe("already.set@example.com");
  });

  it("POST /apply updates requested fields for a pending user", async () => {
    usersMap.set("pending-user", {
      userId: "pending-user",
      status: "PENDING",
      createdAt: "2026-01-02T00:00:00.000Z",
    });

    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/apply",
        sub: "pending-user",
        body: {
          requestedOrgId: "org-request-1",
          requestedOrgType: "ASSOCIATION",
          requestedPconCode: "E14000999",
        },
      })
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.requestedOrgId).toBe("org-request-1");
    expect(body.user.requestedPconCode).toBe("E14000999");
  });

  it("POST /apply rejects unknown requestedOrgId", async () => {
    usersMap.set("pending-user", {
      userId: "pending-user",
      status: "PENDING",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/apply",
        sub: "pending-user",
        body: {
          requestedOrgId: "missing-org",
          requestedPconCode: "E14000999",
        },
      })
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("ORG_NOT_FOUND");
  });

  it("POST /apply rejects inactive requestedOrgId", async () => {
    usersMap.set("pending-user", {
      userId: "pending-user",
      status: "PENDING",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/apply",
        sub: "pending-user",
        body: {
          requestedOrgId: "org-inactive",
          requestedPconCode: "E14000999",
        },
      })
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("ORG_INACTIVE");
  });

  it("POST /apply rejects pcon outside org scope", async () => {
    usersMap.set("pending-user", {
      userId: "pending-user",
      status: "PENDING",
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/apply",
        sub: "pending-user",
        body: {
          requestedOrgId: "org-request-1",
          requestedPconCode: "E14000001",
        },
      })
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("PCON_NOT_IN_ORG_SCOPE");
  });
});

describe("POST /jobs approval gating", () => {
  it("returns 403 and auto-creates pending record when user is missing", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/jobs",
        sub: "missing-user",
        body: {
          filename: "batch.csv",
          pconCode: "E14000637",
          electionId: "election-allowed",
          fileType: "csv",
          size: 1024,
        },
      })
    );

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("PENDING_APPROVAL");
    expect(body.status).toBe("PENDING");
    expect(usersMap.get("missing-user")?.status).toBe("PENDING");
  });

  it("returns 403 for pending users", async () => {
    usersMap.set("user-sub-1", {
      userId: "user-sub-1",
      status: "PENDING",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/jobs",
        body: {
          filename: "batch.csv",
          pconCode: "E14000637",
          electionId: "election-allowed",
          fileType: "csv",
          size: 1024,
        },
      })
    );

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ code: "PENDING_APPROVAL", status: "PENDING" });
  });

  it("allows approved users and creates a job", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/jobs",
        body: {
          filename: "batch.csv",
          pconCode: "E14000637",
          electionId: "election-allowed",
          fileType: "csv",
          size: 1024,
          wards: ["W1001"],
          metadata: { clientName: "North Association", notes: "Batch 1" },
        },
      })
    );

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.jobId).toBeTruthy();
    expect(body.s3Key).toMatch(/^uploads\/user-sub-1\//);
    expect(body.pconCode).toBe("E14000637");
    expect(body.electionId).toBe("election-allowed");
    expect(body.requiresManualReview).toBe(false);
    expect(body.wardCodes).toEqual(["W1001"]);
    expect(lastPresignedPostParams.Conditions).toContainEqual(["content-length-range", 1, 200 * 1024 * 1024]);
    const storedJob = jobsMap.get(body.jobId);
    expect(storedJob.pconCode).toBe("E14000637");
    expect(storedJob.electionId).toBe("election-allowed");
    expect(storedJob.wardCodes).toEqual(["W1001"]);
    expect(storedJob.orgId).toBe("org-a");
    expect(Array.from(auditMap.values()).some((entry) => entry.action === "JOB_CREATED")).toBe(true);
  });

  it("returns 400 when pconCode is missing", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/jobs",
        body: { filename: "batch.csv", fileType: "csv", size: 1024 },
      })
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("PCON_REQUIRED");
  });

  it("returns 403 when pconCode is not in allowedPconCodes", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/jobs",
        body: {
          filename: "batch.csv",
          pconCode: "E14009999",
          electionId: "election-allowed",
          fileType: "csv",
          size: 1024,
        },
      })
    );
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("PCON_NOT_ALLOWED");
  });

  it("returns 400 when ward does not belong to pconCode", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/jobs",
        body: {
          filename: "batch.csv",
          pconCode: "E14000637",
          electionId: "election-allowed",
          wards: ["W9999"],
          fileType: "csv",
          size: 1024,
        },
      })
    );
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("WARD_NOT_IN_PCON");
    expect(body.details.wardCode).toBe("W9999");
  });

  it("returns 400 when electionId is missing", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/jobs",
        body: { filename: "batch.csv", pconCode: "E14000637", fileType: "csv", size: 1024 },
      })
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("ELECTION_REQUIRED");
  });

  it("returns 400 when electionId is not permitted for pcon", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/jobs",
        body: {
          filename: "batch.csv",
          pconCode: "E14000637",
          electionId: "election-other-pcon",
          fileType: "csv",
          size: 1024,
        },
      })
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("ELECTION_NOT_ALLOWED");
  });

  it("rejects OTHER electionId without manualReviewReason", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/jobs",
        body: {
          filename: "batch.csv",
          pconCode: "E14000637",
          electionId: "OTHER",
          fileType: "csv",
          size: 1024,
        },
      })
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe("MANUAL_REVIEW_REASON_REQUIRED");
  });

  it("allows OTHER electionId and sets requiresManualReview", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/jobs",
        body: {
          filename: "batch.csv",
          pconCode: "E14000637",
          electionId: "OTHER",
          manualReviewReason: "Election list not yet configured.",
          fileType: "csv",
          size: 1024,
        },
      })
    );
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.requiresManualReview).toBe(true);
    expect(body.manualReviewReason).toBe("Election list not yet configured.");
    const storedJob = jobsMap.get(body.jobId);
    expect(storedJob.electionId).toBe("OTHER");
    expect(storedJob.requiresManualReview).toBe(true);
    expect(storedJob.manualReviewReason).toBe("Election list not yet configured.");
  });
});

describe("GET /elections", () => {
  it("rejects pconCode outside allowedPconCodes", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/elections",
        queryStringParameters: { pconCode: "E14009999", status: "OPEN,UPCOMING" },
      })
    );
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("PCON_NOT_ALLOWED");
  });

  it("returns elections sorted by date", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/elections",
        queryStringParameters: { pconCode: "E14000637", status: "OPEN,UPCOMING" },
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items.map((item) => item.electionId)).toEqual(["election-upcoming", "election-allowed"]);
  });
});

describe("GET /organisations", () => {
  it("returns active organisations by orgType", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/organisations",
        queryStringParameters: { orgType: "ASSOCIATION", active: "true" },
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items.some((item) => item.orgId === "org-request-1")).toBe(true);
    expect(body.items.some((item) => item.orgId === "org-inactive")).toBe(false);
  });
});

describe("Admin endpoints", () => {
  it("allows admin endpoints for users in Admin cognito group", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/admin/users",
        sub: "group-admin",
        claims: { "cognito:groups": ["Admin"] },
      })
    );
    expect(res.statusCode).toBe(200);
  });

  it("denies admin endpoints when groups claim lacks Admin", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/admin/users",
        sub: "group-user",
        claims: { "cognito:groups": ["Users"] },
      })
    );
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("FORBIDDEN");
  });

  it("allows fallback allowlist when groups claim is absent", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/admin/users",
        sub: "admin-sub",
      })
    );
    expect(res.statusCode).toBe(200);
  });

  it("GET /admin/me returns admin identity", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/admin/me",
        sub: "admin-sub",
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.isAdmin).toBe(true);
    expect(body.sub).toBe("admin-sub");
  });

  it("GET /admin/users requires admin identity", async () => {
    const res = await handler(buildAuthEvent({ method: "GET", path: "/admin/users" }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("FORBIDDEN");
  });

  it("GET /admin/users lists pending users for admin", async () => {
    usersMap.set("pending-a", {
      userId: "pending-a",
      status: "PENDING",
      createdAt: "2026-01-02T00:00:00.000Z",
    });

    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/admin/users",
        sub: "admin-sub",
        queryStringParameters: { status: "PENDING" },
      })
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("PENDING");
    expect(body.items.some((item) => item.userId === "pending-a")).toBe(true);
  });

  it("POST /admin/users/{id}/approve approves the user", async () => {
    usersMap.set("pending-user", {
      userId: "pending-user",
      status: "PENDING",
      createdAt: "2026-01-03T00:00:00.000Z",
    });

    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/admin/users/pending-user/approve",
        sub: "admin-sub",
        body: {
          orgId: "org-approved",
          orgType: "ASSOCIATION",
          allowedPconCodes: ["E14000637"],
        },
      })
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.status).toBe("APPROVED");
    expect(body.user.orgId).toBe("org-approved");
    expect(body.user.allowedPconCodes).toEqual(["E14000637"]);
    expect(body.user.approvedBy).toBe("admin-sub");
    expect(
      Array.from(auditMap.values()).some(
        (entry) => entry.action === "USER_APPROVED" && entry.targetKey === "USER#pending-user"
      )
    ).toBe(true);
  });

  it("POST /admin/users/{id}/reject rejects the user", async () => {
    usersMap.set("pending-user", {
      userId: "pending-user",
      status: "PENDING",
      createdAt: "2026-01-03T00:00:00.000Z",
    });

    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/admin/users/pending-user/reject",
        sub: "admin-sub",
        body: { reason: "Insufficient details" },
      })
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.status).toBe("REJECTED");
    expect(body.user.rejectedReason).toBe("Insufficient details");
    expect(body.user.rejectedBy).toBe("admin-sub");
    expect(
      Array.from(auditMap.values()).some(
        (entry) => entry.action === "USER_REJECTED" && entry.targetKey === "USER#pending-user"
      )
    ).toBe(true);
  });

  it("POST /admin/elections requires admin identity", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/admin/elections",
        body: {
          name: "Test Election",
          date: "2026-05-10",
          electionType: "LOCAL",
          status: "OPEN",
          pconCodes: ["E14000637"],
        },
      })
    );
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe("FORBIDDEN");
  });

  it("POST /admin/elections creates canonical and projection rows", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/admin/elections",
        sub: "admin-sub",
        body: {
          electionId: "election-new",
          name: "New Election",
          date: "2026-06-01",
          electionType: "LOCAL",
          status: "UPCOMING",
          pconCodes: ["E14000637", "E14000638"],
        },
      })
    );
    expect(res.statusCode).toBe(201);
    expect(electionsMap.get("election-new")?.recordType).toBe("ELECTION");
    expect(electionsMap.get("election-new#E14000637")?.recordType).toBe("ELECTION_PROJECTION");
    expect(electionsMap.get("election-new#E14000638")?.recordType).toBe("ELECTION_PROJECTION");
    expect(
      Array.from(auditMap.values()).some(
        (entry) => entry.action === "ELECTION_CREATED" && entry.targetKey === "ELECTION#election-new"
      )
    ).toBe(true);
  });

  it("PUT /admin/elections/{id} reconciles projection rows", async () => {
    electionsMap.set("election-update", {
      electionId: "election-update",
      recordType: "ELECTION",
      name: "Election Update",
      date: "2026-05-01",
      electionType: "LOCAL",
      status: "OPEN",
      pconCodes: ["E14000637", "E14000638"],
    });
    electionsMap.set("election-update#E14000637", {
      electionId: "election-update#E14000637",
      recordType: "ELECTION_PROJECTION",
      canonicalElectionId: "election-update",
      pconCode: "E14000637",
      statusPconKey: "OPEN#E14000637",
      dateElectionKey: "2026-05-01#election-update",
      status: "OPEN",
    });
    electionsMap.set("election-update#E14000638", {
      electionId: "election-update#E14000638",
      recordType: "ELECTION_PROJECTION",
      canonicalElectionId: "election-update",
      pconCode: "E14000638",
      statusPconKey: "OPEN#E14000638",
      dateElectionKey: "2026-05-01#election-update",
      status: "OPEN",
    });

    const res = await handler(
      buildAuthEvent({
        method: "PUT",
        path: "/admin/elections/election-update",
        sub: "admin-sub",
        body: {
          name: "Election Update",
          date: "2026-05-20",
          electionType: "LOCAL",
          status: "OPEN",
          pconCodes: ["E14000637"],
        },
      })
    );
    expect(res.statusCode).toBe(200);
    expect(electionsMap.get("election-update#E14000637")?.dateElectionKey).toBe(
      "2026-05-20#election-update"
    );
    expect(electionsMap.has("election-update#E14000638")).toBe(false);
    expect(
      Array.from(auditMap.values()).some(
        (entry) => entry.action === "ELECTION_UPDATED" && entry.targetKey === "ELECTION#election-update"
      )
    ).toBe(true);
  });

  it("POST /admin/elections/{id}/archive archives election and audits", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/admin/elections/election-allowed/archive",
        sub: "admin-sub",
      })
    );
    expect(res.statusCode).toBe(200);
    expect(electionsMap.get("election-allowed")?.status).toBe("ARCHIVED");
    expect(
      Array.from(auditMap.values()).some(
        (entry) => entry.action === "ELECTION_ARCHIVED" && entry.targetKey === "ELECTION#election-allowed"
      )
    ).toBe(true);
  });
});

describe("Manual review admin endpoints", () => {
  it("enforces admin auth on list endpoint", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/admin/manual-review/jobs",
      })
    );
    expect(res.statusCode).toBe(403);
  });

  it("lists only OPEN manual review jobs by default", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/admin/manual-review/jobs",
        sub: "admin-sub",
      })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items.map((item) => item.jobId)).toContain("mr-open-1");
    expect(body.items.map((item) => item.jobId)).not.toContain("mr-resolved-1");
  });

  it("gets manual review job detail", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "GET",
        path: "/admin/manual-review/jobs/mr-open-1",
        sub: "admin-sub",
      })
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).job.jobId).toBe("mr-open-1");
  });

  it("resolve requires note with minimum length", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/admin/manual-review/jobs/mr-open-1/resolve",
        sub: "admin-sub",
        body: { decision: "APPROVE", note: "short" },
      })
    );
    expect(res.statusCode).toBe(400);
  });

  it("resolve updates manual review fields and writes audit", async () => {
    const res = await handler(
      buildAuthEvent({
        method: "POST",
        path: "/admin/manual-review/jobs/mr-open-1/resolve",
        sub: "admin-sub",
        body: {
          decision: "APPROVE",
          note: "Validated against official local election notice.",
          correctedElectionId: "election-allowed",
        },
      })
    );
    expect(res.statusCode).toBe(200);
    const updated = jobsMap.get("mr-open-1");
    expect(updated.manualReviewStatus).toBe("RESOLVED");
    expect(updated.manualReviewDecision).toBe("APPROVE");
    expect(updated.correctedElectionId).toBe("election-allowed");
    expect(updated.blocked).toBe(false);
    expect(updated.manualReviewKey).toBe("MR#RESOLVED");
    expect(
      Array.from(auditMap.values()).some(
        (entry) => entry.action === "MANUAL_REVIEW_RESOLVE" && entry.targetKey === "JOB#mr-open-1"
      )
    ).toBe(true);
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
