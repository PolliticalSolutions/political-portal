import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { harness, rest } from "./conference-local-harness.mjs";

const { state, call, handler } = harness();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const counts = async () => { const r = await rest("conference_daily_metrics?select=views,submissions"); assert.equal(r.status, 200); return (await r.json()).reduce((sum, row) => ({ views: sum.views + row.views, submissions: sum.submissions + row.submissions }), { views: 0, submissions: 0 }); };
const initial = await counts();
const visitId = randomUUID();
const visited = await call("visit", { visitId });
assert.equal(visited.statusCode, 200, visited.body);
await call("visit", { visitId });
const lead = { token: JSON.parse(visited.body).token, requestId: randomUUID(), name: "Conference integration test", organisation: "Synthetic test association", email: "conference-test@example.com", message: "", consent: true, followupConsent: false, website: "" };
assert.equal((await call("leads", lead)).statusCode, 400);
await delay(3000);
assert.equal((await call("leads", { ...lead, website: "bot.example" })).statusCode, 400);
const concurrent = await Promise.all(Array.from({ length: 5 }, () => call("leads", lead)));
assert(concurrent.every((result) => result.statusCode === 200), JSON.stringify(concurrent));
assert.equal(state.emails, 1);
state.mode = "email-failure";
assert.equal((await call("leads", { ...lead, requestId: randomUUID() })).statusCode, 200);
assert(state.events.some((event) => event.event === "conference_notification_failed"));
state.mode = "email-timeout";
assert.equal((await call("leads", { ...lead, requestId: randomUUID() })).statusCode, 200);
state.mode = "database-failure";
assert.equal((await call("leads", { ...lead, requestId: randomUUID() })).statusCode, 503);
state.mode = "ok";
const final = await counts();
assert.equal(final.views - initial.views, 1);
assert.equal(final.submissions - initial.submissions, 3);
console.log("PASS: one view per page instance; three durable submissions; duplicate retries counted once; honeypot and 2-second timing; database and email failure/timeout behaviour.");

for (const role of ["anon", "authenticated"]) {
  for (const table of ["conference_leads", "conference_daily_metrics", "conference_visits", "conference_rate_limits"]) {
    const read = await rest(`${table}?select=*`, role);
    assert([401, 403].includes(read.status), `${role} could read ${table}: ${read.status}`);
    const validRows = {
      conference_leads: { name: "Denied", email: "denied@example.com", consent: true, request_id: randomUUID(), visit_id: randomUUID(), payload_hash: "test" },
      conference_daily_metrics: { day: "2026-10-02", views: 1, submissions: 0 },
      conference_visits: { id: randomUUID() },
      conference_rate_limits: { scope: "test", ip_hash: "test", bucket: new Date().toISOString(), hits: 1 },
    };
    const write = await rest(table, role, { method: "POST", body: JSON.stringify(validRows[table]) });
    assert([401, 403].includes(write.status), `${role} could insert ${table}: ${write.status}`);
  }
  const rpc = await rest("rpc/conference_record_visit", role, { method: "POST", body: JSON.stringify({ p_visit_id: randomUUID() }) });
  assert([401, 403].includes(rpc.status));
}
console.log("PASS: actual anonymous and authenticated JWTs refused SELECT, INSERT and privileged RPC through PostgREST.");

const hash = randomUUID();
for (let i = 0; i < 4; i++) {
  const r = await rest("rpc/conference_allow_request", "service_role", { method: "POST", body: JSON.stringify({ p_scope: "test", p_ip_hash: hash, p_limit: 3 }) });
  assert.equal(await r.json(), i < 3);
}
console.log("PASS: shared database rate limit rejects the request above its limit.");

const expire = await rest(`conference_leads?request_id=eq.${lead.requestId}`, "service_role", { method: "PATCH", body: JSON.stringify({ expires_at: "2020-01-01T00:00:00Z" }) });
assert.equal(expire.status, 204);
await handler({ source: "aws.events", detail: { task: "conference-cleanup" } });
const removed = await rest(`conference_leads?request_id=eq.${lead.requestId}&select=id`);
assert.deepEqual(await removed.json(), []);
assert.deepEqual(await counts(), final);
console.log("PASS: retention cleanup removes expired personal records while preserving aggregate statistics.");
