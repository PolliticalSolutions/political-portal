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

const buildGetEvent = (path, headers = {}) => ({
  requestContext: { http: { method: "GET", path, sourceIp: "1.2.3.4" } },
  headers,
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

  it("allows public quote requests without auth configuration", async () => {
    delete process.env.COGNITO_ISSUER;
    delete process.env.COGNITO_AUDIENCE;
    const { handler } = await import("../src/handler.mjs");
    const result = await handler(buildEvent(buildPayload()), {});
    expect(result.statusCode).toBe(200);
  });
});
