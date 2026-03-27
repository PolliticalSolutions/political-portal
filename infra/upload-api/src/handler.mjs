import { createRequire } from "module";
import crypto from "crypto";
import { createUsersRepo } from "./usersRepo.mjs";
import { createGeoLookupRepo } from "./geoLookupRepo.mjs";
import { createElectionsRepo } from "./electionsRepo.mjs";
import { createSupabaseElectionsRepo, isSupabaseElectionsConfigured } from "./supabaseElectionsRepo.mjs";
import { createAuditRepo } from "./auditRepo.mjs";
import { createOrgsRepo } from "./orgsRepo.mjs";
import { createManualReviewRepo } from "./manualReviewRepo.mjs";
import { runDemocracyClubSync } from "./democracyClubSync.mjs";

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
const USERS_TABLE = process.env.USERS_TABLE || "";
const ELECTIONS_TABLE = process.env.ELECTIONS_TABLE || "";
const ORGANISATIONS_TABLE = process.env.ORGANISATIONS_TABLE || "";
const AUDIT_TABLE = process.env.AUDIT_TABLE || "";
const GEO_LOOKUP_TABLE = process.env.GEO_LOOKUP_TABLE || "";
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET || "";
const ADMIN_SUB_ALLOWLIST = new Set(
  (process.env.ADMIN_SUB_ALLOWLIST || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
);

const UPLOAD_URL_TTL = 900; // 15 minutes
const DOWNLOAD_URL_TTL = 900; // 15 minutes
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const JOB_TTL_SECONDS = 365 * 24 * 60 * 60;

const MAX_FILENAME = 255;
const MAX_CLIENT_NAME = 200;
const MAX_NOTES = 1000;
const MAX_ORG = 200;
const MAX_PCON = 32;
const MAX_WARD = 32;
const MAX_REASON = 500;
const MAX_REVIEW_NOTE = 2000;
const MIN_MANUAL_REVIEW_REASON = 10;
const MAX_ELECTION_ID = 120;
const MAX_ELECTION_NAME = 200;
const MAX_ELECTION_TYPE = 64;
const MAX_ELECTION_AUTHORITY = 120;
const VALID_FILE_TYPES = new Set(["pdf", "csv"]);
const FILE_TYPE_CONTENT_TYPES = {
  pdf: "application/pdf",
  csv: "text/csv",
};
const USER_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);
const ALLOWED_ORG_TYPES = new Set(["ASSOCIATION", "FEDERATION"]);
const ALLOWED_ELECTION_STATUSES = new Set(["UPCOMING", "OPEN", "CLOSED", "ARCHIVED"]);
const JOB_OPEN_ELECTION_STATUSES = ["UPCOMING", "OPEN"];
const OTHER_ELECTION_ID = "OTHER";
const ADMIN_GROUP = "Admin";

const usersRepo = USERS_TABLE ? createUsersRepo({ dynamo, tableName: USERS_TABLE }) : null;
const geoLookupRepo = GEO_LOOKUP_TABLE ? createGeoLookupRepo({ dynamo, tableName: GEO_LOOKUP_TABLE }) : null;
const electionsRepo = isSupabaseElectionsConfigured()
  ? createSupabaseElectionsRepo()
  : ELECTIONS_TABLE
    ? createElectionsRepo({ dynamo, tableName: ELECTIONS_TABLE })
    : null;
const orgsRepo = ORGANISATIONS_TABLE ? createOrgsRepo({ dynamo, tableName: ORGANISATIONS_TABLE }) : null;
const auditRepo = AUDIT_TABLE ? createAuditRepo({ dynamo, tableName: AUDIT_TABLE }) : null;
const manualReviewRepo = JOBS_TABLE ? createManualReviewRepo({ dynamo, tableName: JOBS_TABLE }) : null;

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
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function errorResponse(origin, httpStatus, code, message, extra = {}) {
  return response(httpStatus, { code, message, ...extra }, origin);
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

function ensureUsersRepo(origin) {
  if (!usersRepo) {
    return { error: errorResponse(origin, 500, "USERS_TABLE_NOT_CONFIGURED", "Users table is not configured.") };
  }
  return { usersRepo };
}

function ensureElectionsRepo(origin) {
  if (!electionsRepo) {
    return {
      error: errorResponse(origin, 500, "ELECTIONS_REPO_NOT_CONFIGURED", "Elections repo is not configured."),
    };
  }
  return { electionsRepo };
}

function ensureOrgsRepo(origin) {
  if (!orgsRepo) {
    return {
      error: errorResponse(
        origin,
        500,
        "ORGANISATIONS_TABLE_NOT_CONFIGURED",
        "Organisations table is not configured."
      ),
    };
  }
  return { orgsRepo };
}

function ensureManualReviewRepo(origin) {
  if (!manualReviewRepo) {
    return {
      error: errorResponse(origin, 500, "JOBS_TABLE_NOT_CONFIGURED", "Jobs table is not configured."),
    };
  }
  return { manualReviewRepo };
}

function normalizeStatus(value, fallback = "PENDING") {
  const normalized = (value || "").toString().trim().toUpperCase();
  if (!USER_STATUSES.has(normalized)) return fallback;
  return normalized;
}

function normalizeOrgType(value) {
  const normalized = (value || "").toString().trim().toUpperCase();
  if (!ALLOWED_ORG_TYPES.has(normalized)) return "";
  return normalized;
}

function normalizePconCodes(singleCode, multipleCodes) {
  const values = [];
  for (const candidate of [multipleCodes, singleCode]) {
    if (Array.isArray(candidate)) {
      values.push(...candidate);
      continue;
    }
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      values.push(
        ...candidate
          .toString()
          .split(",")
      );
    }
  }
  return Array.from(
    new Set(values.map((entry) => (entry || "").toString().trim().toUpperCase()).filter(Boolean))
  );
}

function normalizeElectionStatuses(value, fallback = ["UPCOMING", "OPEN"]) {
  const raw = Array.isArray(value)
    ? value
    : (value || "")
        .toString()
        .split(",");
  const statuses = raw
    .map((entry) => (entry || "").toString().trim().toUpperCase())
    .filter((entry) => ALLOWED_ELECTION_STATUSES.has(entry));
  return statuses.length > 0 ? statuses : fallback;
}

function normalizeWardCodes(value) {
  if (value === undefined || value === null) {
    return { ok: true, wardCodes: [], provided: false };
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: "wards must be an array of WD24CD values." };
  }

  const wardCodes = Array.from(
    new Set(
      value
        .map((entry) => sanitize(entry, MAX_WARD).toUpperCase())
        .filter(Boolean)
    )
  );
  return { ok: true, wardCodes, provided: true };
}

function getAdminIdentity(payload = {}) {
  return payload.email || payload["cognito:username"] || payload.sub || "";
}

function isAdminPayload(payload = {}) {
  const groupsClaim = payload?.["cognito:groups"];
  const groups = Array.isArray(groupsClaim)
    ? groupsClaim.map((entry) => entry?.toString?.().trim()).filter(Boolean)
    : typeof groupsClaim === "string"
      ? groupsClaim
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];
  if (groups.length > 0) {
    return groups.includes(ADMIN_GROUP);
  }

  const sub = (payload.sub || "").toString().trim();
  return Boolean(sub && ADMIN_SUB_ALLOWLIST.has(sub));
}

async function writeAuditSafe(payload) {
  if (!auditRepo) return;
  try {
    await auditRepo.writeAudit(payload);
  } catch (error) {
    console.error(
      JSON.stringify({ stage: "audit_write_failed", message: error?.message || "unknown_error", action: payload?.action })
    );
  }
}

function getEmailFromClaims(payload = {}) {
  const email = (payload?.email || "").toString().trim();
  if (email) return email;
  return (payload?.["cognito:username"] || "").toString().trim();
}

async function ensureUserRecord({ userSub, payload }) {
  const email = getEmailFromClaims(payload);
  const existing = await usersRepo.getUser(userSub);
  if (existing) {
    const existingEmail = (existing.email || "").toString().trim();
    if (!existingEmail && email) {
      const updated = await usersRepo.backfillEmailIfMissing({ userId: userSub, email });
      return updated || existing;
    }
    return existing;
  }

  const created = await usersRepo.putUserIfAbsent({
    userId: userSub,
    status: "APPROVED",
    email,
  });
  return created.item || null;
}

function approvalErrorForStatus(status, origin) {
  const normalized = normalizeStatus(status);

  if (normalized === "PENDING") {
    return errorResponse(origin, 403, "PENDING_APPROVAL", "Your account is pending approval.", {
      status: "PENDING",
    });
  }

  if (normalized === "REJECTED") {
    return errorResponse(origin, 403, "ACCOUNT_REJECTED", "Your account was rejected. Contact support.", {
      status: "REJECTED",
    });
  }

  return errorResponse(origin, 403, "ACCOUNT_NOT_APPROVED", "Your account is not approved for this action.", {
    status: normalized,
  });
}

async function requireApprovedUser({ event, origin }) {
  const auth = await requireAuth(event, origin);
  if (auth.error) return auth;

  const usersCheck = ensureUsersRepo(origin);
  if (usersCheck.error) return usersCheck;

  const user = await ensureUserRecord({ userSub: auth.userSub, payload: auth.payload });
  if (!user || normalizeStatus(user.status) !== "APPROVED") {
    return {
      ...auth,
      user,
      error: approvalErrorForStatus(user?.status || "PENDING", origin),
    };
  }

  return { ...auth, user };
}

async function requireAdmin(event, origin) {
  const auth = await requireAuth(event, origin);
  if (auth.error) return auth;

  if (!isAdminPayload(auth.payload)) {
    return {
      ...auth,
      error: errorResponse(origin, 403, "FORBIDDEN", "Admin access is required."),
    };
  }

  return auth;
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

function parseFileSize(value) {
  if (typeof value !== "number") return null;
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function slugify(value, maxLength = 60) {
  return (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

function buildGeneratedElectionId({ date, electionType, name, pconCodes }) {
  void date;
  void electionType;
  void name;
  void pconCodes;
  return crypto.randomUUID().slice(0, MAX_ELECTION_ID);
}

function normalizeElectionPayload(input = {}, { allowMissingElectionId = false } = {}) {
  const electionId = sanitize(input.electionId, MAX_ELECTION_ID);
  const name = sanitize(input.name, MAX_ELECTION_NAME);
  const date = sanitize(input.date, 20);
  const electionType = sanitize(input.electionType, MAX_ELECTION_TYPE).toUpperCase();
  const authority = sanitize(input.authority, MAX_ELECTION_AUTHORITY);
  const status = (input.status || "").toString().trim().toUpperCase();
  const pconCodes = Array.from(new Set(normalizePconCodes("", input.pconCodes)));

  if (!allowMissingElectionId && !electionId) {
    return { ok: false, code: "VALIDATION_ERROR", message: "electionId is required." };
  }
  if (!name) return { ok: false, code: "VALIDATION_ERROR", message: "name is required." };
  if (!date) return { ok: false, code: "VALIDATION_ERROR", message: "date is required." };
  if (!electionType) return { ok: false, code: "VALIDATION_ERROR", message: "electionType is required." };
  if (!ALLOWED_ELECTION_STATUSES.has(status)) {
    return { ok: false, code: "VALIDATION_ERROR", message: "status is invalid." };
  }
  if (pconCodes.length === 0) {
    return { ok: false, code: "VALIDATION_ERROR", message: "pconCodes must be a non-empty array." };
  }

  return {
    ok: true,
    election: {
      electionId: electionId || buildGeneratedElectionId({ date, electionType, name, pconCodes }),
      name,
      date,
      electionType,
      authority,
      status,
      pconCodes,
    },
  };
}

function createPresignedPost(params) {
  return new Promise((resolve, reject) => {
    s3.createPresignedPost(params, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });
}

function isGuardDutyScanEnabled() {
  return (process.env.ENABLE_GUARDDUTY_SCAN || "false").toLowerCase() === "true";
}

function shouldBypassScanWhenDisabled() {
  return (process.env.BYPASS_SCAN_WHEN_DISABLED || "false").toLowerCase() === "true";
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleCreateJob(event, origin) {
  const auth = await requireApprovedUser({ event, origin });
  if (auth.error) return auth.error;
  const { userSub, user } = auth;

  const body = parseBody(event);
  if (!body) {
    return response(400, { error: "invalid_json" }, origin);
  }

  const pconCode = sanitize(body.pconCode, MAX_PCON).toUpperCase();
  if (!pconCode) {
    return errorResponse(origin, 400, "PCON_REQUIRED", "pconCode is required.");
  }

  const allowedPconCodes = normalizePconCodes("", user?.allowedPconCodes);
  if (allowedPconCodes.length > 0 && !allowedPconCodes.includes(pconCode)) {
    return errorResponse(
      origin,
      403,
      "PCON_NOT_ALLOWED",
      "You are not allowed to submit for this constituency.",
      { pconCode }
    );
  }

  const rawElectionId = sanitize(body.electionId, MAX_ELECTION_ID);
  if (!rawElectionId) {
    return errorResponse(origin, 400, "ELECTION_REQUIRED", "electionId is required.");
  }
  const electionId = rawElectionId.toUpperCase() === OTHER_ELECTION_ID ? OTHER_ELECTION_ID : rawElectionId;
  const requiresManualReview = electionId === OTHER_ELECTION_ID;
  const manualReviewReason = sanitize(body.manualReviewReason, MAX_REASON);

  if (requiresManualReview && manualReviewReason.length < MIN_MANUAL_REVIEW_REASON) {
    return errorResponse(
      origin,
      400,
      "MANUAL_REVIEW_REASON_REQUIRED",
      `manualReviewReason must be at least ${MIN_MANUAL_REVIEW_REASON} characters when electionId is OTHER.`
    );
  }

  if (!requiresManualReview) {
    const electionsCheck = ensureElectionsRepo(origin);
    if (electionsCheck.error) return electionsCheck.error;

    const election = await electionsRepo.getElection(electionId);
    const electionStatuses = normalizeElectionStatuses(JOB_OPEN_ELECTION_STATUSES, JOB_OPEN_ELECTION_STATUSES);
    const isAllowedStatus = electionStatuses.includes((election?.status || "").toUpperCase());
    const electionPconCodes = normalizePconCodes("", election?.pconCodes);
    if (!election || !isAllowedStatus || !electionPconCodes.includes(pconCode)) {
      return errorResponse(
        origin,
        400,
        "ELECTION_NOT_ALLOWED",
        "electionId is not available for this constituency.",
        { electionId, pconCode }
      );
    }
  }

  const wardParse = normalizeWardCodes(body.wards);
  if (!wardParse.ok) {
    return errorResponse(origin, 400, "WARDS_INVALID", wardParse.error);
  }
  const wardCodes = wardParse.wardCodes;

  if (wardCodes.length > 0) {
    if (!geoLookupRepo) {
      return errorResponse(
        origin,
        500,
        "GEO_LOOKUP_NOT_CONFIGURED",
        "Ward validation is unavailable because GEO_LOOKUP_TABLE is not configured."
      );
    }
    const wardValidation = await geoLookupRepo.wardsBelongToPcon(wardCodes, pconCode);
    if (!wardValidation.ok) {
      return errorResponse(
        origin,
        400,
        "WARD_NOT_IN_PCON",
        "One or more wards do not belong to the selected constituency.",
        {
          details: {
            wardCode: wardValidation.invalidWardCodes[0] || "",
            pconCode,
            invalidWardCodes: wardValidation.invalidWardCodes,
          },
        }
      );
    }
  }

  const filename = sanitize(body.filename, MAX_FILENAME);
  const fileType = (body.fileType || "").toString().toLowerCase().trim();
  const size = parseFileSize(body.size);

  if (!filename) {
    return response(400, { error: "filename_required" }, origin);
  }
  if (!VALID_FILE_TYPES.has(fileType)) {
    return response(400, { error: "invalid_file_type", detail: "Must be pdf or csv." }, origin);
  }
  if (size === null) {
    return response(400, { error: "size_required", detail: "Provide file size in bytes." }, origin);
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    return response(400, { error: "file_too_large", detail: "Maximum allowed size is 200 MB." }, origin);
  }

  const clientName = sanitize(body.metadata?.clientName, MAX_CLIENT_NAME);
  const notes = sanitize(body.metadata?.notes, MAX_NOTES);
  const contentType = FILE_TYPE_CONTENT_TYPES[fileType];

  const jobId = crypto.randomUUID();
  const s3Key = `uploads/${userSub}/${jobId}/${filename}`;
  const now = new Date().toISOString();
  const expiresAt = Math.floor(Date.now() / 1000) + JOB_TTL_SECONDS;

  const item = {
    jobId,
    userSub,
    filename,
    fileType,
    expectedFileType: fileType,
    expectedSize: size,
    s3Key,
    status: "QUEUED",
    userId: userSub,
    orgId: user?.orgId || "",
    pconCode,
    electionId,
    requiresManualReview,
    ...(requiresManualReview ? { manualReviewReason } : {}),
    ...(requiresManualReview
      ? {
          manualReviewStatus: "OPEN",
          manualReviewKey: "MR#OPEN",
        }
      : {}),
    blocked: requiresManualReview,
    wardCodes,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    metadata: { clientName, notes },
  };
  if (!isGuardDutyScanEnabled() && shouldBypassScanWhenDisabled()) {
    item.scanResultStatus = "BYPASSED";
    item.scanUpdatedAt = now;
  }

  await dynamo.put({ TableName: JOBS_TABLE, Item: item }).promise();
  await writeAuditSafe({
    action: "JOB_CREATED",
    actor: { actorId: userSub, sub: userSub, email: auth.payload?.email || "" },
    target: { type: "JOB", targetKey: `JOB#${jobId}` },
    metadata: {
      jobId,
      userId: userSub,
      orgId: user?.orgId || "",
      pconCode,
      electionId,
      requiresManualReview,
      manualReviewReason: requiresManualReview ? manualReviewReason : "",
    },
  });

  const upload = await createPresignedPost({
    Bucket: UPLOADS_BUCKET,
    Expires: UPLOAD_URL_TTL,
    Fields: {
      key: s3Key,
      "Content-Type": contentType,
    },
    Conditions: [
      ["eq", "$key", s3Key],
      ["eq", "$Content-Type", contentType],
      ["content-length-range", 1, MAX_FILE_SIZE_BYTES],
    ],
  });

  return response(
    201,
    {
      jobId,
      s3Key,
      pconCode,
      electionId,
      requiresManualReview,
      ...(requiresManualReview ? { manualReviewReason } : {}),
      wardCodes,
      upload,
    },
    origin
  );
}

async function handleMe(event, origin) {
  const auth = await requireAuth(event, origin);
  if (auth.error) return auth.error;

  const usersCheck = ensureUsersRepo(origin);
  if (usersCheck.error) return usersCheck.error;

  const user = await ensureUserRecord({ userSub: auth.userSub, payload: auth.payload });
  return response(200, { user }, origin);
}

async function handleApply(event, origin) {
  const auth = await requireAuth(event, origin);
  if (auth.error) return auth.error;

  const usersCheck = ensureUsersRepo(origin);
  if (usersCheck.error) return usersCheck.error;
  const orgsCheck = ensureOrgsRepo(origin);
  if (orgsCheck.error) return orgsCheck.error;

  const body = parseBody(event);
  if (!body) {
    return errorResponse(origin, 400, "INVALID_JSON", "Invalid JSON body.");
  }

  const requestedOrgId = sanitize(body.requestedOrgId, MAX_ORG);
  const requestedPconCode = sanitize(body.requestedPconCode, MAX_PCON).toUpperCase();
  const requestedPconCodes = normalizePconCodes("", body.requestedPconCodes);

  if (!requestedOrgId) {
    return errorResponse(origin, 400, "VALIDATION_ERROR", "requestedOrgId is required.");
  }
  if (!requestedPconCode && requestedPconCodes.length === 0) {
    return errorResponse(
      origin,
      400,
      "VALIDATION_ERROR",
      "Either requestedPconCode or requestedPconCodes is required."
    );
  }

  const org = await orgsRepo.getOrganisation(requestedOrgId);
  if (!org) {
    return errorResponse(origin, 400, "ORG_NOT_FOUND", "requestedOrgId does not exist.");
  }
  if (!org.isActive) {
    return errorResponse(origin, 400, "ORG_INACTIVE", "requestedOrgId is inactive.");
  }

  const candidatePcons = requestedPconCodes.length > 0 ? requestedPconCodes : requestedPconCode ? [requestedPconCode] : [];
  if (org.pconCodes.length > 0) {
    const outOfScope = candidatePcons.find((code) => !org.pconCodes.includes(code));
    if (outOfScope) {
      return errorResponse(
        origin,
        400,
        "PCON_NOT_IN_ORG_SCOPE",
        "Requested constituency is outside organisation scope.",
        { pconCode: outOfScope }
      );
    }
  }

  const finalRequestedPconCodes = org.pconCodes.length > 0 ? org.pconCodes : candidatePcons;
  const finalRequestedPconCode =
    finalRequestedPconCodes.length === 1 ? finalRequestedPconCodes[0] : requestedPconCode || finalRequestedPconCodes[0] || "";

  const user = await ensureUserRecord({ userSub: auth.userSub, payload: auth.payload });
  const userStatus = normalizeStatus(user?.status || "PENDING");
  if (userStatus !== "PENDING") {
    return errorResponse(
      origin,
      403,
      "APPLICATION_LOCKED",
      "Application details can only be updated while status is PENDING.",
      { status: userStatus }
    );
  }

  const updated = await usersRepo.updateRequestedFields({
    userId: auth.userSub,
    requestedOrgId,
    requestedOrgType: org.orgType,
    requestedPconCode: finalRequestedPconCode,
    requestedPconCodes: finalRequestedPconCodes,
  });

  return response(200, { user: updated }, origin);
}

async function handleListOrganisations(event, origin) {
  const auth = await requireAuth(event, origin);
  if (auth.error) return auth.error;

  const orgsCheck = ensureOrgsRepo(origin);
  if (orgsCheck.error) return orgsCheck.error;

  const orgType = normalizeOrgType(event?.queryStringParameters?.orgType);
  if (!orgType) {
    return errorResponse(origin, 400, "VALIDATION_ERROR", "orgType query parameter is required.");
  }
  const active = parseBoolean(event?.queryStringParameters?.active, true);
  const limit = Math.min(200, Math.max(1, parseInt(event?.queryStringParameters?.limit, 10) || 100));
  const items = await orgsRepo.listOrganisations({ orgType, active, limit });
  return response(200, { orgType, active, count: items.length, items }, origin);
}

async function handleAdminListUsers(event, origin) {
  const auth = await requireAdmin(event, origin);
  if (auth.error) return auth.error;

  const usersCheck = ensureUsersRepo(origin);
  if (usersCheck.error) return usersCheck.error;

  const status = normalizeStatus(event?.queryStringParameters?.status || "PENDING");
  const limit = Math.min(100, Math.max(1, parseInt(event?.queryStringParameters?.limit, 10) || 50));
  const items = await usersRepo.listUsersByStatus(status, { limit });

  return response(200, { status, count: items.length, items }, origin);
}

async function handleAdminApproveUser(event, origin, userId) {
  const auth = await requireAdmin(event, origin);
  if (auth.error) return auth.error;

  const usersCheck = ensureUsersRepo(origin);
  if (usersCheck.error) return usersCheck.error;

  const body = parseBody(event);
  if (!body) {
    return errorResponse(origin, 400, "INVALID_JSON", "Invalid JSON body.");
  }

  const orgId = sanitize(body.orgId, MAX_ORG);
  const orgType = normalizeOrgType(body.orgType);
  const allowedPconCodes = normalizePconCodes("", body.allowedPconCodes);

  if (!orgId) {
    return errorResponse(origin, 400, "VALIDATION_ERROR", "orgId is required.");
  }
  if (allowedPconCodes.length === 0) {
    return errorResponse(origin, 400, "VALIDATION_ERROR", "allowedPconCodes must be a non-empty array.");
  }

  const existing = await usersRepo.getUser(userId);
  if (!existing) {
    return errorResponse(origin, 404, "NOT_FOUND", "User not found.");
  }

  const updated = await usersRepo.approveUser({
    userId,
    orgId,
    orgType,
    allowedPconCodes,
    approvedBy: getAdminIdentity(auth.payload),
  });
  await writeAuditSafe({
    action: "USER_APPROVED",
    actor: {
      actorId: auth.userSub,
      sub: auth.userSub,
      email: auth.payload?.email || "",
    },
    target: { type: "USER", targetKey: `USER#${userId}` },
    metadata: {
      before: {
        status: existing.status || "",
        orgId: existing.orgId || "",
        allowedPconCodes: existing.allowedPconCodes || [],
      },
      after: {
        status: updated.status || "",
        orgId: updated.orgId || "",
        allowedPconCodes: updated.allowedPconCodes || [],
      },
    },
  });

  return response(200, { user: updated }, origin);
}

async function handleAdminRejectUser(event, origin, userId) {
  const auth = await requireAdmin(event, origin);
  if (auth.error) return auth.error;

  const usersCheck = ensureUsersRepo(origin);
  if (usersCheck.error) return usersCheck.error;

  const body = parseBody(event);
  if (body === null) {
    return errorResponse(origin, 400, "INVALID_JSON", "Invalid JSON body.");
  }

  const existing = await usersRepo.getUser(userId);
  if (!existing) {
    return errorResponse(origin, 404, "NOT_FOUND", "User not found.");
  }

  const updated = await usersRepo.rejectUser({
    userId,
    rejectedBy: getAdminIdentity(auth.payload),
    reason: sanitize(body?.reason, MAX_REASON),
  });
  await writeAuditSafe({
    action: "USER_REJECTED",
    actor: {
      actorId: auth.userSub,
      sub: auth.userSub,
      email: auth.payload?.email || "",
    },
    target: { type: "USER", targetKey: `USER#${userId}` },
    metadata: {
      before: {
        status: existing.status || "",
      },
      after: {
        status: updated.status || "",
        rejectedReason: updated.rejectedReason || "",
      },
    },
  });

  return response(200, { user: updated }, origin);
}

async function handleListElections(event, origin) {
  const auth = await requireApprovedUser({ event, origin });
  if (auth.error) return auth.error;
  const { user } = auth;

  const electionsCheck = ensureElectionsRepo(origin);
  if (electionsCheck.error) return electionsCheck.error;

  const requestedPconCodes = normalizePconCodes(
    event?.queryStringParameters?.pconCode,
    event?.queryStringParameters?.pconCodes
  );
  const statuses = normalizeElectionStatuses(event?.queryStringParameters?.status, [...ALLOWED_ELECTION_STATUSES]);

  if (requestedPconCodes.length === 0) {
    const elections = await electionsRepo.listAllElections(statuses);
    return response(200, { statuses, items: elections }, origin);
  }

  const allowedPconCodes = normalizePconCodes("", user?.allowedPconCodes);
  const forbiddenPconCode =
    allowedPconCodes.length > 0
      ? requestedPconCodes.find((code) => !allowedPconCodes.includes(code))
      : "";
  if (forbiddenPconCode) {
    return errorResponse(origin, 403, "PCON_NOT_ALLOWED", "You are not allowed to access this constituency.", {
      pconCode: forbiddenPconCode,
    });
  }

  const elections = await electionsRepo.listElectionsByPcon(requestedPconCodes, statuses);
  return response(200, { pconCodes: requestedPconCodes, statuses, items: elections }, origin);
}

async function handleAdminSyncElections(event, origin) {
  const auth = await requireAdmin(event, origin);
  if (auth.error) return auth.error;

  const electionsCheck = ensureElectionsRepo(origin);
  if (electionsCheck.error) return electionsCheck.error;

  if (!isSupabaseElectionsConfigured()) {
    return errorResponse(
      origin,
      503,
      "SUPABASE_SYNC_NOT_CONFIGURED",
      "Supabase-backed election sync is not configured for this environment."
    );
  }

  const body = parseBody(event) || {};
  const dryRun = parseBoolean(body.dryRun, false);
  const monthsBack = Math.min(24, Math.max(1, parseInt(body.monthsBack, 10) || 6));
  const monthsForward = Math.min(24, Math.max(1, parseInt(body.monthsForward, 10) || 12));

  const result = await runDemocracyClubSync({
    electionsRepo,
    dryRun,
    monthsBack,
    monthsForward,
  });

  await writeAuditSafe({
    action: dryRun ? "ELECTION_SYNC_DRY_RUN" : "ELECTION_SYNC_RUN",
    actor: {
      actorId: auth.userSub,
      sub: auth.userSub,
      email: auth.payload?.email || "",
    },
    target: { type: "ELECTION_SYNC", targetKey: "DEMOCRACY_CLUB" },
    metadata: result,
  });

  return response(200, result, origin);
}

async function handleAdminCreateElection(event, origin) {
  const auth = await requireAdmin(event, origin);
  if (auth.error) return auth.error;

  const electionsCheck = ensureElectionsRepo(origin);
  if (electionsCheck.error) return electionsCheck.error;

  const body = parseBody(event);
  if (!body) {
    return errorResponse(origin, 400, "INVALID_JSON", "Invalid JSON body.");
  }

  const parsed = normalizeElectionPayload(body, { allowMissingElectionId: true });
  if (!parsed.ok) {
    return errorResponse(origin, 400, parsed.code, parsed.message);
  }

  const created = await electionsRepo.upsertElectionWithProjections(parsed.election);
  await writeAuditSafe({
    action: "ELECTION_CREATED",
    actor: {
      actorId: auth.userSub,
      sub: auth.userSub,
      email: auth.payload?.email || "",
    },
    target: { type: "ELECTION", targetKey: `ELECTION#${created.electionId}` },
    metadata: { after: created },
  });
  return response(201, { election: created }, origin);
}

async function handleAdminUpdateElection(event, origin, electionId) {
  const auth = await requireAdmin(event, origin);
  if (auth.error) return auth.error;

  const electionsCheck = ensureElectionsRepo(origin);
  if (electionsCheck.error) return electionsCheck.error;

  const existing = await electionsRepo.getElection(electionId);
  if (!existing) {
    return errorResponse(origin, 404, "NOT_FOUND", "Election not found.");
  }

  const body = parseBody(event);
  if (!body) {
    return errorResponse(origin, 400, "INVALID_JSON", "Invalid JSON body.");
  }

  const parsed = normalizeElectionPayload({ ...existing, ...body, electionId });
  if (!parsed.ok) {
    return errorResponse(origin, 400, parsed.code, parsed.message);
  }

  const updated = await electionsRepo.upsertElectionWithProjections(parsed.election);
  await writeAuditSafe({
    action: "ELECTION_UPDATED",
    actor: {
      actorId: auth.userSub,
      sub: auth.userSub,
      email: auth.payload?.email || "",
    },
    target: { type: "ELECTION", targetKey: `ELECTION#${electionId}` },
    metadata: {
      before: existing,
      after: updated,
    },
  });
  return response(200, { election: updated }, origin);
}

async function handleAdminArchiveElection(event, origin, electionId) {
  const auth = await requireAdmin(event, origin);
  if (auth.error) return auth.error;

  const electionsCheck = ensureElectionsRepo(origin);
  if (electionsCheck.error) return electionsCheck.error;

  const archived = await electionsRepo.archiveElection(electionId);
  if (!archived) {
    return errorResponse(origin, 404, "NOT_FOUND", "Election not found.");
  }
  await writeAuditSafe({
    action: "ELECTION_ARCHIVED",
    actor: {
      actorId: auth.userSub,
      sub: auth.userSub,
      email: auth.payload?.email || "",
    },
    target: { type: "ELECTION", targetKey: `ELECTION#${electionId}` },
    metadata: { after: archived },
  });
  return response(200, { election: archived }, origin);
}

async function handleAdminMe(event, origin) {
  const auth = await requireAdmin(event, origin);
  if (auth.error) return auth.error;
  return response(200, { isAdmin: true, sub: auth.userSub, email: auth.payload?.email || "" }, origin);
}

async function handleAdminListManualReviewJobs(event, origin) {
  const auth = await requireAdmin(event, origin);
  if (auth.error) return auth.error;

  const reviewCheck = ensureManualReviewRepo(origin);
  if (reviewCheck.error) return reviewCheck.error;

  const status = (event?.queryStringParameters?.status || "OPEN").toString().trim().toUpperCase();
  const limit = Math.min(100, Math.max(1, parseInt(event?.queryStringParameters?.limit, 10) || 50));
  const cursor = (event?.queryStringParameters?.cursor || "").toString();
  const result = await manualReviewRepo.listJobs({ status, limit, cursor });
  const items = (result.items || []).filter(
    (item) =>
      item.requiresManualReview === true &&
      (item.manualReviewStatus || "").toString().toUpperCase() !== "RESOLVED"
  );
  return response(200, { status, count: items.length, items, nextCursor: result.nextCursor || "" }, origin);
}

async function handleAdminGetManualReviewJob(event, origin, jobId) {
  const auth = await requireAdmin(event, origin);
  if (auth.error) return auth.error;

  const reviewCheck = ensureManualReviewRepo(origin);
  if (reviewCheck.error) return reviewCheck.error;

  const job = await manualReviewRepo.getJob(jobId);
  if (!job || !job.requiresManualReview) {
    return errorResponse(origin, 404, "NOT_FOUND", "Manual review job not found.");
  }
  return response(200, { job }, origin);
}

async function handleAdminResolveManualReviewJob(event, origin, jobId) {
  const auth = await requireAdmin(event, origin);
  if (auth.error) return auth.error;

  const reviewCheck = ensureManualReviewRepo(origin);
  if (reviewCheck.error) return reviewCheck.error;
  const electionsCheck = ensureElectionsRepo(origin);
  if (electionsCheck.error) return electionsCheck.error;

  const body = parseBody(event);
  if (!body) {
    return errorResponse(origin, 400, "INVALID_JSON", "Invalid JSON body.");
  }

  const decision = (body.decision || "").toString().trim().toUpperCase();
  const note = sanitize(body.note, MAX_REVIEW_NOTE);
  const correctedElectionId = sanitize(body.correctedElectionId, MAX_ELECTION_ID);
  if (!["APPROVE", "REJECT", "NEEDS_INFO"].includes(decision)) {
    return errorResponse(origin, 400, "VALIDATION_ERROR", "decision must be APPROVE, REJECT, or NEEDS_INFO.");
  }
  if (note.length < 10) {
    return errorResponse(origin, 400, "VALIDATION_ERROR", "note must be at least 10 characters.");
  }
  if (correctedElectionId && decision !== "APPROVE") {
    return errorResponse(origin, 400, "VALIDATION_ERROR", "correctedElectionId can only be set for APPROVE.");
  }
  if (correctedElectionId) {
    const election = await electionsRepo.getElection(correctedElectionId);
    if (!election) {
      return errorResponse(origin, 400, "VALIDATION_ERROR", "correctedElectionId not found.");
    }
  }

  const existing = await manualReviewRepo.getJob(jobId);
  if (!existing || !existing.requiresManualReview) {
    return errorResponse(origin, 404, "NOT_FOUND", "Manual review job not found.");
  }
  const resolved = await manualReviewRepo.resolveJob({
    jobId,
    decision,
    note,
    reviewedBy: auth.userSub,
    reviewedEmail: auth.payload?.email || "",
    correctedElectionId,
  });

  await writeAuditSafe({
    action: "MANUAL_REVIEW_RESOLVE",
    actor: { actorId: auth.userSub, sub: auth.userSub, email: auth.payload?.email || "" },
    target: { type: "JOB", targetKey: `JOB#${jobId}` },
    metadata: {
      decision,
      note,
      correctedElectionId: correctedElectionId || "",
      before: resolved.before || {},
      after: resolved.after || {},
    },
  });

  return response(200, { job: resolved.after }, origin);
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
    if (method === "GET" && path === "/me") {
      return await handleMe(event, origin);
    }

    if (method === "POST" && path === "/apply") {
      return await handleApply(event, origin);
    }

    if (method === "GET" && path === "/admin/users") {
      return await handleAdminListUsers(event, origin);
    }

    if (method === "GET" && path === "/elections") {
      return await handleListElections(event, origin);
    }

    if (method === "GET" && path === "/organisations") {
      return await handleListOrganisations(event, origin);
    }

    if (method === "POST" && path === "/admin/elections") {
      return await handleAdminCreateElection(event, origin);
    }

    if (method === "POST" && path === "/admin/elections/sync") {
      return await handleAdminSyncElections(event, origin);
    }

    if (method === "GET" && path === "/admin/me") {
      return await handleAdminMe(event, origin);
    }

    if (method === "GET" && path === "/admin/manual-review/jobs") {
      return await handleAdminListManualReviewJobs(event, origin);
    }

    const adminUserMatch = path.match(/^\/admin\/users\/([^/]+)\/(approve|reject)$/);
    if (adminUserMatch && method === "POST") {
      const userId = decodeURIComponent(adminUserMatch[1]);
      const action = adminUserMatch[2];
      if (action === "approve") {
        return await handleAdminApproveUser(event, origin, userId);
      }
      if (action === "reject") {
        return await handleAdminRejectUser(event, origin, userId);
      }
    }

    const adminElectionMatch = path.match(/^\/admin\/elections\/([^/]+)(\/archive)?$/);
    if (adminElectionMatch) {
      const electionId = decodeURIComponent(adminElectionMatch[1]);
      const archive = Boolean(adminElectionMatch[2]);
      if (method === "PUT" && !archive) {
        return await handleAdminUpdateElection(event, origin, electionId);
      }
      if (method === "POST" && archive) {
        return await handleAdminArchiveElection(event, origin, electionId);
      }
    }

    const manualReviewMatch = path.match(/^\/admin\/manual-review\/jobs\/([^/]+)(\/resolve)?$/);
    if (manualReviewMatch) {
      const jobId = decodeURIComponent(manualReviewMatch[1]);
      const resolvePath = Boolean(manualReviewMatch[2]);
      if (method === "GET" && !resolvePath) {
        return await handleAdminGetManualReviewJob(event, origin, jobId);
      }
      if (method === "POST" && resolvePath) {
        return await handleAdminResolveManualReviewJob(event, origin, jobId);
      }
    }

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
