import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const idempotencyMap = new Map();
const quoteMap = new Map();
let xeroTokenInfo = null;

const makePromise = (value) => ({ promise: async () => value });

const createAwsMock = () => {
  class SES {
    sendEmail() {
      return makePromise({});
    }
  }

  class DocumentClient {
    get(params) {
      const keyName = params.Key?.idempotencyKey || params.Key?.referenceId;
      if (params.TableName.includes("idempotency")) {
        return makePromise({ Item: idempotencyMap.get(keyName) });
      }
      return makePromise({ Item: quoteMap.get(keyName) });
    }
    put(params) {
      const keyName = params.Item?.referenceId;
      if (keyName) {
        quoteMap.set(keyName, params.Item);
      }
      return makePromise({});
    }
    scan() {
      return makePromise({ Items: Array.from(quoteMap.values()), LastEvaluatedKey: null });
    }
    transactWrite(params) {
      const idempotencyPut = params.TransactItems[0].Put;
      const quotePut = params.TransactItems[1].Put;
      const existing = idempotencyMap.get(idempotencyPut.Item.idempotencyKey);
      if (existing) {
        const error = new Error("ConditionalCheckFailedException");
        error.code = "ConditionalCheckFailedException";
        throw error;
      }
      idempotencyMap.set(idempotencyPut.Item.idempotencyKey, idempotencyPut.Item);
      quoteMap.set(quotePut.Item.referenceId, quotePut.Item);
      return makePromise({});
    }
  }

  class SSM {
    getParameter() {
      if (!xeroTokenInfo) {
        const error = new Error("ParameterNotFound");
        error.code = "ParameterNotFound";
        throw error;
      }
      return makePromise({ Parameter: { Value: JSON.stringify(xeroTokenInfo) } });
    }
    putParameter(params) {
      xeroTokenInfo = JSON.parse(params.Value);
      return makePromise({});
    }
  }

  return {
    SES,
    DynamoDB: { DocumentClient },
    SSM,
  };
};

const buildEvent = (payload) => ({
  requestContext: { http: { method: "POST", path: "/quote-requests", sourceIp: "1.2.3.4" } },
  headers: {},
  body: JSON.stringify(payload),
  isBase64Encoded: false,
});

const buildServiceEvent = (payload) => ({
  requestContext: { http: { method: "POST", path: "/enquiry/service-support", sourceIp: "1.2.3.4" } },
  headers: {},
  body: JSON.stringify(payload),
  isBase64Encoded: false,
});

const buildGetEvent = (path, headers = {}) => ({
  requestContext: { http: { method: "GET", path, sourceIp: "1.2.3.4" } },
  headers,
  isBase64Encoded: false,
});

const buildOpsInvoiceEvent = (referenceId, payload, headers = {}) => ({
  requestContext: {
    http: { method: "POST", path: `/ops/quotes/${referenceId}/invoice`, sourceIp: "1.2.3.4" },
  },
  headers,
  body: JSON.stringify(payload),
  isBase64Encoded: false,
});

const buildBriefingEvent = (payload, headers = {}) => ({
  requestContext: {
    http: { method: "POST", path: "/briefings/constituency-intelligence", sourceIp: "1.2.3.4" },
  },
  headers,
  body: JSON.stringify(payload),
  isBase64Encoded: false,
});

const buildPayload = (overrides = {}) => ({
  idempotencyKey: "test-key-1",
  customer: {
    fullName: "Alex Doe",
    email: "alex@example.com",
    organisation: "Alpha Org",
    role: "Chair",
  },
  notes: "Test notes",
  complianceAcknowledged: true,
  createInvoice: false,
  lineItems: [
    {
      sku: "subscription-foundation",
      name: "Foundation subscription",
      category: "subscription",
      quantity: 1,
      areaId: "Alpha Association",
      areaName: "Alpha Association",
      billingPeriod: "monthly",
      unitPrice: 50,
      priceDisplay: "GBP 50",
      complianceLabel: "Capability subscription",
      invoiceDescription: "Test subscription",
    },
  ],
  totals: { oneOffSubtotal: 0, subscriptionSubtotal: 50, subtotal: 50 },
  ...overrides,
});

const buildServicePayload = (overrides = {}) => ({
  name: "Alex Doe",
  email: "alex@example.com",
  phone: "07000000000",
  organisation: "Alpha Org",
  message: "Need election support",
  consent: true,
  ...overrides,
});

function makeJwt(payloadObj, privateKey, kid) {
  const header = { alg: "RS256", typ: "JWT", kid };
  const encode = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const signingInput = `${encode(header)}.${encode(payloadObj)}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  const signatureEncoded = Buffer.from(signature)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${signingInput}.${signatureEncoded}`;
}

describe("quote request handler", () => {
  beforeEach(() => {
    idempotencyMap.clear();
    quoteMap.clear();
    xeroTokenInfo = null;
    vi.resetAllMocks();
    vi.resetModules();
    globalThis.__AWS_SDK_MOCK__ = createAwsMock();
    global.fetch = vi.fn();
    process.env.QUOTE_REQUESTS_TABLE = "quote-requests";
    process.env.IDEMPOTENCY_TABLE = "quote-idempotency";
    process.env.FROM_EMAIL = "from@example.com";
    process.env.OPS_EMAIL_TO = "ops@example.com";
    process.env.XERO_SALES_ACCOUNT_CODE = "200";
    process.env.XERO_TAX_TYPE = "OUTPUT";
    process.env.XERO_TOKEN_PARAM_NAME = "xero-token";
    process.env.XERO_CLIENT_ID = "client-id";
    process.env.XERO_CLIENT_SECRET = "client-secret";
    process.env.XERO_REDIRECT_URI = "https://example.com/xero/callback";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.COGNITO_ISSUER;
    delete process.env.COGNITO_AUDIENCE;
  });

  it("rejects invalid payloads", async () => {
    const { handler } = await import("../src/handler.mjs");
    const event = buildEvent(buildPayload({ customer: { fullName: "", email: "" } }));
    const result = await handler(event, {});
    expect(result.statusCode).toBe(400);
  });

  it("returns existing reference for idempotency hits", async () => {
    const { handler } = await import("../src/handler.mjs");
    const payload = buildPayload();
    const first = await handler(buildEvent(payload), {});
    const firstBody = JSON.parse(first.body);
    const second = await handler(buildEvent(payload), {});
    const secondBody = JSON.parse(second.body);
    expect(firstBody.referenceId).toBeTruthy();
    expect(secondBody.referenceId).toBe(firstBody.referenceId);
  });

  it("returns invoice failure details when Xero invoice fails", async () => {
    xeroTokenInfo = {
      refresh_token: "refresh",
      tenant_id: "tenant",
      tenant_name: "Tenant",
      connected_at: new Date().toISOString(),
    };
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "token", refresh_token: "refresh" }),
      text: async () => "",
      status: 200,
    });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ Contacts: [{ ContactID: "contact-1", Name: "Alpha Org" }] }),
      text: async () => "",
      status: 200,
    });
    global.fetch.mockResolvedValueOnce({
      ok: false,
      text: async () => "Invoice error",
      status: 500,
    });
    global.fetch.mockResolvedValueOnce({
      ok: false,
      text: async () => "Invoice error",
      status: 500,
    });

    const { handler } = await import("../src/handler.mjs");
    const payload = buildPayload({ createInvoice: true, idempotencyKey: "test-key-2" });
    const result = await handler(buildEvent(payload), {});
    const body = JSON.parse(result.body);
    expect(body.xero.created).toBe(false);
    expect(body.xero.errorCode).toBe("XERO_INVOICE_FAILED");
  });

  it("stores invoice id on success", async () => {
    xeroTokenInfo = {
      refresh_token: "refresh",
      tenant_id: "tenant",
      tenant_name: "Tenant",
      connected_at: new Date().toISOString(),
    };
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token", refresh_token: "refresh" }),
        text: async () => "",
        status: 200,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Contacts: [{ ContactID: "contact-1", Name: "Alpha Org" }],
        }),
        text: async () => "",
        status: 200,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Invoices: [{ InvoiceID: "inv-1", InvoiceNumber: "INV-001", Status: "DRAFT" }],
        }),
        text: async () => "",
        status: 200,
      });

    const { handler } = await import("../src/handler.mjs");
    const payload = buildPayload({ createInvoice: true, idempotencyKey: "test-key-3" });
    const result = await handler(buildEvent(payload), {});
    const body = JSON.parse(result.body);
    expect(body.xero.created).toBe(true);
    expect(body.xero.invoiceId).toBe("inv-1");
    const stored = quoteMap.get(body.referenceId);
    expect(stored?.xero?.invoiceId).toBe("inv-1");
  });

  it("fails closed when auth configuration is missing on protected endpoints", async () => {
    delete process.env.COGNITO_ISSUER;
    delete process.env.COGNITO_AUDIENCE;
    const { handler } = await import("../src/handler.mjs");
    const result = await handler(buildGetEvent("/quote-requests"), {});
    const body = JSON.parse(result.body);
    expect(result.statusCode).toBe(503);
    expect(body.errorCode).toBe("AUTH_NOT_CONFIGURED");
  });

  it("returns unauthorized when token is missing for protected endpoints", async () => {
    process.env.COGNITO_ISSUER = "https://example.com/issuer";
    process.env.COGNITO_AUDIENCE = "audience";
    const { handler } = await import("../src/handler.mjs");
    const result = await handler(buildGetEvent("/quote-requests"), {});
    expect(result.statusCode).toBe(401);
  });

  it("rejects constituency briefing requests when AI briefing is not configured", async () => {
    process.env.COGNITO_ISSUER = "https://example.com/issuer";
    process.env.COGNITO_AUDIENCE = "audience";
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const kid = "briefing-kid-1";
    const jwk = { ...publicKey.export({ format: "jwk" }), kid };
    const token = makeJwt(
      {
        iss: process.env.COGNITO_ISSUER,
        aud: process.env.COGNITO_AUDIENCE,
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      privateKey,
      kid
    );

    global.fetch = vi.fn(async (url) => {
      if (url.includes("/.well-known/jwks.json")) {
        return { ok: true, json: async () => ({ keys: [jwk] }) };
      }
      return { ok: false, status: 500, text: async () => "Unexpected" };
    });

    const { handler } = await import("../src/handler.mjs");
    const result = await handler(
      buildBriefingEvent(
        { constituencyName: "Exeter" },
        { Authorization: `Bearer ${token}` }
      ),
      {}
    );
    const body = JSON.parse(result.body);
    expect(result.statusCode).toBe(503);
    expect(body.error).toBe("ai_briefing_not_configured");
  });

  it("allows public quote requests without auth configuration", async () => {
    delete process.env.COGNITO_ISSUER;
    delete process.env.COGNITO_AUDIENCE;
    const { handler } = await import("../src/handler.mjs");
    const result = await handler(buildEvent(buildPayload()), {});
    expect(result.statusCode).toBe(200);
  });

  it("creates a service enquiry without auth configuration", async () => {
    delete process.env.COGNITO_ISSUER;
    delete process.env.COGNITO_AUDIENCE;
    const { handler } = await import("../src/handler.mjs");
    const result = await handler(buildServiceEvent(buildServicePayload()), {});
    const body = JSON.parse(result.body);
    expect(result.statusCode).toBe(200);
    expect(body.referenceId).toBeTruthy();
  });

  it("rejects service enquiry without consent", async () => {
    const { handler } = await import("../src/handler.mjs");
    const result = await handler(buildServiceEvent(buildServicePayload({ consent: false })), {});
    const body = JSON.parse(result.body);
    expect(result.statusCode).toBe(400);
    expect(body.errorCode).toBe("VALIDATION_ERROR");
  });

  it("fails closed when auth configuration is missing on ops invoice creation", async () => {
    delete process.env.COGNITO_ISSUER;
    delete process.env.COGNITO_AUDIENCE;
    const { handler } = await import("../src/handler.mjs");
    const result = await handler(
      buildOpsInvoiceEvent("ref-1", { amount: 100, description: "Service support" }),
      {}
    );
    const body = JSON.parse(result.body);
    expect(result.statusCode).toBe(503);
    expect(body.errorCode).toBe("AUTH_NOT_CONFIGURED");
  });

  it("returns unauthorized for ops invoice creation without token", async () => {
    process.env.COGNITO_ISSUER = "https://example.com/issuer";
    process.env.COGNITO_AUDIENCE = "audience";
    const { handler } = await import("../src/handler.mjs");
    const result = await handler(
      buildOpsInvoiceEvent("ref-1", { amount: 100, description: "Service support" }),
      {}
    );
    expect(result.statusCode).toBe(401);
  });

  it("stores invoice id on ops invoice creation success", async () => {
    process.env.COGNITO_ISSUER = "https://example.com/issuer";
    process.env.COGNITO_AUDIENCE = "audience";
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const kid = "test-kid";
    const jwk = { ...publicKey.export({ format: "jwk" }), kid };
    const token = makeJwt(
      { iss: process.env.COGNITO_ISSUER, aud: process.env.COGNITO_AUDIENCE, exp: Math.floor(Date.now() / 1000) + 300 },
      privateKey,
      kid
    );

    const referenceId = "service-1";
    quoteMap.set(referenceId, {
      referenceId,
      requestType: "SERVICE_ENQUIRY",
      createdAt: new Date().toISOString(),
      customer: { name: "Alex", email: "alex@example.com", organisation: "Alpha Org" },
      notes: "Test",
      items: [],
      totals: { subscriptionSubtotal: 0, oneOffSubtotal: 0, subtotal: 0 },
      xero: {},
      status: "received",
    });

    xeroTokenInfo = {
      refresh_token: "refresh",
      tenant_id: "tenant",
      tenant_name: "Tenant",
      connected_at: new Date().toISOString(),
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url.includes("/.well-known/jwks.json")) {
        return { ok: true, json: async () => ({ keys: [jwk] }) };
      }
      if (url.includes("identity.xero.com/connect/token")) {
        return { ok: true, json: async () => ({ access_token: "token", refresh_token: "refresh" }) };
      }
      if (url.includes("api.xro/2.0/Contacts")) {
        return {
          ok: true,
          json: async () => ({ Contacts: [{ ContactID: "contact-1", Name: "Alpha Org" }] }),
        };
      }
      if (url.includes("api.xro/2.0/Invoices")) {
        return {
          ok: true,
          json: async () => ({
            Invoices: [{ InvoiceID: "inv-1", InvoiceNumber: "INV-001", Status: "DRAFT" }],
          }),
        };
      }
      return { ok: false, text: async () => "Unexpected", status: 500 };
    });

    const { handler } = await import("../src/handler.mjs");
    const result = await handler(
      buildOpsInvoiceEvent(
        referenceId,
        { amount: 120, description: "Service support", emailInvoice: false },
        { Authorization: `Bearer ${token}` }
      ),
      {}
    );
    const body = JSON.parse(result.body);
    expect(result.statusCode).toBe(200);
    expect(body.invoiceId).toBe("inv-1");
    const stored = quoteMap.get(referenceId);
    expect(stored?.xero?.invoiceId).toBe("inv-1");
  });

  it("generates a constituency intelligence brief via Anthropic on the protected route", async () => {
    process.env.COGNITO_ISSUER = "https://example.com/issuer";
    process.env.COGNITO_AUDIENCE = "audience";
    process.env.ANTHROPIC_API_KEY = "anthropic-secret";
    process.env.ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const kid = "briefing-kid-2";
    const jwk = { ...publicKey.export({ format: "jwk" }), kid };
    const token = makeJwt(
      {
        iss: process.env.COGNITO_ISSUER,
        aud: process.env.COGNITO_AUDIENCE,
        exp: Math.floor(Date.now() / 1000) + 300,
      },
      privateKey,
      kid
    );

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url.includes("/.well-known/jwks.json")) {
        return { ok: true, json: async () => ({ keys: [jwk] }) };
      }
      if (url === "https://api.anthropic.com/v1/messages") {
        const body = JSON.parse(options.body);
        expect(body.model).toBe("claude-sonnet-4-20250514");
        expect(body.messages[0].content).toContain("\"constituency_name\": \"Exeter\"");
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              content: [
                {
                  type: "text",
                  text: "Paragraph one.\n\nParagraph two.\n\nParagraph three.",
                },
              ],
            }),
        };
      }
      return { ok: false, status: 500, text: async () => "Unexpected" };
    });

    const { handler } = await import("../src/handler.mjs");
    const result = await handler(
      buildBriefingEvent(
        {
          constituencyName: "Exeter",
          currentMp: { name: "Steve Race", party: "Labour", majority: 1203 },
          result2024: { winner: "Steve Race", party: "Labour", majority: 1203, voteShare: 41.7 },
          swingFromNotional2019: { label: "Con → Labour", value: 0.122 },
          vulnerability: { score: 7.3, classification: "High" },
          reformThreat: { rank: 18, score: 6.2, label: "Reform threat" },
          libDemThreat: null,
          demographics: { graduatePct: 46.1, ownerOccupancyPct: 53.8, leaveVotePct: 41.5 },
          lgr: { affected: false },
        },
        { Authorization: `Bearer ${token}` }
      ),
      {}
    );
    const body = JSON.parse(result.body);
    expect(result.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.model).toBe("claude-sonnet-4-20250514");
    expect(body.brief).toContain("Paragraph one.");
  });

  it("stores errorCode on ops invoice creation failure", async () => {
    process.env.COGNITO_ISSUER = "https://example.com/issuer";
    process.env.COGNITO_AUDIENCE = "audience";
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const kid = "test-kid";
    const jwk = { ...publicKey.export({ format: "jwk" }), kid };
    const token = makeJwt(
      { iss: process.env.COGNITO_ISSUER, aud: process.env.COGNITO_AUDIENCE, exp: Math.floor(Date.now() / 1000) + 300 },
      privateKey,
      kid
    );

    const referenceId = "service-2";
    quoteMap.set(referenceId, {
      referenceId,
      requestType: "SERVICE_ENQUIRY",
      createdAt: new Date().toISOString(),
      customer: { name: "Alex", email: "alex@example.com", organisation: "Alpha Org" },
      notes: "Test",
      items: [],
      totals: { subscriptionSubtotal: 0, oneOffSubtotal: 0, subtotal: 0 },
      xero: {},
      status: "received",
    });

    xeroTokenInfo = {
      refresh_token: "refresh",
      tenant_id: "tenant",
      tenant_name: "Tenant",
      connected_at: new Date().toISOString(),
    };

    global.fetch = vi.fn(async (url, options = {}) => {
      if (url.includes("/.well-known/jwks.json")) {
        return { ok: true, json: async () => ({ keys: [jwk] }) };
      }
      if (url.includes("identity.xero.com/connect/token")) {
        return { ok: true, json: async () => ({ access_token: "token", refresh_token: "refresh" }) };
      }
      if (url.includes("api.xro/2.0/Contacts")) {
        return {
          ok: true,
          json: async () => ({ Contacts: [{ ContactID: "contact-1", Name: "Alpha Org" }] }),
        };
      }
      if (url.includes("api.xro/2.0/Invoices")) {
        return { ok: false, text: async () => "Invoice error", status: 500 };
      }
      return { ok: false, text: async () => "Unexpected", status: 500 };
    });

    const { handler } = await import("../src/handler.mjs");
    const result = await handler(
      buildOpsInvoiceEvent(
        referenceId,
        { amount: 120, description: "Service support", emailInvoice: false },
        { Authorization: `Bearer ${token}` }
      ),
      {}
    );
    const body = JSON.parse(result.body);
    expect(result.statusCode).toBe(200);
    expect(body.errorCode).toBe("XERO_INVOICE_FAILED");
    const stored = quoteMap.get(referenceId);
    expect(stored?.xero?.errorCode).toBe("XERO_INVOICE_FAILED");
  });
});
