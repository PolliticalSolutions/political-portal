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

const ses = new AWS.SES({ region: REGION });
const dynamo = new AWS.DynamoDB.DocumentClient({ region: REGION });
const ssm = new AWS.SSM({ region: REGION });

const MAX_MESSAGE = 2000;
const MAX_NAME = 100;
const MAX_EMAIL = 254;
const MAX_PHONE = 50;
const MAX_ORG = 200;
const MAX_ASSOCIATION = 200;
const MAX_PAGE_URL = 500;
const MAX_USER_AGENT = 300;
const MAX_CONTEXT = 4000;
const MAX_CUSTOMER_BODY = 4000;
const MAX_NOTES = 1000;
const MAX_REFERENCE = 80;
const MAX_LINE_NAME = 160;
const MAX_LINE_SKU = 80;
const MAX_BODY_BYTES = 100000;

const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 3;
const ipRateMap = new Map();

const COMPLIANCE_STATEMENT =
  "Subscriptions cover capability and readiness only. Election-specific work is separate and contracted independently.";

const XERO_AUTHORIZE_URL = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
const XERO_INVOICES_URL = "https://api.xero.com/api.xro/2.0/Invoices";
const XERO_CONTACTS_URL = "https://api.xero.com/api.xro/2.0/Contacts";
const XERO_SCOPES = [
  "offline_access",
  "accounting.transactions",
  "accounting.contacts",
  "accounting.settings",
].join(" ");

const JWKS_CACHE_MS = 6 * 60 * 60 * 1000;
const jwksCache = { keys: null, fetchedAt: 0 };

function clamp(value, max) {
  if (!value) return "";
  return value.toString().trim().slice(0, max);
}

function sanitizeText(value, max) {
  if (!value) return "";
  return clamp(value, max).replace(/[<>]/g, "");
}

function isValidEmail(value) {
  return typeof value === "string" && value.includes("@") && value.length <= MAX_EMAIL;
}

function formatCurrency(value) {
  const amount = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

function maskEmail(value) {
  if (!value || typeof value !== "string") return "";
  const [user, domain] = value.split("@");
  if (!domain) return "***";
  const safeUser = user ? `${user.slice(0, 1)}***` : "***";
  return `${safeUser}@${domain}`;
}

function escapeHtml(value) {
  if (!value) return "";
  return value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function logEvent(stage, data = {}) {
  const payload = {
    stage,
    ts: new Date().toISOString(),
    ...data,
  };
  console.log(JSON.stringify(payload));
}

function parseBodyBytes(event) {
  if (!event?.body) return 0;
  if (event.isBase64Encoded) {
    return Buffer.byteLength(event.body, "base64");
  }
  return Buffer.byteLength(event.body, "utf-8");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (attempt < retries && [429, 500, 502, 503, 504].includes(response.status)) {
        await sleep(250 * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(250 * (attempt + 1));
        continue;
      }
    }
  }
  throw lastError;
}

function getBearerToken(event) {
  const header = event?.headers?.authorization || event?.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice("Bearer ".length).trim();
}

function isAuthConfigured() {
  const issuer = (process.env.COGNITO_ISSUER || "").trim();
  const audience = (process.env.COGNITO_AUDIENCE || "").trim();
  return Boolean(issuer && audience);
}

function authNotConfiguredResponse(origin) {
  return response(
    503,
    { ok: false, error: "auth_not_configured", errorCode: "AUTH_NOT_CONFIGURED" },
    origin
  );
}

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
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`JWKS fetch failed (${response.status}).`);
  }
  const data = await response.json();
  jwksCache.keys = data?.keys || [];
  jwksCache.fetchedAt = now;
  return jwksCache.keys;
}

async function verifyJwt(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const header = JSON.parse(base64UrlToBuffer(parts[0]).toString("utf-8"));
  const payload = JSON.parse(base64UrlToBuffer(parts[1]).toString("utf-8"));
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
function getAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || "*";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolveAllowedOrigin(event) {
  const origins = getAllowedOrigins();
  if (origins.length === 0) return "*";
  if (origins.includes("*")) return "*";
  const requestOrigin = event?.headers?.origin || event?.headers?.Origin || "";
  if (requestOrigin && origins.includes(requestOrigin)) {
    return requestOrigin;
  }
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

function redirectResponse(location, origin) {
  return {
    statusCode: 302,
    headers: {
      Location: location,
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
    body: "",
  };
}

function stringifyContext(context) {
  if (!context || typeof context !== "object") return "";
  try {
    return JSON.stringify(context, null, 2).slice(0, MAX_CONTEXT);
  } catch {
    return "";
  }
}

function formatQuoteSummary(order) {
  if (!order || typeof order !== "object") return "";
  const lines = [
    "Your quote request has been received.",
    "",
    order.referenceId ? `Reference: ${order.referenceId}` : null,
    order.createdAt ? `Created: ${order.createdAt}` : null,
    "",
    "Requested items:",
  ];
  if (Array.isArray(order.items)) {
    for (const item of order.items) {
      if (item?.name) {
        const price = Number.isFinite(item.unitPrice)
          ? ` (${formatCurrency(item.unitPrice)} x ${item.quantity || 1})`
          : "";
        lines.push(`- ${item.name}${price}`);
      }
    }
  }
  if (order?.totals?.subtotalDisplay) {
    lines.push("", `Subtotal: ${order.totals.subtotalDisplay}`);
  }
  if (order?.compliance?.hasSubscriptions) {
    lines.push("", COMPLIANCE_STATEMENT);
  }
  lines.push("", "We will confirm the quote details by email shortly.");
  return clamp(lines.filter(Boolean).join("\n"), MAX_CUSTOMER_BODY);
}

function isTooLong(value, max) {
  if (!value) return false;
  return value.toString().trim().length > max;
}

function rateLimitHit(ip) {
  if (!ip) return false;
  const now = Date.now();
  const entry = ipRateMap.get(ip);
  if (!entry || now - entry.startMs > RATE_WINDOW_MS) {
    ipRateMap.set(ip, { startMs: now, count: 1 });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT) {
    return true;
  }
  return false;
}

function makeRequestId(context) {
  if (context?.awsRequestId) return context.awsRequestId;
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}`;
}

function parseJsonBody(event, origin) {
  if (!event?.body) {
    return { error: response(400, { ok: false, error: "Missing request body." }, origin) };
  }
  if (parseBodyBytes(event) > MAX_BODY_BYTES) {
    return { error: response(413, { ok: false, error: "payload_too_large" }, origin) };
  }
  try {
    return { payload: JSON.parse(event.body) };
  } catch {
    return { error: response(400, { ok: false, error: "Invalid JSON body." }, origin) };
  }
}

function resolvePath(event) {
  return event?.requestContext?.http?.path || event?.rawPath || event?.path || "";
}

function resolveMethod(event) {
  return event?.requestContext?.http?.method || event?.httpMethod || "";
}

async function requireAuth(event, origin) {
  if (!isAuthConfigured()) {
    return { error: authNotConfiguredResponse(origin), notConfigured: true };
  }
  try {
    const token = getBearerToken(event);
    const payload = await verifyJwt(token);
    if (!payload) {
      return { error: response(401, { ok: false, error: "unauthorized" }, origin) };
    }
    return { payload };
  } catch (error) {
    return { error: response(401, { ok: false, error: "unauthorized" }, origin) };
  }
}

function buildXeroState() {
  const secret = process.env.XERO_STATE_SECRET || "";
  const nonce = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now().toString();
  const payload = `${timestamp}.${nonce}`;
  if (!secret) return payload;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifyXeroState(state) {
  const secret = process.env.XERO_STATE_SECRET || "";
  if (!secret) return true;
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (expected !== parts[2]) return false;
  const ageMs = Date.now() - Number(parts[0]);
  return Number.isFinite(ageMs) && ageMs > 0 && ageMs < 10 * 60 * 1000;
}

async function loadXeroTokenInfo() {
  const paramName = process.env.XERO_TOKEN_PARAM_NAME;
  if (!paramName) return null;
  try {
    const result = await ssm
      .getParameter({ Name: paramName, WithDecryption: true })
      .promise();
    if (!result?.Parameter?.Value) return null;
    return JSON.parse(result.Parameter.Value);
  } catch (error) {
    if (error?.code === "ParameterNotFound") return null;
    throw error;
  }
}

async function saveXeroTokenInfo(info) {
  const paramName = process.env.XERO_TOKEN_PARAM_NAME;
  if (!paramName) return;
  await ssm
    .putParameter({
      Name: paramName,
      Value: JSON.stringify(info),
      Type: "SecureString",
      Overwrite: true,
    })
    .promise();
}

function hasXeroConfig() {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET && process.env.XERO_REDIRECT_URI);
}

function getXeroConfigStatus() {
  const missing = [];
  if (!process.env.XERO_CLIENT_ID) missing.push("XERO_CLIENT_ID");
  if (!process.env.XERO_CLIENT_SECRET) missing.push("XERO_CLIENT_SECRET");
  if (!process.env.XERO_REDIRECT_URI) missing.push("XERO_REDIRECT_URI");
  return { configured: missing.length === 0, missing };
}

function hasXeroInvoiceConfig() {
  return Boolean(process.env.XERO_SALES_ACCOUNT_CODE && process.env.XERO_TAX_TYPE);
}

function parseDueDays() {
  const raw = Number.parseInt(process.env.XERO_DUE_DAYS || "7", 10);
  if (!Number.isFinite(raw) || raw <= 0) return 7;
  return Math.min(raw, 30);
}

function isXeroEmailInvoiceEnabled() {
  return (process.env.XERO_EMAIL_INVOICE || "").toLowerCase() === "true";
}

function isXeroTestInvoiceEnabled() {
  return (process.env.XERO_TEST_INVOICE_ENABLED || "").toLowerCase() === "true";
}

async function refreshXeroToken(refreshToken) {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Xero OAuth configuration.");
  }
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetchWithRetry(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  }, 1);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xero token refresh failed (${response.status}): ${text}`);
  }
  return response.json();
}

async function exchangeXeroCode(code) {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Xero OAuth configuration.");
  }
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetchWithRetry(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  }, 1);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xero token exchange failed (${response.status}): ${text}`);
  }
  return response.json();
}

async function fetchXeroTenant(accessToken) {
  const response = await fetchWithRetry(XERO_CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }, 1);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xero tenant fetch failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No Xero tenant available.");
  }
  return data[0];
}

async function findXeroContact({ tenantId, accessToken, email }) {
  if (!email) return null;
  const filter = `EmailAddress=="${email}"`;
  const url = `${XERO_CONTACTS_URL}?where=${encodeURIComponent(filter)}`;
  const response = await fetchWithRetry(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": tenantId,
    },
  }, 1);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xero contact lookup failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  const contact = data?.Contacts?.[0];
  return contact || null;
}

async function createXeroContact({ tenantId, accessToken, customer }) {
  const payload = {
    Contacts: [
      {
        Name: sanitizeText(customer.organisation || customer.name, MAX_ORG),
        EmailAddress: customer.email,
        Phones: customer.phone
          ? [
              {
                PhoneType: "MOBILE",
                PhoneNumber: sanitizeText(customer.phone, MAX_PHONE),
              },
            ]
          : [],
      },
    ],
  };
  const response = await fetchWithRetry(XERO_CONTACTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": tenantId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }, 1);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xero contact create failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  return data?.Contacts?.[0] || null;
}

async function updateXeroContact({ tenantId, accessToken, contactId, customer }) {
  if (!contactId) return null;
  const payload = {
    Contacts: [
      {
        ContactID: contactId,
        Name: sanitizeText(customer.organisation || customer.name, MAX_ORG),
        Phones: customer.phone
          ? [
              {
                PhoneType: "MOBILE",
                PhoneNumber: sanitizeText(customer.phone, MAX_PHONE),
              },
            ]
          : [],
      },
    ],
  };
  const response = await fetchWithRetry(XERO_CONTACTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": tenantId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }, 1);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xero contact update failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  return data?.Contacts?.[0] || null;
}

function buildXeroLineDescription(item) {
  const area = item.areaName ? `Area: ${item.areaName}` : "";
  const compliance = item.complianceLabel ? item.complianceLabel : "";
  const invoiceNote = item.invoiceDescription ? item.invoiceDescription : "";
  if (item.category === "subscription") {
    const tierName = item.name?.replace(/subscription/i, "").trim() || "Subscription";
    const periodLabel = item.billingPeriod === "annual" ? "Annual" : "Monthly";
    const base = `Campaign Readiness Subscription - ${tierName} (${periodLabel}) - first period`;
    return sanitizeText([base, area, compliance || invoiceNote].filter(Boolean).join(" | "), 400);
  }
  const base = item.name || "One-off";
  return sanitizeText([base, area].filter(Boolean).join(" | "), 400);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

async function emailXeroInvoice({ tenantId, accessToken, invoiceId }) {
  const url = `${XERO_INVOICES_URL}/${invoiceId}/Email`;
  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "xero-tenant-id": tenantId,
      },
    },
    1
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xero invoice email failed (${response.status}): ${text}`);
  }
}

async function createXeroInvoice({ tenantId, accessToken, customer, items, referenceId }) {
  const accountCode = process.env.XERO_SALES_ACCOUNT_CODE || "";
  const taxType = process.env.XERO_TAX_TYPE || "";
  if (!accountCode || !taxType) {
    throw new Error("Missing Xero sales account or tax type configuration.");
  }
  const status = process.env.XERO_INVOICE_STATUS || "DRAFT";
  const now = new Date();
  const dueDate = addDays(now, parseDueDays());

  const lineItems = items.map((item) => ({
    Description: buildXeroLineDescription(item),
    Quantity: item.quantity || 1,
    UnitAmount: Number(item.unitPrice) || 0,
    AccountCode: accountCode,
    TaxType: taxType,
  }));

  let contact = await findXeroContact({ tenantId, accessToken, email: customer.email });
  if (contact?.ContactID) {
    logEvent("xero.contact_found", { contactId: contact.ContactID });
    const needsNameUpdate =
      customer.organisation &&
      contact.Name &&
      customer.organisation.trim() !== contact.Name.trim();
    const needsPhoneUpdate = customer.phone && !contact.Phones?.length;
    if (needsNameUpdate || needsPhoneUpdate) {
      contact = await updateXeroContact({
        tenantId,
        accessToken,
        contactId: contact.ContactID,
        customer,
      });
      if (contact?.ContactID) {
        logEvent("xero.contact_updated", { contactId: contact.ContactID });
      }
    }
  } else {
    contact = await createXeroContact({ tenantId, accessToken, customer });
    if (contact?.ContactID) {
      logEvent("xero.contact_created", { contactId: contact.ContactID });
    }
  }

  const payload = {
    Invoices: [
      {
        Type: "ACCREC",
        Contact: contact?.ContactID
          ? { ContactID: contact.ContactID }
          : {
              Name: sanitizeText(customer.organisation || customer.name, MAX_ORG),
              EmailAddress: customer.email,
            },
        LineItems: lineItems,
        Date: now.toISOString().slice(0, 10),
        DueDate: dueDate.toISOString().slice(0, 10),
        CurrencyCode: "GBP",
        Status: status,
        Reference: referenceId,
      },
    ],
  };

  const response = await fetchWithRetry(
    XERO_INVOICES_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "xero-tenant-id": tenantId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    1
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Xero invoice create failed (${response.status}): ${text}`);
  }
  const data = await response.json();
  const invoice = data?.Invoices?.[0];
  if (!invoice) {
    throw new Error("Xero invoice response missing data.");
  }

  let invoiceEmailSent = false;
  if (isXeroEmailInvoiceEnabled() && invoice.InvoiceID) {
    try {
      await emailXeroInvoice({ tenantId, accessToken, invoiceId: invoice.InvoiceID });
      invoiceEmailSent = true;
    } catch (error) {
      logEvent("xero.invoice_email_failed", { referenceId, error: error?.message || "failed" });
    }
  }

  return {
    invoiceId: invoice.InvoiceID,
    invoiceNumber: invoice.InvoiceNumber || "",
    status: invoice.Status || "",
    contactId: contact?.ContactID || "",
    invoiceEmailSent,
  };
}

function sanitizeLineItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const category = item.category === "subscription" ? "subscription" : "oneOff";
      const quantity = Number.isFinite(item.quantity) ? Math.max(1, Math.floor(item.quantity)) : 1;
      const unitPrice = Number.isFinite(item.unitPrice) ? Math.max(0, item.unitPrice) : 0;
      return {
        sku: sanitizeText(item.sku || item.productId || "", MAX_LINE_SKU),
        name: sanitizeText(item.name || "", MAX_LINE_NAME),
        category,
        quantity,
        areaId: sanitizeText(item.areaId || "", MAX_ASSOCIATION),
        areaName: sanitizeText(item.areaName || "", MAX_ASSOCIATION),
        billingPeriod: sanitizeText(item.billingPeriod || "", 20),
        unitPrice,
        priceDisplay: sanitizeText(item.priceDisplay || "", 40),
        complianceLabel:
          category === "subscription" ? sanitizeText(item.complianceLabel || "", 200) : "",
        invoiceDescription:
          category === "subscription" ? sanitizeText(item.invoiceDescription || "", 500) : "",
      };
    })
    .filter((item) => item && item.sku && item.name);
}

function computeTotals(items) {
  return items.reduce(
    (totals, item) => {
      const lineTotal = item.unitPrice * (item.quantity || 1);
      if (item.category === "subscription") {
        totals.subscriptionSubtotal += lineTotal;
      } else {
        totals.oneOffSubtotal += lineTotal;
      }
      totals.subtotal += lineTotal;
      return totals;
    },
    { subscriptionSubtotal: 0, oneOffSubtotal: 0, subtotal: 0 }
  );
}

function applyTtl(record) {
  if ((process.env.QUOTE_TTL_ENABLED || "").toLowerCase() !== "true") return record;
  const days = Number.parseInt(process.env.QUOTE_TTL_DAYS || "90", 10);
  const ttlDays = Number.isFinite(days) && days > 0 ? days : 90;
  const ttlSeconds = Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60;
  return { ...record, ttl: ttlSeconds };
}

async function handleEnquiryPost(event, context, origin) {
  const sourceIp = event?.requestContext?.http?.sourceIp || "";
  if (rateLimitHit(sourceIp)) {
    return {
      statusCode: 429,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Retry-After": "60",
      },
      body: JSON.stringify({
        ok: false,
        error: "too_many_requests",
        message: "Please wait a minute and try again.",
      }),
    };
  }

  const { payload, error } = parseJsonBody(event, origin);
  if (error) return error;

  const name = clamp(payload.name, MAX_NAME);
  const email = clamp(payload.email, MAX_EMAIL);
  const organisation = clamp(payload.organisation, MAX_ORG);
  const phone = clamp(payload.phone, MAX_PHONE);
  const message = clamp(payload.message, MAX_MESSAGE);
  const pageUrl = clamp(payload.pageUrl, MAX_PAGE_URL);
  const userAgent = clamp(payload.userAgent, MAX_USER_AGENT);
  const timestampIso = clamp(payload.timestampIso, 50);
  const contextText = stringifyContext(payload.context);

  if (isTooLong(payload.name, MAX_NAME)) {
    return response(400, { ok: false, error: "validation_error", message: "Name is too long." }, origin);
  }
  if (isTooLong(payload.email, MAX_EMAIL)) {
    return response(400, { ok: false, error: "validation_error", message: "Email is too long." }, origin);
  }
  if (isTooLong(payload.phone, MAX_PHONE)) {
    return response(400, { ok: false, error: "validation_error", message: "Phone is too long." }, origin);
  }
  if (isTooLong(payload.organisation, MAX_ORG)) {
    return response(
      400,
      { ok: false, error: "validation_error", message: "Organisation is too long." },
      origin
    );
  }
  if (isTooLong(payload.message, MAX_MESSAGE)) {
    return response(
      400,
      { ok: false, error: "validation_error", message: "Message is too long." },
      origin
    );
  }
  if (payload?.context) {
    if (isTooLong(payload.context.association, MAX_ASSOCIATION)) {
      return response(
        400,
        { ok: false, error: "validation_error", message: "Association is too long." },
        origin
      );
    }
    if (isTooLong(payload.context.federation, MAX_ASSOCIATION)) {
      return response(
        400,
        { ok: false, error: "validation_error", message: "Federation is too long." },
        origin
      );
    }
    if (isTooLong(payload.context.constituency, MAX_ASSOCIATION)) {
      return response(
        400,
        { ok: false, error: "validation_error", message: "Constituency is too long." },
        origin
      );
    }
    if (Array.isArray(payload.context.constituencies)) {
      for (const item of payload.context.constituencies) {
        if (isTooLong(item, MAX_ASSOCIATION)) {
          return response(
            400,
            { ok: false, error: "validation_error", message: "Constituency is too long." },
            origin
          );
        }
      }
    }
  }

  if (!name) {
    return response(400, { ok: false, error: "validation_error", message: "Name is required." }, origin);
  }
  if (!email || !isValidEmail(email)) {
    return response(
      400,
      { ok: false, error: "validation_error", message: "Valid email is required." },
      origin
    );
  }
  if (!message) {
    return response(
      400,
      { ok: false, error: "validation_error", message: "Message is required." },
      origin
    );
  }

  const honeypotValue = (payload.website || payload.companyWebsite || "").toString().trim();
  if (honeypotValue) {
    const requestId = makeRequestId(context);
    return response(200, { ok: true, requestId }, origin);
  }

  const toEmail = process.env.TO_EMAIL;
  const fromEmail = process.env.FROM_EMAIL;
  if (!fromEmail || !toEmail) {
    return response(500, { ok: false, error: "server_error", message: "Please try again later" }, origin);
  }

  const emailBody = [
    "New enquiry received",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    organisation ? `Organisation: ${organisation}` : null,
    "",
    "Message:",
    message,
    contextText ? "" : null,
    contextText ? "Context:" : null,
    contextText || null,
    pageUrl ? "" : null,
    pageUrl ? `Page: ${pageUrl}` : null,
    userAgent ? `User agent: ${userAgent}` : null,
    timestampIso ? `Timestamp: ${timestampIso}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const subject = `Political Solutions enquiry - ${name}${organisation ? ` / ${organisation}` : ""}`;

  await ses
    .sendEmail({
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Body: { Text: { Data: emailBody } },
        Subject: { Data: subject },
      },
      Source: fromEmail,
      ReplyToAddresses: [email],
    })
    .promise();

  if (payload?.context?.requestType === "quote_request") {
    const customerBody = formatQuoteSummary(payload.context.order);
    if (customerBody) {
      await ses
        .sendEmail({
          Destination: { ToAddresses: [email] },
          Message: {
            Body: { Text: { Data: customerBody } },
            Subject: {
              Data: `Political Solutions quote request received${
                payload.context.order?.referenceId ? ` - ${payload.context.order.referenceId}` : ""
              }`,
            },
          },
          Source: fromEmail,
        })
        .promise();
    }
  }

  const requestId = makeRequestId(context);
  return response(200, { ok: true, requestId }, origin);
}

async function handleQuoteRequestPost(event, origin) {
  const sourceIp = event?.requestContext?.http?.sourceIp || "";
  if (rateLimitHit(sourceIp)) {
    return response(
      429,
      { ok: false, error: "too_many_requests", message: "Please wait a minute and try again." },
      origin
    );
  }

  const { payload, error } = parseJsonBody(event, origin);
  if (error) return error;

  const idempotencyKey = sanitizeText(payload.idempotencyKey || "", MAX_REFERENCE);
  if (!idempotencyKey) {
    return response(
      400,
      { ok: false, error: "validation_error", message: "Missing idempotency key." },
      origin
    );
  }

  logEvent("quote.received", { idempotencyKey });

  const idempotencyTable = process.env.IDEMPOTENCY_TABLE;
  const quoteTable = process.env.QUOTE_REQUESTS_TABLE;
  if (!idempotencyTable || !quoteTable) {
    return response(
      500,
      { ok: false, error: "server_error", message: "Quote storage is not configured." },
      origin
    );
  }

  const existing = await dynamo
    .get({
      TableName: idempotencyTable,
      Key: { idempotencyKey },
    })
    .promise();
  if (existing?.Item?.referenceId) {
    logEvent("quote.idempotency_hit", { idempotencyKey, referenceId: existing.Item.referenceId });
    const stored = await dynamo
      .get({
        TableName: quoteTable,
        Key: { referenceId: existing.Item.referenceId },
      })
      .promise();
    if (stored?.Item) {
      return response(200, { ok: true, ...sanitizeQuoteResponse(stored.Item) }, origin);
    }
    return response(
      202,
      { ok: true, referenceId: existing.Item.referenceId, status: "processing" },
      origin
    );
  }

  logEvent("quote.idempotency_miss", { idempotencyKey });

  const customer = payload.customer || {};
  const customerName = sanitizeText(customer.fullName || customer.name || "", MAX_NAME);
  const customerEmail = sanitizeText(customer.email || "", MAX_EMAIL);
  const customerPhone = sanitizeText(customer.phone || "", MAX_PHONE);
  const customerOrganisation = sanitizeText(customer.organisation || "", MAX_ORG);
  const customerRole = sanitizeText(customer.role || "", 60);
  const notes = sanitizeText(payload.notes || "", MAX_NOTES);
  const complianceAcknowledged = Boolean(payload.complianceAcknowledged);
  const createInvoice = Boolean(payload.createInvoice);

  const fromEmail = process.env.FROM_EMAIL;
  const opsEmail = process.env.OPS_EMAIL_TO || process.env.TO_EMAIL;
  if (!fromEmail || !opsEmail) {
    logEvent("quote.config_error", { idempotencyKey, error: "missing_email_config" });
    return response(
      500,
      { ok: false, error: "server_error", message: "Email configuration missing." },
      origin
    );
  }

  if (!customerName) {
    return response(400, { ok: false, error: "validation_error", message: "Name is required." }, origin);
  }
  if (!customerEmail || !isValidEmail(customerEmail)) {
    return response(
      400,
      { ok: false, error: "validation_error", message: "Valid email is required." },
      origin
    );
  }
  if (!customerOrganisation) {
    return response(
      400,
      { ok: false, error: "validation_error", message: "Organisation is required." },
      origin
    );
  }
  if (!customerRole) {
    return response(400, { ok: false, error: "validation_error", message: "Role is required." }, origin);
  }
  if (isTooLong(payload.notes, MAX_NOTES)) {
    return response(
      400,
      { ok: false, error: "validation_error", message: "Notes are too long." },
      origin
    );
  }

  const lineItems = sanitizeLineItems(payload.lineItems);
  if (lineItems.length === 0) {
    return response(
      400,
      { ok: false, error: "validation_error", message: "At least one line item is required." },
      origin
    );
  }

  const totals = computeTotals(lineItems);
  const hasSubscriptions = lineItems.some((item) => item.category === "subscription");

  logEvent("quote.validated", {
    idempotencyKey,
    items: lineItems.length,
    hasSubscriptions,
  });
  if (hasSubscriptions && !complianceAcknowledged) {
    return response(
      400,
      { ok: false, error: "validation_error", message: "Compliance acknowledgement is required." },
      origin
    );
  }

  const referenceId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const baseRecord = {
    referenceId,
    idempotencyKey,
    createdAt,
    customer: {
      name: customerName,
      email: customerEmail,
      phone: customerPhone,
      organisation: customerOrganisation,
      role: customerRole,
    },
    notes,
    items: lineItems.map((item) =>
      item.category === "subscription"
        ? {
            ...item,
            complianceLabel: item.complianceLabel || "Capability subscription (not election-specific)",
            invoiceDescription: item.invoiceDescription || "",
          }
        : { ...item, complianceLabel: "", invoiceDescription: "" }
    ),
    totals: {
      ...totals,
      subtotalDisplay: formatCurrency(totals.subtotal),
    },
    compliance: {
      hasSubscriptions,
      acknowledged: complianceAcknowledged,
      statement: COMPLIANCE_STATEMENT,
    },
    status: createInvoice ? "pending-invoice" : "received",
    xero: {
      requested: createInvoice,
      connected: false,
      created: false,
      invoiceId: "",
      invoiceNumber: "",
      status: "",
      error: "",
      errorCode: "",
      contactId: "",
      invoiceEmailSent: false,
    },
  };
  const recordToWrite = applyTtl(baseRecord);
  const idempotencyRecord = applyTtl({ idempotencyKey, referenceId, createdAt });

  try {
    await dynamo
      .transactWrite({
        TransactItems: [
          {
            Put: {
              TableName: idempotencyTable,
              Item: idempotencyRecord,
              ConditionExpression: "attribute_not_exists(idempotencyKey)",
            },
          },
          {
            Put: {
              TableName: quoteTable,
              Item: recordToWrite,
              ConditionExpression: "attribute_not_exists(referenceId)",
            },
          },
        ],
      })
      .promise();
    logEvent("quote.stored", { referenceId, idempotencyKey });
  } catch (error) {
    if (error?.code === "ConditionalCheckFailedException") {
      const stored = await dynamo
        .get({ TableName: idempotencyTable, Key: { idempotencyKey } })
        .promise();
      if (stored?.Item?.referenceId) {
        logEvent("quote.idempotency_conflict", {
          idempotencyKey,
          referenceId: stored.Item.referenceId,
        });
        const existingRecord = await dynamo
          .get({ TableName: quoteTable, Key: { referenceId: stored.Item.referenceId } })
          .promise();
        if (existingRecord?.Item) {
          return response(200, { ok: true, ...sanitizeQuoteResponse(existingRecord.Item) }, origin);
        }
      }
      return response(
        409,
        { ok: false, error: "conflict", message: "Request already in progress." },
        origin
      );
    }
    throw error;
  }

  const xeroInfo = await loadXeroTokenInfo();
  const xeroConnected = Boolean(xeroInfo?.refresh_token && xeroInfo?.tenant_id);
  let xeroResult = {
    connected: xeroConnected,
    created: false,
    invoiceId: "",
    invoiceNumber: "",
    status: "",
    error: "",
    errorCode: "",
    contactId: "",
    invoiceEmailSent: false,
  };

  logEvent("xero.status", { referenceId, connected: xeroConnected });

  if (createInvoice && !xeroConnected) {
    xeroResult = {
      ...xeroResult,
      error: "Xero is not connected.",
      errorCode: "XERO_NOT_CONNECTED",
    };
    logEvent("xero.not_connected", { referenceId });
  }

  if (createInvoice && xeroConnected && !hasXeroInvoiceConfig()) {
    xeroResult = {
      ...xeroResult,
      error: "Xero invoice configuration is missing.",
      errorCode: "XERO_CONFIG_MISSING",
    };
    logEvent("xero.config_missing", { referenceId });
  }

  if (createInvoice && xeroConnected && hasXeroInvoiceConfig()) {
    try {
      const refreshed = await refreshXeroToken(xeroInfo.refresh_token);
      const accessToken = refreshed.access_token;
      const updatedInfo = {
        refresh_token: refreshed.refresh_token || xeroInfo.refresh_token,
        tenant_id: xeroInfo.tenant_id,
        tenant_name: xeroInfo.tenant_name || "",
        connected_at: xeroInfo.connected_at || new Date().toISOString(),
      };
      await saveXeroTokenInfo(updatedInfo);

      const invoice = await createXeroInvoice({
        tenantId: xeroInfo.tenant_id,
        accessToken,
        customer: baseRecord.customer,
        items: baseRecord.items,
        referenceId,
      });
      xeroResult = {
        connected: true,
        created: Boolean(invoice.invoiceId),
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        error: "",
        errorCode: "",
        contactId: invoice.contactId || "",
        invoiceEmailSent: Boolean(invoice.invoiceEmailSent),
      };
      logEvent("xero.invoice_created", {
        referenceId,
        invoiceId: invoice.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
      });
    } catch (error) {
      xeroResult = {
        connected: true,
        created: false,
        invoiceId: "",
        invoiceNumber: "",
        status: "",
        error: sanitizeText(error?.message || "Invoice creation failed.", 200),
        errorCode: "XERO_INVOICE_FAILED",
        contactId: "",
        invoiceEmailSent: false,
      };
      logEvent("xero.invoice_failed", {
        referenceId,
        error: xeroResult.error,
      });
    }
  }

  const updatedRecord = {
    ...baseRecord,
    ...(recordToWrite.ttl ? { ttl: recordToWrite.ttl } : {}),
    status:
      createInvoice && xeroResult.invoiceId
        ? "invoice-created"
        : createInvoice
          ? "invoice-failed"
          : "received",
    xero: {
      ...baseRecord.xero,
      connected: xeroConnected,
      created: xeroResult.created || false,
      invoiceId: xeroResult.invoiceId || "",
      invoiceNumber: xeroResult.invoiceNumber || "",
      status: xeroResult.status || "",
      error: xeroResult.error || "",
      errorCode: xeroResult.errorCode || "",
      contactId: xeroResult.contactId || "",
      invoiceEmailSent: xeroResult.invoiceEmailSent || false,
    },
  };

  await dynamo
    .put({
      TableName: quoteTable,
      Item: updatedRecord,
    })
    .promise();

  logEvent("quote.updated", { referenceId });

  await sendQuoteEmails(updatedRecord);

  return response(200, { ok: true, ...sanitizeQuoteResponse(updatedRecord) }, origin);
}

function sanitizeQuoteResponse(record) {
  return {
    referenceId: record.referenceId,
    createdAt: record.createdAt,
    items: Array.isArray(record.items) ? record.items : [],
    totals: record.totals,
    compliance: record.compliance,
    xero: {
      connected: Boolean(record.xero?.connected),
      requested: Boolean(record.xero?.requested),
      created: Boolean(record.xero?.created),
      invoiceId: record.xero?.invoiceId || "",
      invoiceNumber: record.xero?.invoiceNumber || "",
      status: record.xero?.status || "",
      errorCode: record.xero?.errorCode || "",
    },
  };
}

async function sendQuoteEmails(record) {
  const fromEmail = process.env.FROM_EMAIL;
  const opsEmail = process.env.OPS_EMAIL_TO || process.env.TO_EMAIL;
  if (!fromEmail || !opsEmail) return;

  const customer = record.customer || {};
  const itemLines = (record.items || []).map((item) => {
    const area = item.areaName ? ` / ${item.areaName}` : "";
    const price = Number.isFinite(item.unitPrice)
      ? `${formatCurrency(item.unitPrice)} x ${item.quantity || 1}`
      : "";
    return `- ${item.name}${area} ${price}`.trim();
  });

  const invoiceNote = record.xero?.created
    ? "Invoice created in Xero. Send invoice email or confirm online payments enabled."
    : record.xero?.requested
      ? "Invoice requested but not created. Follow up and issue manually in Xero."
      : "Quote request only (no invoice created).";

  const opsBody = [
    "New quote request received",
    "",
    `Reference: ${record.referenceId}`,
    `Created: ${record.createdAt}`,
    "",
    `Name: ${customer.name}`,
    `Email: ${customer.email}`,
    customer.phone ? `Phone: ${customer.phone}` : null,
    `Organisation: ${customer.organisation}`,
    `Role: ${customer.role}`,
    "",
    "Items:",
    ...itemLines,
    "",
    `One-off subtotal: ${formatCurrency(record.totals?.oneOffSubtotal || 0)}`,
    `Subscription subtotal: ${formatCurrency(record.totals?.subscriptionSubtotal || 0)}`,
    `Subtotal: ${formatCurrency(record.totals?.subtotal || 0)}`,
    record.notes ? "" : null,
    record.notes ? "Notes:" : null,
    record.notes || null,
    record.compliance?.hasSubscriptions ? "" : null,
    record.compliance?.hasSubscriptions ? `Compliance: ${COMPLIANCE_STATEMENT}` : null,
    record.xero?.requested ? "" : null,
    record.xero?.requested
      ? `Xero: ${record.xero.invoiceId ? "Invoice created" : "Invoice not created"}`
      : null,
    record.xero?.invoiceNumber ? `Invoice number: ${record.xero.invoiceNumber}` : null,
    record.xero?.status ? `Invoice status: ${record.xero.status}` : null,
    record.xero?.error ? `Xero error: ${record.xero.error}` : null,
    "",
    "Ops action:",
    invoiceNote,
    "Ensure Xero online payments are enabled before emailing the invoice.",
  ]
    .filter(Boolean)
    .join("\n");

  const invoiceCustomerLine = record.xero?.created
    ? "Your invoice has been created in Xero. You will receive the invoice email from Xero for online payment."
    : record.xero?.requested
      ? "We received your request and will send your payment details shortly."
      : "We will confirm the details shortly.";

  const customerBody = [
    "Thank you for your quote request.",
    "",
    `Reference: ${record.referenceId}`,
    `Submitted: ${record.createdAt}`,
    "",
    "Summary:",
    ...itemLines,
    "",
    `Subtotal: ${formatCurrency(record.totals?.subtotal || 0)}`,
    record.compliance?.hasSubscriptions ? "" : null,
    record.compliance?.hasSubscriptions ? COMPLIANCE_STATEMENT : null,
    "",
    invoiceCustomerLine,
    "",
    "We will confirm the details within 1-2 business days.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await ses
      .sendEmail({
        Destination: { ToAddresses: [opsEmail] },
        Message: {
          Body: {
            Text: { Data: opsBody },
            Html: { Data: `<pre>${escapeHtml(opsBody)}</pre>` },
          },
          Subject: {
            Data: `Political Solutions quote request - ${customer.organisation || customer.name}`,
          },
        },
        Source: fromEmail,
        ReplyToAddresses: customer.email ? [customer.email] : [],
      })
      .promise();
    logEvent("ses.ops_email_sent", { referenceId: record.referenceId });
  } catch (error) {
    logEvent("ses.ops_email_failed", {
      referenceId: record.referenceId,
      error: error?.message || "failed",
    });
  }

  if (customer.email) {
    try {
      await ses
        .sendEmail({
          Destination: { ToAddresses: [customer.email] },
          Message: {
            Body: {
              Text: { Data: customerBody },
              Html: { Data: `<pre>${escapeHtml(customerBody)}</pre>` },
            },
            Subject: {
              Data: `Political Solutions quote request received - ${record.referenceId}`,
            },
          },
          Source: fromEmail,
        })
        .promise();
      logEvent("ses.customer_email_sent", {
        referenceId: record.referenceId,
        email: maskEmail(customer.email),
      });
    } catch (error) {
      logEvent("ses.customer_email_failed", {
        referenceId: record.referenceId,
        error: error?.message || "failed",
      });
    }
  }
}

async function handleQuoteRequestGet(event, origin) {
  const quoteTable = process.env.QUOTE_REQUESTS_TABLE;
  if (!quoteTable) {
    return response(
      500,
      { ok: false, error: "server_error", message: "Quote storage is not configured." },
      origin
    );
  }
  const path = resolvePath(event);
  const referenceId = path.split("/").pop();
  if (!referenceId) {
    return response(
      400,
      { ok: false, error: "validation_error", message: "Missing reference id." },
      origin
    );
  }
  const stored = await dynamo
    .get({
      TableName: quoteTable,
      Key: { referenceId },
    })
    .promise();
  if (!stored?.Item) {
    return response(404, { ok: false, error: "not_found", message: "Not found." }, origin);
  }
  const record = stored.Item;
  const sanitized = {
    referenceId: record.referenceId,
    createdAt: record.createdAt,
    items: Array.isArray(record.items) ? record.items : [],
    totals: record.totals,
    compliance: record.compliance,
    xero: sanitizeQuoteResponse(record).xero,
  };
  return response(200, { ok: true, record: sanitized }, origin);
}

async function handleQuoteRequestList(event, origin) {
  const quoteTable = process.env.QUOTE_REQUESTS_TABLE;
  if (!quoteTable) {
    return response(
      500,
      { ok: false, error: "server_error", message: "Quote storage is not configured." },
      origin
    );
  }
  const limitParam = Number.parseInt(event?.queryStringParameters?.limit || "20", 10);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 20;
  const lastKey = event?.queryStringParameters?.lastKey || "";

  const scanParams = {
    TableName: quoteTable,
    Limit: limit,
  };
  if (lastKey) {
    scanParams.ExclusiveStartKey = { referenceId: lastKey };
  }

  const result = await dynamo.scan(scanParams).promise();
  const items = (result.Items || []).map((item) => ({
    referenceId: item.referenceId,
    createdAt: item.createdAt,
    customerOrganisation: item.customer?.organisation || "",
    customerEmailMasked: maskEmail(item.customer?.email || ""),
    totals: item.totals,
    xero: sanitizeQuoteResponse(item).xero,
    status: item.status || "",
  }));

  return response(
    200,
    {
      ok: true,
      items,
      nextKey: result.LastEvaluatedKey?.referenceId || "",
    },
    origin
  );
}

async function handleQuoteRequestAdminDetail(event, origin) {
  const quoteTable = process.env.QUOTE_REQUESTS_TABLE;
  if (!quoteTable) {
    return response(
      500,
      { ok: false, error: "server_error", message: "Quote storage is not configured." },
      origin
    );
  }
  const path = resolvePath(event);
  const referenceId = path.split("/").slice(-2, -1)[0];
  if (!referenceId) {
    return response(
      400,
      { ok: false, error: "validation_error", message: "Missing reference id." },
      origin
    );
  }
  const stored = await dynamo
    .get({
      TableName: quoteTable,
      Key: { referenceId },
    })
    .promise();
  if (!stored?.Item) {
    return response(404, { ok: false, error: "not_found", message: "Not found." }, origin);
  }
  const record = stored.Item;
  return response(
    200,
    {
      ok: true,
      record: {
        referenceId: record.referenceId,
        createdAt: record.createdAt,
        customer: record.customer,
        notes: record.notes || "",
        items: record.items || [],
        totals: record.totals,
        compliance: record.compliance,
        xero: record.xero,
        status: record.status || "",
      },
    },
    origin
  );
}

async function handleXeroStatus(event, origin) {
  const info = await loadXeroTokenInfo();
  const connected = Boolean(info?.refresh_token && info?.tenant_id);
  const config = getXeroConfigStatus();
  const authResult = await requireAuth(event, origin);

  if (authResult.notConfigured) {
    return authResult.error;
  }

  if (authResult.error) {
    return response(200, { ok: true, connected, configured: config.configured }, origin);
  }

  return response(
    200,
    {
      ok: true,
      connected,
      configured: config.configured,
      missing: config.missing,
      tenantName: info?.tenant_name || "",
      lastConnectedAt: info?.connected_at || "",
      canCreateInvoice: hasXeroInvoiceConfig(),
    },
    origin
  );
}

async function handleXeroConnect(event, origin) {
  const authResult = await requireAuth(event, origin);
  if (authResult.error) return authResult.error;
  if (!hasXeroConfig()) {
    return response(
      400,
      { ok: false, error: "validation_error", message: "Xero is not configured." },
      origin
    );
  }
  logEvent("xero.connect_start", {});
  const state = buildXeroState();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID,
    redirect_uri: process.env.XERO_REDIRECT_URI,
    scope: XERO_SCOPES,
    state,
  });
  const url = `${XERO_AUTHORIZE_URL}?${params.toString()}`;
  const wantsJson =
    event?.queryStringParameters?.mode === "json" ||
    (event?.headers?.accept || "").includes("application/json");
  if (wantsJson) {
    return response(200, { ok: true, url }, origin);
  }
  return redirectResponse(url, origin);
}

async function handleXeroCallback(event, origin) {
  const frontendBaseUrl = process.env.FRONTEND_BASE_URL || "https://www.politicalsolutions.uk";
  const params = event?.queryStringParameters || {};
  if (params.error) {
    logEvent("xero.callback_error", { error: params.error });
    return redirectResponse(`${frontendBaseUrl}/portal/settings/integrations?xero=error`, origin);
  }
  const code = params.code;
  const state = params.state || "";
  if (!code || !verifyXeroState(state)) {
    logEvent("xero.callback_invalid", {});
    return redirectResponse(`${frontendBaseUrl}/portal/settings/integrations?xero=invalid`, origin);
  }
  try {
    const tokenResponse = await exchangeXeroCode(code);
    const tenant = await fetchXeroTenant(tokenResponse.access_token);
    const tokenInfo = {
      refresh_token: tokenResponse.refresh_token,
      tenant_id: tenant.tenantId,
      tenant_name: tenant.tenantName || "",
      connected_at: new Date().toISOString(),
    };
    await saveXeroTokenInfo(tokenInfo);
    logEvent("xero.connected", { tenantName: tenant.tenantName || "" });
    return redirectResponse(`${frontendBaseUrl}/portal/settings/integrations?xero=connected`, origin);
  } catch (error) {
    console.error("Xero callback error:", error);
    logEvent("xero.callback_failed", { error: error?.message || "failed" });
    return redirectResponse(`${frontendBaseUrl}/portal/settings/integrations?xero=error`, origin);
  }
}

async function handleXeroTestInvoice(event, origin) {
  const authResult = await requireAuth(event, origin);
  if (authResult.error) return authResult.error;
  if (!isXeroTestInvoiceEnabled()) {
    return response(403, { ok: false, error: "forbidden" }, origin);
  }

  const xeroInfo = await loadXeroTokenInfo();
  const xeroConnected = Boolean(xeroInfo?.refresh_token && xeroInfo?.tenant_id);
  if (!xeroConnected) {
    return response(400, { ok: false, error: "xero_not_connected" }, origin);
  }
  if (!hasXeroInvoiceConfig()) {
    return response(400, { ok: false, error: "xero_config_missing" }, origin);
  }

  const refreshed = await refreshXeroToken(xeroInfo.refresh_token);
  const accessToken = refreshed.access_token;
  const updatedInfo = {
    refresh_token: refreshed.refresh_token || xeroInfo.refresh_token,
    tenant_id: xeroInfo.tenant_id,
    tenant_name: xeroInfo.tenant_name || "",
    connected_at: xeroInfo.connected_at || new Date().toISOString(),
  };
  await saveXeroTokenInfo(updatedInfo);

  const opsEmail = process.env.OPS_EMAIL_TO || process.env.TO_EMAIL || "test@invalid";
  const invoice = await createXeroInvoice({
    tenantId: xeroInfo.tenant_id,
    accessToken,
    customer: {
      name: "Political Solutions",
      email: opsEmail,
      organisation: "Political Solutions (Test)",
      phone: "",
    },
    items: [
      {
        name: "TEST - DO NOT PAY",
        category: "oneOff",
        quantity: 1,
        unitPrice: 0,
        areaName: "",
        complianceLabel: "",
        invoiceDescription: "Test invoice for pipeline validation.",
      },
    ],
    referenceId: `test-${Date.now()}`,
  });

  logEvent("xero.test_invoice_created", {
    invoiceId: invoice.invoiceId,
    invoiceNumber: invoice.invoiceNumber,
  });

  return response(
    200,
    {
      ok: true,
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
    },
    origin
  );
}

export async function handler(event, context) {
  const origin = resolveAllowedOrigin(event);
  const method = resolveMethod(event);
  const path = resolvePath(event);

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
      body: "",
    };
  }

  try {
    if (path === "/enquiry" && method === "POST") {
      return await handleEnquiryPost(event, context, origin);
    }
    if (path === "/quote-requests" && method === "POST") {
      return await handleQuoteRequestPost(event, origin);
    }
    if (path === "/quote-requests" && method === "GET") {
      const authResult = await requireAuth(event, origin);
      if (authResult.error) return authResult.error;
      return await handleQuoteRequestList(event, origin);
    }
    if (path.startsWith("/quote-requests/") && path.endsWith("/admin") && method === "GET") {
      const authResult = await requireAuth(event, origin);
      if (authResult.error) return authResult.error;
      return await handleQuoteRequestAdminDetail(event, origin);
    }
    if (path.startsWith("/quote-requests/") && method === "GET") {
      return await handleQuoteRequestGet(event, origin);
    }
    if (path === "/xero/status" && method === "GET") {
      return await handleXeroStatus(event, origin);
    }
    if (path === "/xero/connect" && method === "GET") {
      return await handleXeroConnect(event, origin);
    }
    if (path === "/xero/callback" && method === "GET") {
      return await handleXeroCallback(event, origin);
    }
    if (path === "/xero/test-invoice" && method === "POST") {
      return await handleXeroTestInvoice(event, origin);
    }

    return response(404, { ok: false, error: "not_found", message: "Not found." }, origin);
  } catch (err) {
    console.error("Handler error:", err);
    return response(
      500,
      { ok: false, error: "server_error", message: "Please try again later" },
      origin
    );
  }
}
