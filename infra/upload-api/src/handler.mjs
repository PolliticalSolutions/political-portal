import { createRequire } from "module";
import crypto from "crypto";

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
const UPLOAD_URL_TTL = 900; // 15 minutes
const DOWNLOAD_URL_TTL = 900; // 15 minutes

const MAX_FILENAME = 255;
const MAX_CLIENT_NAME = 200;
const MAX_NOTES = 1000;
const VALID_FILE_TYPES = new Set(["pdf", "csv"]);

// ── JWKS cache ────────────────────────────────────────────────────────────────

const JWKS_CACHE_MS = 6 * 60 * 60 * 1000;
const jwksCache = { keys: null, fetchedAt: 0 };

function base64UrlToBuffer(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const base64 = normalized + "=".repeat(padding);
  return Buffer.from(base64, "base64");
}

async function fetchJwks() {
  const issuer = process.env.COGNITO_ISSUER;
  if (!issuer) return null;
  const now = Date.now();
  if (jwksCache.keys && now - jwksCache.fetchedAt < JWKS_CACHE_MS) {
    return jwksCache.keys;
  }
  const url = `${issuer.replace(/\/+$/, "")}/.well-known/jwks.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed (${res.status}).`);
  const data = await res.json();
  jwksCache.keys = data?.keys || [];
  jwksCache.fetchedAt = now;
  return jwksCache.keys;
}

async function verifyJwt(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header, payload;
  try {
    header = JSON.parse(base64UrlToBuffer(parts[0]).toString("utf-8"));
    payload = JSON.parse(base64UrlToBuffer(parts[1]).toString("utf-8"));
  } catch {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid) return null;

  const issuer = process.env.COGNITO_ISSUER;
  const audience = process.env.COGNITO_AUDIENCE;
  if (!issuer || !audience) return null;
  if (payload.iss !== issuer) return null;

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud || payload.client_id];
  if (!aud.includes(audience)) return null;

  if (typeof payload.exp === "number" && Date.now() / 1000 >= payload.exp) return null;

  const jwks = await fetchJwks();
  const jwk = jwks?.find((key) => key.kid === header.kid);
  if (!jwk) return null;

  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlToBuffer(parts[2]);
  const verified = crypto.verify("RSA-SHA256", signingInput, key, signature);
  return verified ? payload : null;
}

function isAuthConfigured() {
  const issuer = (process.env.COGNITO_ISSUER || "").trim();
  const audience = (process.env.COGNITO_AUDIENCE || "").trim();
  return Boolean(issuer && audience);
}

// ── CORS helpers ──────────────────────────────────────────────────────────────

function getAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || "*";
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function resolveAllowedOrigin(event) {
  const origins = getAllowedOrigins();
  if (origins.length === 0 || origins.includes("*")) return "*";
  const requestOrigin = event?.headers?.origin || event?.headers?.Origin || "";
  if (requestOrigin && origins.includes(requestOrigin)) return requestOrigin;
  return origins[0];
}

function response(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function getBearerToken(event) {
  const header = event?.headers?.authorization || event?.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

async function requireAuth(event, origin) {
  if (!isAuthConfigured()) {
    return { error: response(503, { error: "auth_not_configured" }, origin) };
  }
  const token = getBearerToken(event);
  if (!token) {
    return { error: response(401, { error: "missing_token" }, origin) };
  }
  let payload;
  try {
    payload = await verifyJwt(token);
  } catch {
    return { error: response(401, { error: "token_verification_failed" }, origin) };
  }
  if (!payload) {
    return { error: response(401, { error: "invalid_token" }, origin) };
  }
  const userSub = payload.sub || payload["cognito:username"] || "";
  if (!userSub) {
    return { error: response(401, { error: "missing_sub" }, origin) };
  }
  return { payload, userSub };
}

// ── Input helpers ─────────────────────────────────────────────────────────────

function clamp(value, max) {
  if (!value) return "";
  return value.toString().trim().slice(0, max);
}

function sanitize(value, max) {
  return clamp(value, max).replace(/[<>]/g, "");
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body);
  } catch {
    return null;
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleCreateJob(event, origin) {
  const auth = await requireAuth(event, origin);
  if (auth.error) return auth.error;
  const { userSub } = auth;

  const body = parseBody(event);
  if (!body) {
    return response(400, { error: "invalid_json" }, origin);
  }

  const filename = sanitize(body.filename, MAX_FILENAME);
  const fileType = (body.fileType || "").toString().toLowerCase().trim();

  if (!filename) {
    return response(400, { error: "filename_required" }, origin);
  }
  if (!VALID_FILE_TYPES.has(fileType)) {
    return response(400, { error: "invalid_file_type", detail: "Must be pdf or csv." }, origin);
  }

  const clientName = sanitize(body.metadata?.clientName, MAX_CLIENT_NAME);
  const notes = sanitize(body.metadata?.notes, MAX_NOTES);

  const jobId = crypto.randomUUID();
  const s3Key = `uploads/${userSub}/${jobId}/${filename}`;
  const now = new Date().toISOString();

  const item = {
    jobId,
    userSub,
    filename,
    fileType,
    s3Key,
    status: "QUEUED",
    createdAt: now,
    updatedAt: now,
    metadata: { clientName, notes },
  };

  await dynamo.put({ TableName: JOBS_TABLE, Item: item }).promise();

  const uploadUrl = await s3.getSignedUrlPromise("putObject", {
    Bucket: UPLOADS_BUCKET,
    Key: s3Key,
    Expires: UPLOAD_URL_TTL,
  });

  return response(201, { jobId, uploadUrl, s3Key }, origin);
}

async function handleListJobs(event, origin) {
  const auth = await requireAuth(event, origin);
  if (auth.error) return auth.error;
  const { userSub } = auth;

  const qs = event.queryStringParameters || {};
  const limit = Math.min(100, Math.max(1, parseInt(qs.limit, 10) || 25));

  const result = await dynamo
    .query({
      TableName: JOBS_TABLE,
      IndexName: "UserSubIndex",
      KeyConditionExpression: "userSub = :sub",
      ExpressionAttributeValues: { ":sub": userSub },
      ScanIndexForward: false,
      Limit: limit,
    })
    .promise();

  return response(200, { items: result.Items || [], count: (result.Items || []).length }, origin);
}

async function handleGetJob(event, origin, jobId) {
  const auth = await requireAuth(event, origin);
  if (auth.error) return auth.error;
  const { userSub } = auth;

  const result = await dynamo.get({ TableName: JOBS_TABLE, Key: { jobId } }).promise();
  const job = result.Item;
  if (!job) return response(404, { error: "not_found" }, origin);
  if (job.userSub !== userSub) return response(403, { error: "forbidden" }, origin);

  return response(200, job, origin);
}

async function handleGetDownload(event, origin, jobId) {
  const auth = await requireAuth(event, origin);
  if (auth.error) return auth.error;
  const { userSub } = auth;

  const result = await dynamo.get({ TableName: JOBS_TABLE, Key: { jobId } }).promise();
  const job = result.Item;
  if (!job) return response(404, { error: "not_found" }, origin);
  if (job.userSub !== userSub) return response(403, { error: "forbidden" }, origin);
  if (job.status !== "SUCCEEDED") {
    return response(409, { error: "job_not_ready", status: job.status }, origin);
  }

  const files = job.output?.files || [];
  const signedFiles = await Promise.all(
    files.map(async (file) => {
      const downloadUrl = await s3.getSignedUrlPromise("getObject", {
        Bucket: UPLOADS_BUCKET,
        Key: file.key,
        Expires: DOWNLOAD_URL_TTL,
      });
      return { name: file.name, contentType: file.contentType, downloadUrl };
    })
  );

  return response(200, { jobId, files: signedFiles }, origin);
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handler(event) {
  const origin = resolveAllowedOrigin(event);
  const method = (event.requestContext?.http?.method || "").toUpperCase();
  const path = event.requestContext?.http?.path || "";

  if (method === "OPTIONS") {
    return response(200, {}, origin);
  }

  try {
    if (method === "POST" && path === "/jobs") {
      return await handleCreateJob(event, origin);
    }

    if (method === "GET" && path === "/jobs") {
      return await handleListJobs(event, origin);
    }

    const jobMatch = path.match(/^\/jobs\/([^/]+)(\/download)?$/);
    if (jobMatch) {
      const jobId = decodeURIComponent(jobMatch[1]);
      const isDownload = Boolean(jobMatch[2]);

      if (method === "GET" && !isDownload) {
        return await handleGetJob(event, origin, jobId);
      }
      if (method === "GET" && isDownload) {
        return await handleGetDownload(event, origin, jobId);
      }
    }

    return response(404, { error: "not_found" }, origin);
  } catch (err) {
    console.error(JSON.stringify({ stage: "unhandled_error", message: err.message, stack: err.stack }));
    return response(500, { error: "internal_error" }, origin);
  }
}
