/**
 * System Health Check Lambda
 *
 * Two invocation modes:
 *   1. EventBridge Schedule (every 15 minutes) — runs all checks, sends an
 *      SES alert email if anything is non-OK (with a 30-minute cooldown
 *      enforced via a sentinel item in JobsTable).
 *   2. HTTP API GET /admin/health — same checks, requires a valid Cognito
 *      JWT belonging to an admin. The email/cooldown logic applies in this
 *      path too so manual refreshes don't bypass the alert throttle.
 *
 * The handler never throws — failing checks are normalised into the
 * structured per-check result so the dashboard can render them.
 */

import { createRequire } from "module";
import crypto from "crypto";

const require = createRequire(import.meta.url);
let AWS;
try {
  AWS = require("aws-sdk");
} catch (err) {
  if (globalThis.__AWS_SDK_MOCK__) {
    AWS = globalThis.__AWS_SDK_MOCK__;
  } else {
    throw err;
  }
}

const REGION = process.env.AWS_REGION || "eu-west-2";
const cloudwatch = new AWS.CloudWatch({ region: REGION });
const sqs = new AWS.SQS({ region: REGION });
const dynamo = new AWS.DynamoDB.DocumentClient({ region: REGION });
const ses = new AWS.SES({ region: REGION });

const STACK_NAME = (process.env.STACK_NAME || "ps-upload-api-prod").trim();
const JOBS_TABLE = (process.env.JOBS_TABLE || "").trim();
const PROCESS_QUEUE_URL = (process.env.PROCESS_QUEUE_URL || "").trim();
const PROCESS_DLQ_URL = (process.env.PROCESS_DLQ_URL || "").trim();

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY || "").trim();

const SES_SENDER_EMAIL = (process.env.SES_SENDER_EMAIL || "").trim();
const HEALTH_ALERT_EMAIL = (process.env.HEALTH_ALERT_EMAIL || "").trim();

const ADMIN_GROUP = "Admin";
const ADMIN_SUB_ALLOWLIST = new Set(
  (process.env.ADMIN_SUB_ALLOWLIST || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
);

const COOLDOWN_KEY = "HEALTH_CHECK_COOLDOWN";
const COOLDOWN_SECONDS = 30 * 60;
const LAMBDA_ERROR_WINDOW_MINUTES = 60;
const DYNAMO_ERROR_WINDOW_MINUTES = 60;
const BY_ELECTION_INVOCATION_WINDOW_HOURS = 25;
const PROCESS_QUEUE_AGE_WARN_SECONDS = 300;
const SUPABASE_PING_TIMEOUT_MS = 5000;

// Logical function names within the stack. The fully-qualified function name
// is "${StackName}-${LogicalId}" — the same convention SAM uses when a
// FunctionName isn't explicitly set.
const LAMBDA_ERROR_CHECKS = [
  "UploadFunction",
  "WorkerFunction",
  "UploadCompleteFunction",
  "ScanResultHandlerFunction",
  "PersonaFunction",
];

// ── JWT auth (replicated from handler.mjs so we don't share state) ───────────

const JWKS_CACHE_MS = 6 * 60 * 60 * 1000;
const jwksCache = { keys: null, fetchedAt: 0 };

function base64UrlToBuffer(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + "=".repeat(padding), "base64");
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

  let header;
  let payload;
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

function isAdminPayload(payload = {}) {
  const groupsClaim = payload?.["cognito:groups"];
  const groups = Array.isArray(groupsClaim)
    ? groupsClaim.map((entry) => entry?.toString?.().trim()).filter(Boolean)
    : typeof groupsClaim === "string"
      ? groupsClaim.split(",").map((entry) => entry.trim()).filter(Boolean)
      : [];
  if (groups.length > 0) return groups.includes(ADMIN_GROUP);

  const sub = (payload.sub || "").toString().trim();
  return Boolean(sub && ADMIN_SUB_ALLOWLIST.has(sub));
}

function getBearerToken(event) {
  const header = event?.headers?.authorization || event?.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

// ── Individual checks ────────────────────────────────────────────────────────

function ok(name, detail) {
  return { name, status: "ok", detail };
}
function warning(name, detail) {
  return { name, status: "warning", detail };
}
function critical(name, detail) {
  return { name, status: "critical", detail };
}

async function checkLambdaErrors(logicalName) {
  const functionName = `${STACK_NAME}-${logicalName}`;
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - LAMBDA_ERROR_WINDOW_MINUTES * 60 * 1000);
  const res = await cloudwatch
    .getMetricStatistics({
      Namespace: "AWS/Lambda",
      MetricName: "Errors",
      Dimensions: [{ Name: "FunctionName", Value: functionName }],
      StartTime: startTime,
      EndTime: endTime,
      Period: LAMBDA_ERROR_WINDOW_MINUTES * 60,
      Statistics: ["Sum"],
    })
    .promise();
  const sum = res?.Datapoints?.reduce((acc, dp) => acc + (dp.Sum || 0), 0) || 0;
  if (sum > 0) {
    return critical(logicalName, `${sum} Lambda error(s) in last ${LAMBDA_ERROR_WINDOW_MINUTES} min`);
  }
  return ok(logicalName, `0 errors in last ${LAMBDA_ERROR_WINDOW_MINUTES} min`);
}

async function checkLambdaLastInvocation(logicalName, windowHours) {
  const functionName = `${STACK_NAME}-${logicalName}`;
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - windowHours * 60 * 60 * 1000);
  const res = await cloudwatch
    .getMetricStatistics({
      Namespace: "AWS/Lambda",
      MetricName: "Invocations",
      Dimensions: [{ Name: "FunctionName", Value: functionName }],
      StartTime: startTime,
      EndTime: endTime,
      Period: windowHours * 60 * 60,
      Statistics: ["Sum"],
    })
    .promise();
  const sum = res?.Datapoints?.reduce((acc, dp) => acc + (dp.Sum || 0), 0) || 0;
  if (sum === 0) {
    return warning(logicalName, `0 invocations in last ${windowHours}h (expected daily run)`);
  }
  return ok(logicalName, `${sum} invocation(s) in last ${windowHours}h`);
}

async function checkProcessQueue() {
  if (!PROCESS_QUEUE_URL) return critical("ProcessQueue", "PROCESS_QUEUE_URL env var not set");
  const res = await sqs
    .getQueueAttributes({
      QueueUrl: PROCESS_QUEUE_URL,
      AttributeNames: [
        "ApproximateNumberOfMessagesNotVisible",
        "ApproximateNumberOfMessages",
        "ApproximateAgeOfOldestMessage",
      ],
    })
    .promise();
  const attrs = res?.Attributes || {};
  const inflight = Number(attrs.ApproximateNumberOfMessagesNotVisible || 0);
  const visible = Number(attrs.ApproximateNumberOfMessages || 0);
  const age = Number(attrs.ApproximateAgeOfOldestMessage || 0);
  if (age > PROCESS_QUEUE_AGE_WARN_SECONDS) {
    return warning(
      "ProcessQueue",
      `oldest message age ${age}s exceeds ${PROCESS_QUEUE_AGE_WARN_SECONDS}s (visible=${visible}, inflight=${inflight})`
    );
  }
  return ok("ProcessQueue", `visible=${visible}, inflight=${inflight}, oldest age=${age}s`);
}

async function checkProcessDlq() {
  if (!PROCESS_DLQ_URL) return critical("ProcessDLQ", "PROCESS_DLQ_URL env var not set");
  const res = await sqs
    .getQueueAttributes({
      QueueUrl: PROCESS_DLQ_URL,
      AttributeNames: ["ApproximateNumberOfMessages"],
    })
    .promise();
  const visible = Number(res?.Attributes?.ApproximateNumberOfMessages || 0);
  if (visible > 0) {
    return critical("ProcessDLQ", `${visible} message(s) in DLQ — permanent processing failure`);
  }
  return ok("ProcessDLQ", "0 messages visible");
}

async function checkDynamoSystemErrors() {
  if (!JOBS_TABLE) return critical("JobsTable", "JOBS_TABLE env var not set");
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - DYNAMO_ERROR_WINDOW_MINUTES * 60 * 1000);
  const res = await cloudwatch
    .getMetricStatistics({
      Namespace: "AWS/DynamoDB",
      MetricName: "SystemErrors",
      Dimensions: [{ Name: "TableName", Value: JOBS_TABLE }],
      StartTime: startTime,
      EndTime: endTime,
      Period: DYNAMO_ERROR_WINDOW_MINUTES * 60,
      Statistics: ["Sum"],
    })
    .promise();
  const sum = res?.Datapoints?.reduce((acc, dp) => acc + (dp.Sum || 0), 0) || 0;
  if (sum > 0) {
    return critical("JobsTable", `${sum} DynamoDB SystemError(s) in last ${DYNAMO_ERROR_WINDOW_MINUTES} min`);
  }
  return ok("JobsTable", `0 SystemErrors in last ${DYNAMO_ERROR_WINDOW_MINUTES} min`);
}

async function checkSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return critical("Supabase", "SUPABASE_URL or SUPABASE_SERVICE_KEY env var not set");
  }
  const url = `${SUPABASE_URL}/rest/v1/constituencies?select=id&limit=1`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      signal: AbortSignal.timeout(SUPABASE_PING_TIMEOUT_MS),
    });
    const elapsed = Date.now() - started;
    if (!res.ok) {
      return critical("Supabase", `REST ping HTTP ${res.status} after ${elapsed}ms`);
    }
    return ok("Supabase", `REST ping 200 in ${elapsed}ms`);
  } catch (err) {
    const elapsed = Date.now() - started;
    return critical("Supabase", `REST ping failed after ${elapsed}ms: ${err.message}`);
  }
}

// ── Cooldown + email ─────────────────────────────────────────────────────────

async function getCooldown() {
  if (!JOBS_TABLE) return null;
  try {
    const res = await dynamo.get({ TableName: JOBS_TABLE, Key: { jobId: COOLDOWN_KEY } }).promise();
    return res?.Item || null;
  } catch (err) {
    console.error(`[health-check] cooldown get failed: ${err.message}`);
    return null;
  }
}

async function setCooldown(nowSec) {
  if (!JOBS_TABLE) return;
  try {
    await dynamo
      .put({
        TableName: JOBS_TABLE,
        Item: {
          jobId: COOLDOWN_KEY,
          expiresAt: nowSec + COOLDOWN_SECONDS,
          lastAlertAt: new Date().toISOString(),
        },
      })
      .promise();
  } catch (err) {
    console.error(`[health-check] cooldown put failed: ${err.message}`);
  }
}

function buildEmail(overall, checks) {
  const failing = checks.filter((c) => c.status !== "ok");
  const subject = `[Political Solutions] System Health: ${overall.toUpperCase()} — ${failing.length} failing`;
  const lines = [
    `System health is ${overall.toUpperCase()} at ${new Date().toISOString()}.`,
    "",
    "Failing checks:",
    ...failing.map((c) => `  [${c.status.toUpperCase()}] ${c.name} — ${c.detail}`),
    "",
    "All checks:",
    ...checks.map((c) => `  [${c.status.toUpperCase()}] ${c.name} — ${c.detail}`),
    "",
    "Dashboard: https://www.politicalsolutions.uk/portal/admin/system-health",
  ];
  return { subject, body: lines.join("\n") };
}

async function sendAlertEmail(overall, checks) {
  if (!SES_SENDER_EMAIL || !HEALTH_ALERT_EMAIL) {
    console.error("[health-check] SES_SENDER_EMAIL or HEALTH_ALERT_EMAIL not set — skipping email");
    return false;
  }
  const { subject, body } = buildEmail(overall, checks);
  try {
    await ses
      .sendEmail({
        Source: SES_SENDER_EMAIL,
        Destination: { ToAddresses: [HEALTH_ALERT_EMAIL] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: { Text: { Data: body, Charset: "UTF-8" } },
        },
      })
      .promise();
    return true;
  } catch (err) {
    console.error(`[health-check] SES sendEmail failed: ${err.message}`);
    return false;
  }
}

// ── Composition ──────────────────────────────────────────────────────────────

function computeOverall(checks) {
  if (checks.some((c) => c.status === "critical")) return "critical";
  if (checks.some((c) => c.status === "warning")) return "warning";
  return "ok";
}

async function runChecks() {
  const tasks = [
    ...LAMBDA_ERROR_CHECKS.map((name) => [name, () => checkLambdaErrors(name)]),
    ["ByElectionMonitorFunction", () => checkLambdaLastInvocation("ByElectionMonitorFunction", BY_ELECTION_INVOCATION_WINDOW_HOURS)],
    ["ProcessQueue", () => checkProcessQueue()],
    ["ProcessDLQ", () => checkProcessDlq()],
    ["JobsTable", () => checkDynamoSystemErrors()],
    ["Supabase", () => checkSupabase()],
  ];

  const settled = await Promise.allSettled(tasks.map(([, fn]) => fn()));
  return settled.map((result, idx) => {
    if (result.status === "fulfilled") return result.value;
    const [name] = tasks[idx];
    return critical(name, `check threw: ${result.reason?.message || String(result.reason)}`);
  });
}

async function performHealthCheck() {
  const checkedAt = new Date().toISOString();
  console.log(`[health-check] running ${checkedAt}`);
  const checks = await runChecks();
  const overall = computeOverall(checks);

  let emailSent = false;
  let emailSkipped = false;
  let cooldownExpiresAt = null;

  if (overall !== "ok") {
    const nowSec = Math.floor(Date.now() / 1000);
    const existing = await getCooldown();
    if (existing && Number(existing.expiresAt) > nowSec) {
      emailSkipped = true;
      cooldownExpiresAt = new Date(Number(existing.expiresAt) * 1000).toISOString();
      console.log(`[health-check] overall=${overall} — within cooldown until ${cooldownExpiresAt}, skipping email`);
    } else {
      emailSent = await sendAlertEmail(overall, checks);
      if (emailSent) {
        await setCooldown(nowSec);
        cooldownExpiresAt = new Date((nowSec + COOLDOWN_SECONDS) * 1000).toISOString();
        console.log(`[health-check] overall=${overall} — alert email sent, cooldown until ${cooldownExpiresAt}`);
      }
    }
  } else {
    console.log("[health-check] overall=ok");
  }

  return {
    overall,
    checkedAt,
    checks,
    emailSent,
    emailSkipped,
    cooldownExpiresAt,
  };
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function getAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || "*";
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

function resolveAllowedOrigin(event) {
  const origins = getAllowedOrigins();
  if (origins.length === 0 || origins.includes("*")) return "*";
  const requestOrigin = event?.headers?.origin || event?.headers?.Origin || "";
  if (requestOrigin && origins.includes(requestOrigin)) return requestOrigin;
  return origins[0];
}

function httpResponse(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function isHttpEvent(event) {
  return Boolean(event?.requestContext?.http);
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function handler(event = {}) {
  if (!isHttpEvent(event)) {
    // EventBridge schedule (or manual {} test invocation)
    return await performHealthCheck();
  }

  const origin = resolveAllowedOrigin(event);
  const method = (event.requestContext?.http?.method || "").toUpperCase();
  if (method === "OPTIONS") return httpResponse(200, {}, origin);

  const issuer = (process.env.COGNITO_ISSUER || "").trim();
  const audience = (process.env.COGNITO_AUDIENCE || "").trim();
  if (!issuer || !audience) {
    return httpResponse(503, { error: "auth_not_configured" }, origin);
  }

  const token = getBearerToken(event);
  if (!token) return httpResponse(401, { error: "missing_token" }, origin);

  let payload;
  try {
    payload = await verifyJwt(token);
  } catch (err) {
    console.error(`[health-check] JWT verification threw: ${err.message}`);
    return httpResponse(401, { error: "token_verification_failed" }, origin);
  }
  if (!payload) return httpResponse(401, { error: "invalid_token" }, origin);
  if (!isAdminPayload(payload)) {
    return httpResponse(403, { code: "FORBIDDEN", message: "Admin access is required." }, origin);
  }

  try {
    const result = await performHealthCheck();
    return httpResponse(200, result, origin);
  } catch (err) {
    console.error(`[health-check] unexpected error: ${err.message}`);
    return httpResponse(500, { error: "internal_error", message: err.message }, origin);
  }
}
