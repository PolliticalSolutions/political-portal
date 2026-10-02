// Local-only integration/preview harness. Never connects to production or sends email.
import http from "node:http";
import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createConferenceHandler } from "../infra/enquiry-api/src/conference-handler.mjs";

export const REST = "http://127.0.0.1:55433";
export function localKey(role) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const signature = createHmac("sha256", "conference-local-jwt-secret-at-least-32-characters").update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
export const serviceKey = localKey("service_role");
export async function rest(path, role = "service_role", options = {}) {
  return fetch(`${REST}/${path}`, { ...options, headers: { Authorization: `Bearer ${localKey(role)}`, "Content-Type": "application/json", ...options.headers } });
}
export function harness() {
  const state = { mode: "ok", emails: 0, events: [] };
  const handler = createConferenceHandler({
    env: { SUPABASE_URL: REST, SUPABASE_SERVICE_ROLE_KEY: serviceKey, ALLOWED_ORIGINS: "http://localhost:5173,http://localhost:4173", CONFERENCE_EMAIL_ENABLED: "true", FROM_EMAIL: "test@example.com" },
    fetchImpl: (url, options) => {
      if (state.mode === "database-failure") throw new Error("Simulated database outage");
      return fetch(url.replace("/rest/v1/", "/"), options);
    },
    sendEmail: async (_input, signal) => {
      if (state.mode === "email-failure") throw new Error("Simulated email outage");
      if (state.mode === "email-timeout") await new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error("Simulated timeout")), 1600);
        signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Simulated timeout")); }, { once: true });
      });
      state.emails++;
    },
    log: (event) => state.events.push(event),
  });
  const call = (path, payload, ip = "192.0.2.40") => handler({ rawPath: `/conference/${path}`, headers: { origin: "http://localhost:4173", "content-type": "application/json" }, requestContext: { http: { method: "POST", sourceIp: ip } }, body: JSON.stringify(payload) });
  return { state, handler, call };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { handler, state } = harness();
  http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (req.url === "/__test/mode" && req.method === "POST") {
      const mode = JSON.parse(body).mode;
      if (["ok", "database-failure", "email-failure", "email-timeout"].includes(mode)) state.mode = mode;
      res.end(JSON.stringify({ mode: state.mode })); return;
    }
    const result = await handler({ rawPath: req.url, headers: req.headers,
      requestContext: { http: { method: req.method, sourceIp: "127.0.0.1" } }, body });
    res.writeHead(result.statusCode, result.headers); res.end(result.body);
  }).listen(5181, "127.0.0.1", () => console.log("Conference local test API: http://localhost:5181 (mock email, real disposable database)"));
}
