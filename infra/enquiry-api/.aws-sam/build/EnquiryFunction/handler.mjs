import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({ region: process.env.AWS_REGION || "eu-west-2" });

const MAX_MESSAGE = 5000;
const MAX_NAME = 200;
const MAX_EMAIL = 200;
const MAX_ORG = 200;
const MAX_PAGE_URL = 500;
const MAX_USER_AGENT = 300;
const MAX_CONTEXT = 4000;

function clamp(value, max) {
  if (!value) return "";
  return value.toString().trim().slice(0, max);
}

function isValidEmail(value) {
  return typeof value === "string" && value.includes("@") && value.length <= MAX_EMAIL;
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    },
    body: JSON.stringify(body),
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

export async function handler(event, context) {
  try {
    if (!event?.body) {
      return response(400, { ok: false, error: "Missing request body." });
    }

    let payload;
    try {
      payload = JSON.parse(event.body);
    } catch {
      return response(400, { ok: false, error: "Invalid JSON body." });
    }

    const name = clamp(payload.name, MAX_NAME);
    const email = clamp(payload.email, MAX_EMAIL);
    const organisation = clamp(payload.organisation, MAX_ORG);
    const message = clamp(payload.message, MAX_MESSAGE);
    const pageUrl = clamp(payload.pageUrl, MAX_PAGE_URL);
    const userAgent = clamp(payload.userAgent, MAX_USER_AGENT);
    const timestampIso = clamp(payload.timestampIso, 50);
    const contextText = stringifyContext(payload.context);

    if (!name) return response(400, { ok: false, error: "Name is required." });
    if (!email || !isValidEmail(email)) return response(400, { ok: false, error: "Valid email is required." });
    if (!message) return response(400, { ok: false, error: "Message is required." });

    const toEmail = process.env.TO_EMAIL || "paul@politicalsolutions.uk";
    const fromEmail = process.env.FROM_EMAIL;
    if (!fromEmail) {
      return response(500, { ok: false, error: "Server email configuration missing." });
    }

    const emailBody = [
      "New enquiry received",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
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
    ].filter(Boolean).join("\n");

    const subject = `Political Solutions enquiry - ${name}${organisation ? ` / ${organisation}` : ""}`;

    const result = await ses.send(
      new SendEmailCommand({
        Destination: { ToAddresses: [toEmail] },
        Message: {
          Body: { Text: { Data: emailBody } },
          Subject: { Data: subject },
        },
        Source: fromEmail,
        ReplyToAddresses: [email],
      })
    );

    const requestId = result?.MessageId || context?.awsRequestId || "";
    return response(200, { ok: true, requestId });
  } catch (err) {
    console.error("Handler error:", err);
    return response(500, { ok: false, error: "Internal Server Error" });
  }
}
