/**
 * MP Persona Generator Lambda — dual-mode.
 *
 * Modes:
 *   "persona" — fetch Parliament + Hansard + Wikipedia + press releases,
 *               run two Anthropic calls, return { systemPrompt, mpName }.
 *   "draft"   — single Anthropic call with the saved system prompt and a
 *               user-provided context, return { generatedText }.
 *
 * Wire-level layout:
 *   POST <function-url>           → create job for mode, return { jobId }.
 *   GET  <function-url>/{jobId}   → poll the DynamoDB job item.
 *   Internal async event          → run the pipeline and update the item.
 *
 * Timeout: 300s. Requires ANTHROPIC_API_KEY env var (set manually in the
 * Lambda console — not managed by CloudFormation).
 */

import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const REGION = process.env.AWS_REGION || "eu-west-2";
const PERSONA_JOBS_TABLE = process.env.PERSONA_JOBS_TABLE || "";
const PERSONA_JOB_TTL_SECONDS = Number(process.env.PERSONA_JOB_TTL_SECONDS || 86400);
const PERSONA_MAX_SYSTEM_PROMPT_CHARS = Number(
  process.env.PERSONA_MAX_SYSTEM_PROMPT_CHARS || 120000
);
const DRAFT_MAX_CONTEXT_CHARS = 4000;
const DRAFT_MAX_OUTPUT_CHARS = 12000;

const VALID_OUTPUT_TYPES = new Set([
  "email",
  "letter",
  "social_post",
  "speech_notes",
  "press_release",
]);

const OUTPUT_TYPE_LABEL = {
  email: "email",
  letter: "letter",
  social_post: "social media post",
  speech_notes: "set of speech notes",
  press_release: "press release",
};

const lambda = new LambdaClient({ region: REGION });
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

function corsHeaders(origin) {
  const isAllowed =
    ALLOWED_ORIGINS.length === 0 ||
    ALLOWED_ORIGINS.includes("*") ||
    ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin || "*" : ALLOWED_ORIGINS[0] || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  };
}

function respond(statusCode, body, origin) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    body: JSON.stringify(body),
  };
}

function getOrigin(event) {
  return event?.headers?.origin || event?.headers?.Origin || "";
}

function getHttpMethod(event) {
  return event?.requestContext?.http?.method || event?.httpMethod || "";
}

function getPath(event) {
  return event?.rawPath || event?.path || event?.requestContext?.http?.path || "";
}

function parseJsonBody(event) {
  const raw = event?.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event?.body || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Invalid JSON body.");
    err.statusCode = 400;
    throw err;
  }
}

function requireJobsTable() {
  if (!PERSONA_JOBS_TABLE) {
    throw new Error("PERSONA_JOBS_TABLE environment variable is not set.");
  }
}

function nowIso() {
  return new Date().toISOString();
}

function validateMpName(value) {
  const mpName = typeof value === "string" ? value.trim() : "";
  if (!mpName) {
    const err = new Error("mpName is required.");
    err.statusCode = 400;
    throw err;
  }
  if (mpName.length > 120) {
    const err = new Error("mpName must be 120 characters or fewer.");
    err.statusCode = 400;
    throw err;
  }
  return mpName;
}

function validateOnsCode(value) {
  const ons = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!ons) {
    const err = new Error("onsCode is required.");
    err.statusCode = 400;
    throw err;
  }
  if (!/^[A-Z0-9]{1,16}$/.test(ons)) {
    const err = new Error("onsCode is not a valid PCON code.");
    err.statusCode = 400;
    throw err;
  }
  return ons;
}

function validateOutputType(value) {
  const outputType = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!VALID_OUTPUT_TYPES.has(outputType)) {
    const err = new Error("outputType must be one of email, letter, social_post, speech_notes, press_release.");
    err.statusCode = 400;
    throw err;
  }
  return outputType;
}

function validateSystemPrompt(value) {
  const prompt = typeof value === "string" ? value : "";
  if (!prompt.trim()) {
    const err = new Error("systemPrompt is required.");
    err.statusCode = 400;
    throw err;
  }
  return prompt.slice(0, PERSONA_MAX_SYSTEM_PROMPT_CHARS);
}

function validateContext(value) {
  const context = typeof value === "string" ? value.trim() : "";
  if (!context) {
    const err = new Error("context is required.");
    err.statusCode = 400;
    throw err;
  }
  if (context.length > DRAFT_MAX_CONTEXT_CHARS) {
    const err = new Error(`context must be ${DRAFT_MAX_CONTEXT_CHARS} characters or fewer.`);
    err.statusCode = 400;
    throw err;
  }
  return context;
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PoliticalSolutions/1.0)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": "PoliticalSolutions/1.0" },
    signal: AbortSignal.timeout(15000),
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

// ── Persona pipeline — scraping + Anthropic ───────────────────────────────────

async function getMemberId(mpName) {
  const url = `https://members-api.parliament.uk/api/Members/Search?Name=${encodeURIComponent(mpName)}&IsCurrentMember=true`;
  const data = await fetchJson(url);
  const items = data?.items || [];
  if (items.length === 0) {
    throw new Error(`No current MP found for "${mpName}". Check the spelling matches the Parliament website.`);
  }
  const member = items[0].value;
  console.log(`[persona] Found: ${member.nameDisplayAs} (ID: ${member.id})`);
  return member.id;
}

async function scrapeHansard(memberId) {
  const texts = [];
  for (let page = 1; page <= 10; page++) {
    try {
      const url = `https://hansard.parliament.uk/search/Contributions?memberId=${memberId}&house=Commons&page=${page}`;
      const html = await fetchText(url);
      const text = htmlToText(html);
      const slice = text.slice(Math.min(text.indexOf("Contribution"), 2000)).slice(0, 6000);
      if (slice.length > 200) texts.push(`[Hansard page ${page}]\n${slice}`);
    } catch (err) {
      console.log(`[persona] Hansard page ${page} failed: ${err.message}`);
      if (page === 1) throw new Error(`Could not fetch Hansard contributions: ${err.message}`);
      break;
    }
  }
  return texts.join("\n\n");
}

async function fetchWikipedia(mpName) {
  try {
    const title = mpName.trim().replace(/ /g, "_");
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&titles=${encodeURIComponent(title)}&exsectionformat=plain`;
    const data = await fetchJson(url);
    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];
    if (!page || page.missing !== undefined) {
      console.log(`[persona] Wikipedia: no page for "${mpName}"`);
      return "";
    }
    return (page.extract || "").slice(0, 15000);
  } catch (err) {
    console.log(`[persona] Wikipedia failed: ${err.message}`);
    return "";
  }
}

async function fetchPressReleases(mpName) {
  const namePart = mpName.toLowerCase().replace(/\s+/g, "");
  const candidates = [
    `https://${namePart}mp.com/news`,
    `https://${namePart}mp.co.uk/news`,
    `https://www.${namePart}mp.com/press-releases`,
    `https://${namePart}mp.com/press-releases`,
  ];
  for (const url of candidates) {
    try {
      const html = await fetchText(url);
      const text = htmlToText(html).slice(0, 8000);
      if (text.length > 500) {
        console.log(`[persona] Press releases found at ${url}`);
        return text;
      }
    } catch {
      // Try next candidate silently
    }
  }
  console.log(`[persona] Press releases: no URL found for "${mpName}", skipping`);
  return "";
}

async function anthropicCall(userMessage, systemPrompt, { maxTokens = 4096 } = {}) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text || "";
  if (!text) throw new Error("Anthropic returned an empty response.");
  return text;
}

async function buildStyleGuide(corpus, mpName) {
  return anthropicCall(
    `MP NAME: ${mpName}\n\nCORPUS:\n${corpus.slice(0, 80000)}`,
    `You are a political communications analyst specialising in building MP writing personas for campaign literature. Analyse the following corpus of speeches, press releases and public statements and produce a comprehensive Writing Style Guide in this structure:

1. Background Context (career, committees, ministerial roles, current position)
2. Voice & Tone
3. Sentence Structure
4. Recurring Phrases & Vocabulary
5. Argumentative Frameworks
6. Key Themes & Issues (ranked by frequency)
7. Place Names & Local Institutions
8. Format by Document Type
9. What They Never Say / Avoid
10. Sample Sentences In Their Style (6 minimum)

Be specific. Quote actual phrases from the corpus. Every observation must be evidenced from the source material.`
  );
}

async function buildSystemPrompt(styleGuide, mpName) {
  return anthropicCall(
    `Convert this Writing Style Guide into a deployable AI agent system prompt. Requirements:
- Written in second person (You are ${mpName}...)
- Encodes voice, tone, phrases, frameworks and format rules as direct instructions
- Under 1,500 words
- Ends with: Write the output directly as ${mpName} with no preamble or explanation. First person throughout.

Output the system prompt only. No preamble.

STYLE GUIDE:
${styleGuide}`,
    "You are an expert AI prompt engineer specialising in political communications."
  );
}

async function runPersonaPipeline(mpName) {
  console.log(`[persona] Starting pipeline for: ${mpName}`);

  const memberId = await getMemberId(mpName);

  const hansardText = await scrapeHansard(memberId);
  console.log(`[persona] Hansard: ${hansardText.length} chars`);

  const wikiText = await fetchWikipedia(mpName);
  console.log(`[persona] Wikipedia: ${wikiText.length} chars`);

  const pressText = await fetchPressReleases(mpName);
  console.log(`[persona] Press: ${pressText.length} chars`);

  const corpus = [
    hansardText ? `=== HANSARD CONTRIBUTIONS ===\n${hansardText}` : "",
    wikiText ? `=== WIKIPEDIA BIOGRAPHY ===\n${wikiText}` : "",
    pressText ? `=== PRESS RELEASES ===\n${pressText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  if (corpus.length < 500) {
    throw new Error(
      "Insufficient source material found. The MP name may not match Parliament records exactly."
    );
  }
  console.log(`[persona] Corpus: ${corpus.length} chars`);

  const styleGuide = await buildStyleGuide(corpus, mpName);
  console.log(`[persona] Style guide: ${styleGuide.length} chars`);

  const rawSystemPrompt = await buildSystemPrompt(styleGuide, mpName);
  const systemPrompt = rawSystemPrompt.slice(0, PERSONA_MAX_SYSTEM_PROMPT_CHARS);
  console.log(`[persona] Done. System prompt: ${systemPrompt.length} chars`);

  return {
    systemPrompt,
    mpName,
    truncated: rawSystemPrompt.length > systemPrompt.length,
  };
}

async function runDraftPipeline({ systemPrompt, outputType, context }) {
  const label = OUTPUT_TYPE_LABEL[outputType] || outputType;
  const userMessage = `Draft a ${label} for this MP. Context: ${context}. Write in the MP's authentic voice. Output only the final draft text, no preamble.`;
  const text = await anthropicCall(userMessage, systemPrompt, { maxTokens: 1500 });
  return { generatedText: text.slice(0, DRAFT_MAX_OUTPUT_CHARS) };
}

// ── DynamoDB job lifecycle ────────────────────────────────────────────────────

async function putPendingJob({ jobId, mode, attributes = {} }) {
  requireJobsTable();
  const createdAt = nowIso();
  const ttl = Math.floor(Date.now() / 1000) + PERSONA_JOB_TTL_SECONDS;
  await dynamo.send(
    new PutCommand({
      TableName: PERSONA_JOBS_TABLE,
      Item: {
        jobId,
        status: "pending",
        mode,
        createdAt,
        updatedAt: createdAt,
        ttl,
        ...attributes,
      },
      ConditionExpression: "attribute_not_exists(jobId)",
    })
  );
}

async function getJobItem(jobId) {
  requireJobsTable();
  const result = await dynamo.send(
    new GetCommand({
      TableName: PERSONA_JOBS_TABLE,
      Key: { jobId },
    })
  );
  return result.Item || null;
}

async function updateJob(jobId, status, attributes = {}) {
  requireJobsTable();
  const names = { "#status": "status", "#updatedAt": "updatedAt" };
  const values = { ":status": status, ":updatedAt": nowIso() };
  const sets = ["#status = :status", "#updatedAt = :updatedAt"];

  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    const nameKey = `#${key}`;
    const valueKey = `:${key}`;
    names[nameKey] = key;
    values[valueKey] = value;
    sets.push(`${nameKey} = ${valueKey}`);
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: PERSONA_JOBS_TABLE,
      Key: { jobId },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  );
}

async function markJobRunning(jobId) {
  await updateJob(jobId, "running", { startedAt: nowIso() });
}

async function markJobError(jobId, error) {
  await updateJob(jobId, "error", {
    error: String(error || "Persona generation failed.").slice(0, 2000),
    failedAt: nowIso(),
  });
}

// ── HTTP routing ──────────────────────────────────────────────────────────────

async function startJob(event, origin) {
  let jobId = "";
  try {
    const body = parseJsonBody(event);
    const mode = (typeof body.mode === "string" && body.mode.trim()) || "persona";

    if (mode !== "persona" && mode !== "draft") {
      return respond(400, { error: "mode must be 'persona' or 'draft'." }, origin);
    }

    jobId = randomUUID();
    let asyncPayload;

    if (mode === "persona") {
      const mpName = validateMpName(body.mpName);
      const onsCode = validateOnsCode(body.onsCode);
      await putPendingJob({ jobId, mode, attributes: { mpName, onsCode } });
      asyncPayload = { __asyncPersonaJob: true, jobId, mode, mpName, onsCode };
    } else {
      const systemPrompt = validateSystemPrompt(body.systemPrompt);
      const outputType = validateOutputType(body.outputType);
      const context = validateContext(body.context);
      await putPendingJob({ jobId, mode, attributes: { outputType } });
      asyncPayload = {
        __asyncPersonaJob: true,
        jobId,
        mode,
        systemPrompt,
        outputType,
        context,
      };
    }

    await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify(asyncPayload)),
      })
    );

    return respond(202, { jobId }, origin);
  } catch (err) {
    console.error(`[persona] Failed to start job: ${err.message}`);
    if (jobId) {
      await markJobError(jobId, `Failed to start async job: ${err.message}`).catch((updateErr) => {
        console.error(`[persona] Failed to mark start failure for ${jobId}: ${updateErr.message}`);
      });
    }
    return respond(err.statusCode || 500, { error: err.message || "Failed to start persona job." }, origin);
  }
}

async function pollJob(event, origin) {
  const jobId = event?.pathParameters?.jobId || getPath(event).split("/").filter(Boolean).at(-1) || "";
  if (!jobId) return respond(400, { error: "jobId is required." }, origin);

  try {
    const item = await getJobItem(jobId);
    if (!item) return respond(404, { error: "Persona job not found." }, origin);
    return respond(200, item, origin);
  } catch (err) {
    console.error(`[persona] Failed to read job ${jobId}: ${err.message}`);
    return respond(500, { error: err.message || "Failed to read persona job." }, origin);
  }
}

async function runAsyncJob(event) {
  const jobId = event?.jobId || "";
  const mode = event?.mode || "persona";
  if (!jobId) {
    console.error("[persona] Async event missing jobId");
    return { ok: false };
  }

  try {
    const existing = await getJobItem(jobId);
    if (!existing) {
      console.error(`[persona] Async job ${jobId} not found`);
      return { ok: false };
    }
    if (existing.status === "complete") {
      console.log(`[persona] Async job ${jobId} already complete; skipping duplicate event`);
      return { ok: true, skipped: true };
    }
    if (existing.status === "running") {
      console.log(`[persona] Async job ${jobId} already running; skipping duplicate event`);
      return { ok: true, skipped: true };
    }

    await markJobRunning(jobId);

    if (mode === "draft") {
      const result = await runDraftPipeline({
        systemPrompt: event.systemPrompt,
        outputType: event.outputType,
        context: event.context,
      });
      await updateJob(jobId, "complete", {
        generatedText: result.generatedText,
        completedAt: nowIso(),
      });
      return { ok: true };
    }

    const result = await runPersonaPipeline(event.mpName);
    await updateJob(jobId, "complete", {
      systemPrompt: result.systemPrompt,
      mpName: result.mpName,
      onsCode: event.onsCode,
      completedAt: nowIso(),
      truncated: result.truncated,
    });
    return { ok: true };
  } catch (err) {
    console.error(`[persona] Async job ${jobId} failed: ${err.message}`);
    await markJobError(jobId, err.message).catch((updateErr) => {
      console.error(`[persona] Failed to mark async job ${jobId} error: ${updateErr.message}`);
    });
    return { ok: false };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event = {}) => {
  if (event.__asyncPersonaJob === true) {
    return runAsyncJob(event);
  }

  const origin = getOrigin(event);
  const method = getHttpMethod(event);
  const path = getPath(event);
  const routeKey = event?.routeKey || "";

  if (method === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(origin), body: "" };
  }

  if (method === "POST") {
    return startJob(event, origin);
  }

  if (
    method === "GET" &&
    (event?.pathParameters?.jobId || routeKey === "GET /persona/{jobId}" || /\/[A-Za-z0-9-]+$/.test(path))
  ) {
    return pollJob(event, origin);
  }

  return respond(404, { error: "Unsupported persona route." }, origin);
};
