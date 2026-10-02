import { createHmac, timingSafeEqual, createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@<>]+@[^\s@<>.]+(?:\.[^\s@<>.]+)+$/;
const MAX_TOKEN_AGE = 24 * 60 * 60 * 1000;
let ses;
async function sendNotification(input, signal) {
  // Existing enquiry-package dependency, loaded only when notification is used.
  const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");
  ses ||= new SESClient({ maxAttempts: 1 });
  return ses.send(new SendEmailCommand(input), { abortSignal: signal });
}

export function createConferenceHandler({ env = process.env, fetchImpl = fetch, now = Date.now,
  sendEmail = sendNotification,
  log = (event) => console.error(JSON.stringify(event)),
} = {}) {
  const origins = new Set((env.ALLOWED_ORIGINS || "https://politicalsolutions.uk").split(",").map((item) => item.trim()));
  const key = () => env.SUPABASE_SERVICE_ROLE_KEY;
  const digest = (value) => createHmac("sha256", key()).update(`conference-v1:${value}`).digest("base64url");
  const sign = (visitId, issued) => {
    const payload = Buffer.from(JSON.stringify({ visitId, issued })).toString("base64url");
    return `${payload}.${digest(payload)}`;
  };
  function verify(token) {
    if (typeof token !== "string" || token.length > 600) return null;
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = Buffer.from(digest(payload));
    const supplied = Buffer.from(signature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString());
      const age = now() - data.issued;
      if (!UUID.test(data.visitId) || !Number.isFinite(data.issued) || age < 0 || age > MAX_TOKEN_AGE) return null;
      return { ...data, age };
    } catch { return null; }
  }
  async function rpc(name, payload = {}) {
    if (!env.SUPABASE_URL || !key()) throw new Error("Conference database is not configured");
    const response = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: key(), Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error(`Conference database returned ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  return async function handler(event) {
    if (event?.source === "aws.events" && event?.detail?.task === "conference-cleanup") {
      // Let scheduled failures reach CloudWatch and EventBridge retries.
      await rpc("conference_cleanup");
      return { ok: true };
    }
    const headers = Object.fromEntries(Object.entries(event?.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const origin = headers.origin || "";
    const reply = (statusCode, body, extra = {}) => ({
      statusCode,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin",
        ...(origins.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}), ...extra },
      body: JSON.stringify(body),
    });
    const fail = (status, message, extra) => reply(status, { ok: false, message }, extra);
    if (origin && !origins.has(origin)) return fail(403, "This origin is not allowed.");
    const method = event?.requestContext?.http?.method;
    if (method === "OPTIONS") return reply(204, null, { "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    if (method !== "POST") return fail(405, "Use POST.");
    const path = event.rawPath;
    if (!["/conference/visit", "/conference/leads"].includes(path)) return fail(404, "Not found.");
    const ip = event?.requestContext?.http?.sourceIp;
    if (!ip) return fail(400, "The request could not be verified.");
    if (!headers["content-type"]?.toLowerCase().startsWith("application/json")) return fail(415, "Use JSON.");
    const body = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
    if (Buffer.byteLength(body) > 12000) return fail(413, "The message is too long.");
    let payload;
    try { payload = JSON.parse(body); } catch { return fail(400, "The request could not be read."); }
    if (!payload || Array.isArray(payload) || typeof payload !== "object") return fail(400, "The request could not be read.");

    try {
      if (!key()) throw new Error("Conference database is not configured");
      const allowed = await rpc("conference_allow_request", {
        p_scope: path.endsWith("visit") ? "visit" : "submit", p_ip_hash: digest(`ip:${ip}`),
        // Allow shared venue Wi-Fi; separate buckets keep visits from exhausting submissions.
        p_limit: path.endsWith("visit") ? 120 : 30,
      });
      if (!allowed) return fail(429, "Too many requests. Please wait a minute and try again, or contact Paul below.", { "Retry-After": "60" });
      if (path.endsWith("visit")) {
        if (!UUID.test(payload.visitId || "")) return fail(400, "Invalid visit.");
        const timestamp = await rpc("conference_record_visit", { p_visit_id: payload.visitId });
        return reply(200, { ok: true, token: sign(payload.visitId, new Date(timestamp).getTime()) });
      }
      if (payload.website !== undefined && (typeof payload.website !== "string" || payload.website.trim())) {
        return fail(400, "Your details could not be saved. Please contact Paul below.");
      }
      const visit = verify(payload.token);
      if (!visit) return fail(400, "Please reload the page before sending your details.");
      if (visit.age < 2000) return fail(400, "Please wait two seconds, then select Send again.");
      if (!UUID.test(payload.requestId || "")) return fail(400, "Invalid submission.");
      if (payload.consent !== true || typeof payload.followupConsent !== "boolean") return fail(400, "Please confirm permission to handle your enquiry.");
      const fields = {};
      for (const [field, max, required] of [["name", 100, true], ["organisation", 200, false], ["email", 254, true], ["message", 2000, false]]) {
        const value = payload[field] ?? "";
        if (typeof value !== "string" || value.length > max || (required && !value.trim())) return fail(400, `Please check the ${field} field.`);
        if (field !== "message" && /[\u0000-\u001f]/.test(value)) return fail(400, "Please enter valid contact details.");
        fields[field] = value.trim();
      }
      if (!EMAIL.test(fields.email) || /[\r\n\u0000-\u001f]/.test(fields.name + fields.organisation + fields.email) || fields.message.includes("\0")) return fail(400, "Please enter valid contact details.");
      const payloadHash = createHash("sha256").update(JSON.stringify({ ...fields, followupConsent: payload.followupConsent })).digest("hex");
      const saved = await rpc("conference_save_lead", { p_request_id: payload.requestId, p_visit_id: visit.visitId,
        p_name: fields.name, p_organisation: fields.organisation, p_email: fields.email, p_message: fields.message,
        p_followup_consent: payload.followupConsent, p_payload_hash: payloadHash,
      });
      if (saved.conflict) return fail(409, "This submission changed during a retry. Please reload and try again, or contact Paul below.");
      if (!saved.id) throw new Error("Database did not confirm a saved lead");
      if (!saved.duplicate && env.CONFERENCE_EMAIL_ENABLED === "true") {
        try {
          await sendEmail({
            Source: env.FROM_EMAIL,
            Destination: { ToAddresses: ["paul@politicalsolutions.uk"] },
            ReplyToAddresses: [fields.email],
            Message: {
              Subject: { Data: `Conference lead: ${fields.name}${fields.organisation ? `, ${fields.organisation}` : ""}`, Charset: "UTF-8" },
              Body: { Text: { Data: [ `Name: ${fields.name}`, `Organisation: ${fields.organisation || "Not supplied"}`,
                `Email: ${fields.email}`, "", fields.message || "No message supplied.", "",
                `Future conference emails: ${payload.followupConsent ? "Consented" : "Not consented"}`,
                `Record: ${saved.id}`, "Delete this notification and any exported copies after 12 months, or earlier on withdrawal.",
              ].join("\n"), Charset: "UTF-8" } },
            },
          }, AbortSignal.timeout(1500));
        } catch {
          log({ event: "conference_notification_failed", leadId: saved.id });
        }
      }
      return reply(200, { ok: true });
    } catch {
      log({ event: "conference_request_failed", requestId: event?.requestContext?.requestId });
      return fail(503, "We could not confirm that your details were saved. Please try Send again or contact Paul below.");
    }
  };
}

export const handler = createConferenceHandler();
