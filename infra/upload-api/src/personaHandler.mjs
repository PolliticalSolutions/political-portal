/**
 * MP Persona Generator Lambda
 *
 * Invoked via Lambda Function URL (not API Gateway — bypasses 29s timeout).
 * Timeout: 300s. Requires ANTHROPIC_API_KEY env var.
 *
 * POST body: { mpName: string }
 * Response:  { systemPrompt: string, mpName: string }
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin) {
  const isAllowed =
    ALLOWED_ORIGINS.length === 0 ||
    ALLOWED_ORIGINS.includes("*") ||
    ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin || "*" : ALLOWED_ORIGINS[0] || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function respond(statusCode, body, origin) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    body: JSON.stringify(body),
  };
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

// ── Step 1: Parliament Members API ────────────────────────────────────────────

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

// ── Step 2: Hansard contributions (pages 1–10) ────────────────────────────────

async function scrapeHansard(memberId) {
  const texts = [];
  for (let page = 1; page <= 10; page++) {
    try {
      const url = `https://hansard.parliament.uk/search/Contributions?memberId=${memberId}&house=Commons&page=${page}`;
      const html = await fetchText(url);
      const text = htmlToText(html);
      // Take a meaningful chunk from each page, avoiding nav/header boilerplate
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

// ── Step 3: Wikipedia ─────────────────────────────────────────────────────────

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

// ── Step 4: Press releases (best effort, skip on failure) ────────────────────

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

// ── Steps 6 & 7: Anthropic API ────────────────────────────────────────────────

async function anthropicCall(userMessage, systemPrompt) {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
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

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const method = event.requestContext?.http?.method || event.httpMethod || "";

  if (method === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(origin), body: "" };
  }

  let mpName;
  try {
    const body = JSON.parse(event.body || "{}");
    mpName = (body.mpName || "").trim();
  } catch {
    return respond(400, { error: "Invalid JSON body." }, origin);
  }

  if (!mpName) {
    return respond(400, { error: "mpName is required." }, origin);
  }

  console.log(`[persona] Starting pipeline for: ${mpName}`);

  try {
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

    const systemPrompt = await buildSystemPrompt(styleGuide, mpName);
    console.log(`[persona] Done. System prompt: ${systemPrompt.length} chars`);

    return respond(200, { systemPrompt, mpName }, origin);
  } catch (err) {
    console.error(`[persona] Error: ${err.message}`);
    return respond(500, { error: err.message }, origin);
  }
};
