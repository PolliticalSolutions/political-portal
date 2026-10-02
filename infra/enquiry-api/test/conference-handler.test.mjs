import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createConferenceHandler } from "../src/conference-handler.mjs";

function fixture() {
  let clock = Date.parse("2026-10-02T10:00:00Z");
  const rows = new Map();
  const visits = new Map();
  const env = { SUPABASE_URL: "https://database.invalid", SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
    ALLOWED_ORIGINS: "https://politicalsolutions.uk", CONFERENCE_EMAIL_ENABLED: "true", FROM_EMAIL: "paul@politicalsolutions.uk" };
  const sendEmail = vi.fn().mockResolvedValue({});
  const log = vi.fn();
  const fetchImpl = vi.fn(async (url, options) => {
    const payload = JSON.parse(options.body);
    let result;
    if (url.endsWith("conference_allow_request")) result = true;
    if (url.endsWith("conference_record_visit")) {
      if (!visits.has(payload.p_visit_id)) visits.set(payload.p_visit_id, new Date(clock).toISOString());
      result = visits.get(payload.p_visit_id);
    }
    if (url.endsWith("conference_save_lead")) {
      const old = rows.get(payload.p_request_id);
      result = { id: old?.id || randomUUID(), duplicate: Boolean(old), conflict: Boolean(old && old.hash !== payload.p_payload_hash) };
      if (!old) rows.set(payload.p_request_id, { id: result.id, hash: payload.p_payload_hash });
    }
    return { ok: true, status: 200, json: async () => result };
  });
  const handler = createConferenceHandler({ env, fetchImpl, sendEmail, log, now: () => clock });
  const call = (path, payload, extra = {}) => handler({ rawPath: `/conference/${path}`, headers: { origin: "https://politicalsolutions.uk", "content-type": "application/json" }, requestContext: { http: { method: "POST", sourceIp: "192.0.2.1" } }, body: JSON.stringify(payload), ...extra });
  const makeLead = async () => {
    const visitId = randomUUID();
    const { body } = await call("visit", { visitId });
    return { token: JSON.parse(body).token, requestId: randomUUID(), name: "Test Delegate", email: "test@example.com", organisation: "Example Association", message: "", website: "", consent: true, followupConsent: false };
  };
  return { handler, call, makeLead, rows, visits, fetchImpl, sendEmail, log, env, advance: (ms) => { clock += ms; } };
}

describe("conference endpoint", () => {
  it("rejects an immediate submission and accepts it at three seconds with an optional empty message", async () => {
    const f = fixture(); const lead = await f.makeLead();
    expect((await f.call("leads", lead)).statusCode).toBe(400);
    expect(f.rows.size).toBe(0);
    f.advance(3000);
    expect((await f.call("leads", lead)).statusCode).toBe(200);
    expect(f.rows.size).toBe(1);
    expect(f.sendEmail.mock.calls[0][0].Message.Subject.Data).toBe("Conference lead: Test Delegate, Example Association");
    expect(f.sendEmail.mock.calls[0][0].Message.Body.Text.Data).toContain("Not consented");
  });
  it("saves once and notifies once when a browser retries the same request", async () => {
    const f = fixture(); const lead = await f.makeLead(); f.advance(3000);
    await f.call("leads", lead); await f.call("leads", lead);
    expect(f.rows.size).toBe(1); expect(f.sendEmail).toHaveBeenCalledTimes(1);
    expect((await f.call("leads", { ...lead, name: "Changed" })).statusCode).toBe(409);
  });
  it("reports success after a saved row even when notification fails", async () => {
    const f = fixture(); const lead = await f.makeLead(); f.advance(3000);
    f.sendEmail.mockRejectedValue(new Error("SES is broken"));
    expect((await f.call("leads", lead)).statusCode).toBe(200);
    expect(f.rows.size).toBe(1);
    expect(f.log).toHaveBeenCalledWith({ event: "conference_notification_failed", leadId: expect.any(String) });
  });
  it("does not notify or claim success when the database is unreachable", async () => {
    const f = fixture(); const lead = await f.makeLead(); f.advance(3000);
    f.fetchImpl.mockRejectedValue(new Error("Database offline"));
    const response = await f.call("leads", lead);
    expect(response.statusCode).toBe(503); expect(JSON.parse(response.body).ok).toBe(false);
    expect(f.rows.size).toBe(0); expect(f.sendEmail).not.toHaveBeenCalled();
  });
  it.each([
    { website: "bot.example" }, { consent: false }, { consent: "true" }, { email: "x@" },
    { email: "x @example.com" }, { name: "\r\nInjected" }, { name: " " }, { message: "x".repeat(2001) },
    { organisation: {} }, { token: "forged-token" },
  ])("rejects invalid or scripted payloads: %j", async (overrides) => {
    const f = fixture(); const lead = await f.makeLead(); f.advance(3000);
    expect((await f.call("leads", { ...lead, ...overrides })).statusCode).toBe(400);
    expect(f.rows.size).toBe(0);
  });
  it("rejects signed tokens after their lifetime", async () => {
    const f = fixture(); const lead = await f.makeLead(); f.advance(25 * 60 * 60 * 1000);
    expect((await f.call("leads", lead)).statusCode).toBe(400);
  });
  it("returns 429 with a retry delay when the shared limiter refuses the request", async () => {
    const f = fixture(); const lead = await f.makeLead(); f.advance(3000);
    f.fetchImpl.mockResolvedValue({ ok: true, status: 200, json: async () => false });
    const response = await f.call("leads", lead);
    expect(response.statusCode).toBe(429); expect(response.headers["Retry-After"]).toBe("60");
    expect(f.rows.size).toBe(0);
  });
  it("does not trust a forwarded client IP or accept a foreign origin", async () => {
    const f = fixture();
    expect((await f.call("visit", { visitId: randomUUID() }, { headers: { origin: "https://attacker.invalid", "content-type": "application/json" } })).statusCode).toBe(403);
    expect((await f.call("visit", { visitId: randomUUID() }, { requestContext: { http: { method: "POST" } } })).statusCode).toBe(400);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it("runs retention cleanup only for the scheduled event", async () => {
    const f = fixture();
    await f.handler({ source: "aws.events", detail: { task: "conference-cleanup" } });
    expect(f.fetchImpl.mock.calls[0][0]).toContain("conference_cleanup");
  });
  it("can save when email is disabled, without exposing keys or setting cookies", async () => {
    const f = fixture(); f.env.CONFERENCE_EMAIL_ENABLED = "false";
    const lead = await f.makeLead(); f.advance(3000);
    const response = await f.call("leads", lead);
    expect(response.statusCode).toBe(200); expect(f.sendEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(response)).not.toContain("server-only-test-key");
    expect(response.headers).not.toHaveProperty("Set-Cookie");
  });
});
