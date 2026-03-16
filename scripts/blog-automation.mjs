import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPublishedBlogPosts } from "./blog-content.mjs";
import { parseBlogFrontmatter } from "../src/blog/frontmatter.js";

export const BLOG_AUTOMATION_DEFAULTS = {
  autoPublish: false,
  requireClaudeReview: true,
  requireHumanReview: true,
  cadenceDays: 3,
  minimumWordCount: 800,
  targetWordCount: [1200, 2000],
};

export const BLOG_TOPIC_STATUSES = [
  "queued",
  "researching",
  "drafted",
  "claude_reviewed",
  "human_review_required",
  "approved",
  "published",
  "failed",
  "skipped",
];

const BLOG_CATEGORIES = new Set([
  "Marked registers and electoral data",
  "By-election preparation and execution",
  "Constituency data operations",
  "Association digital workflows",
  "Voter contact and canvassing operations",
  "Political technology for campaign teams",
  "Data hygiene and campaign process",
  "Legal and compliance (electoral law, spending returns, etc.)",
  "Candidate and agent operations",
  "Communication and targeting",
]);

const AUTHORITATIVE_SOURCE_PATTERNS = [
  /(^|\.)electoralcommission\.org\.uk$/i,
  /(^|\.)parliament\.uk$/i,
  /(^|\.)legislation\.gov\.uk$/i,
  /(^|\.)ons\.gov\.uk$/i,
  /(^|\.)gov\.uk$/i,
  /(^|\.)org\.uk$/i,
];

const FILLER_PATTERNS = [
  /in today'?s fast-paced political landscape/i,
  /in conclusion[, ]/i,
  /it is clear that/i,
  /have you ever wondered/i,
];

const BAD_OPENING_PATTERNS = [
  /^\s*[^.!?]+\?\s*$/m,
  /^\s*(a|an|the)\s+[^.?!]+?\s+(is|are)\s+/i,
];

const PLACEHOLDER_PATTERN = /(example|placeholder|lorem ipsum|todo|tbd|fake|invented)/i;
const URL_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const HEADING_PATTERN = /^##\s+/gm;

const defaultRoot = path.resolve(".");

const readJson = (filePath) => JSON.parse(readFileSync(filePath, "utf8"));

const ensureDir = async (directoryPath) => {
  await mkdir(directoryPath, { recursive: true });
};

const safeDate = (value) => new Date(`${value}T00:00:00Z`);

const todayIso = (now = new Date()) => now.toISOString().split("T")[0];

export const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

export const getAutomationPaths = (rootDir = defaultRoot) => ({
  rootDir,
  blogDir: path.join(rootDir, "content", "blog"),
  automationDir: path.join(rootDir, "content", "blog-automation"),
  topicsFile: path.join(rootDir, "content", "blog-automation", "topics.json"),
  researchDir: path.join(rootDir, "content", "blog-automation", "research"),
  sourcesDir: path.join(rootDir, "content", "blog-automation", "sources"),
  reviewsDir: path.join(rootDir, "content", "blog-automation", "reviews"),
  handoffsDir: path.join(rootDir, "content", "blog-automation", "handoffs"),
  humanReviewsDir: path.join(rootDir, "content", "blog-automation", "human-reviews"),
});

const topicField = (topic, camelKey, snakeKey = camelKey) => topic[camelKey] ?? topic[snakeKey];

export const loadTopicBacklog = (topicsFilePath) => {
  const payload = readJson(topicsFilePath);
  if (!Array.isArray(payload.topics)) {
    throw new Error(`Topic backlog must expose a topics array: ${topicsFilePath}`);
  }

  const seenIds = new Set();

  for (const topic of payload.topics) {
    const titleSeed = topicField(topic, "titleSeed", "title_seed");
    const slugSeed = topicField(topic, "slugSeed", "slug_seed");
    const category = topicField(topic, "category");
    const status = topicField(topic, "status");

    if (!topic?.id || !titleSeed || !slugSeed) {
      throw new Error(`Topic is missing id/titleSeed/slugSeed: ${JSON.stringify(topic)}`);
    }
    if (seenIds.has(topic.id)) {
      throw new Error(`Duplicate topic id found in backlog: ${topic.id}`);
    }
    if (!BLOG_TOPIC_STATUSES.includes(status)) {
      throw new Error(`Unsupported topic status "${status}" for topic ${topic.id}`);
    }
    if (!BLOG_CATEGORIES.has(category)) {
      throw new Error(`Unsupported topic category "${category}" for topic ${topic.id}`);
    }
    seenIds.add(topic.id);
  }

  return payload;
};

export const saveTopicBacklog = async (topicsFilePath, payload) => {
  await ensureDir(path.dirname(topicsFilePath));
  await writeFile(topicsFilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

export const getMostRecentPublishedDate = (posts = getPublishedBlogPosts()) => {
  const firstPost = posts[0];
  return firstPost ? firstPost.meta.publishDate || firstPost.meta.date : null;
};

export const getCadenceState = ({
  posts = getPublishedBlogPosts(),
  cadenceDays = BLOG_AUTOMATION_DEFAULTS.cadenceDays,
  now = new Date(),
} = {}) => {
  const latestPublishedDate = getMostRecentPublishedDate(posts);

  if (!latestPublishedDate) {
    return {
      due: true,
      daysSinceLastPublished: null,
      latestPublishedDate: null,
      nextEligibleDate: todayIso(now),
    };
  }

  const nowUtc = safeDate(todayIso(now));
  const latestUtc = safeDate(latestPublishedDate);
  const daysSinceLastPublished = Math.floor((nowUtc.getTime() - latestUtc.getTime()) / 86400000);
  const nextEligible = new Date(latestUtc.getTime() + cadenceDays * 86400000);

  return {
    due: daysSinceLastPublished >= cadenceDays,
    daysSinceLastPublished,
    latestPublishedDate,
    nextEligibleDate: todayIso(nextEligible),
  };
};

export const isAuthoritativeSource = (url) => {
  try {
    const hostname = new URL(url).hostname;
    return AUTHORITATIVE_SOURCE_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
};

export const validateSourceBundle = (bundle) => {
  const errors = [];
  const warnings = [];

  if (!bundle?.topicId) {
    errors.push("Source bundle is missing topicId.");
  }
  if (!Array.isArray(bundle?.sources) || bundle.sources.length === 0) {
    errors.push("Source bundle must include at least one source.");
  }

  const ids = new Set();
  let authoritativeCount = 0;

  for (const source of bundle?.sources || []) {
    if (!source?.id || !source?.title || !source?.url) {
      errors.push(`Source entry is missing id/title/url: ${JSON.stringify(source)}`);
      continue;
    }
    if (ids.has(source.id)) {
      errors.push(`Duplicate source id "${source.id}" in source bundle.`);
    }
    ids.add(source.id);

    if (PLACEHOLDER_PATTERN.test(source.title) || PLACEHOLDER_PATTERN.test(source.url)) {
      errors.push(`Source "${source.id}" looks like a placeholder.`);
    }

    try {
      new URL(source.url);
    } catch {
      errors.push(`Source "${source.id}" has a malformed URL.`);
      continue;
    }

    if (isAuthoritativeSource(source.url)) {
      authoritativeCount += 1;
    }
  }

  if ((bundle?.sources || []).length > 0 && authoritativeCount === 0) {
    warnings.push("No preferred authoritative sources were detected in the bundle.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

export const loadResearchBundle = (researchDir, topicId) => {
  const researchFile = path.join(researchDir, `${topicId}.json`);
  if (!existsSync(researchFile)) {
    return null;
  }
  return readJson(researchFile);
};

export const selectNextEligibleTopic = ({ topics, researchDir }) => {
  const candidates = [...topics]
    .filter((topic) => {
      const status = topicField(topic, "status");
      return status === "queued" || status === "researching";
    })
    .sort(
      (left, right) =>
        Number(topicField(right, "priority") || 0) - Number(topicField(left, "priority") || 0)
    );

  for (const topic of candidates) {
    const researchBundle = loadResearchBundle(researchDir, topic.id);
    if (!researchBundle) {
      continue;
    }

    const sourceValidation = validateSourceBundle(researchBundle);
    if (!sourceValidation.valid) {
      return {
        topic,
        researchBundle,
        sourceValidation,
      };
    }

    return {
      topic,
      researchBundle,
      sourceValidation,
    };
  }

  return null;
};

export const extractMarkdownLinks = (content) => {
  const links = [];
  for (const match of content.matchAll(URL_PATTERN)) {
    links.push({
      label: match[1],
      url: match[2],
    });
  }
  return links;
};

const getMainParagraphs = (content) =>
  content
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter(
      (paragraph) =>
        !paragraph.startsWith("#") &&
        !paragraph.startsWith("- ") &&
        !paragraph.startsWith("* ") &&
        !paragraph.match(/^\d+\.\s+/) &&
        !paragraph.startsWith(">") &&
        !paragraph.startsWith("```")
    );

const countWords = (content) =>
  content
    .replace(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean).length;

const hasActionLanguage = (content) =>
  /\b(you should|use this|do this|start by|check|compare|download|record|review|map|export|audit|prioritise|prioritize|decide)\b/i.test(
    content
  );

export const validateArticleContent = ({
  content,
  frontmatter,
  sourceBundle,
  existingPosts = [],
  minimumWordCount = BLOG_AUTOMATION_DEFAULTS.minimumWordCount,
} = {}) => {
  const errors = [];
  const warnings = [];
  const normalizedContent = String(content || "").trim();
  const normalizedTitle = String(frontmatter?.title || "").trim();
  const normalizedSlug = String(frontmatter?.slug || "").trim();
  const normalizedDescription = String(frontmatter?.description || "").trim();

  if (!normalizedTitle) errors.push("Frontmatter is missing title.");
  if (!normalizedSlug) errors.push("Frontmatter is missing slug.");
  if (!normalizedDescription) errors.push("Frontmatter is missing description.");
  if (!frontmatter?.date) errors.push("Frontmatter is missing date.");

  const duplicateTitle = existingPosts.find(
    (post) => post.meta.title.toLowerCase() === normalizedTitle.toLowerCase()
  );
  if (duplicateTitle) {
    errors.push(`Title duplicates an existing title: ${duplicateTitle.meta.title}`);
  }

  const duplicateSlug = existingPosts.find((post) => post.slug === normalizedSlug);
  if (duplicateSlug) {
    errors.push(`Slug duplicates an existing slug: ${duplicateSlug.slug}`);
  }

  const wordCount = countWords(normalizedContent);
  if (wordCount < minimumWordCount) {
    errors.push(`Word count ${wordCount} is below the minimum threshold of ${minimumWordCount}.`);
  }

  if ((normalizedContent.match(HEADING_PATTERN) || []).length < 3) {
    errors.push("Article must include at least three informative H2 headings.");
  }

  if (!/^##\s+Sources$/m.test(normalizedContent)) {
    errors.push('Article must end with a "## Sources" section.');
  }

  const paragraphs = getMainParagraphs(normalizedContent);
  const openingParagraph = paragraphs[0] || "";

  if (BAD_OPENING_PATTERNS.some((pattern) => pattern.test(openingParagraph))) {
    errors.push("Article opens with a rhetorical question or definition-style sentence.");
  }

  if (FILLER_PATTERNS.some((pattern) => pattern.test(normalizedContent))) {
    errors.push("Article contains banned filler language.");
  }

  if (!hasActionLanguage(normalizedContent)) {
    errors.push("Article does not contain a clear actionable takeaway.");
  }

  const links = extractMarkdownLinks(normalizedContent);
  if (links.length === 0) {
    errors.push("Article contains no inline citations.");
  }

  const factualParagraphsWithoutLinks = paragraphs
    .slice(0, Math.max(paragraphs.length - 1, 0))
    .filter((paragraph) => /[a-z]/i.test(paragraph))
    .filter((paragraph) => !paragraph.includes("]("))
    .filter((paragraph) => !paragraph.startsWith("For "))
    .filter((paragraph) => !paragraph.startsWith("To "));

  if (factualParagraphsWithoutLinks.length > 0) {
    errors.push("One or more factual paragraphs do not include an inline citation.");
  }

  const sourceValidation = validateSourceBundle(sourceBundle);
  errors.push(...sourceValidation.errors);
  warnings.push(...sourceValidation.warnings);

  for (const source of sourceBundle?.sources || []) {
    if (!normalizedContent.includes(source.url)) {
      errors.push(`Source "${source.id}" is not cited in the article body or sources section.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    wordCount,
  };
};

const yamlValue = (value) => {
  if (typeof value === "boolean") return value ? "true" : "false";
  return `"${String(value).replace(/"/g, '\\"')}"`;
};

export const renderFrontmatter = (meta) => {
  const lines = [
    "---",
    `title: ${yamlValue(meta.title)}`,
    `slug: ${yamlValue(meta.slug)}`,
    `description: ${yamlValue(meta.description)}`,
    `date: ${yamlValue(meta.date)}`,
    `publishDate: ${yamlValue(meta.publishDate || "")}`,
    `author: ${yamlValue(meta.author || "Political Solutions")}`,
    "tags:",
    ...(meta.tags || []).map((tag) => `  - ${yamlValue(tag)}`),
    `draft: ${meta.draft ? "true" : "false"}`,
    `canonical: ${yamlValue(meta.canonical || "")}`,
    `reviewStatus: ${yamlValue(meta.reviewStatus)}`,
    `claudeReviewStatus: ${yamlValue(meta.claudeReviewStatus)}`,
    `topicId: ${yamlValue(meta.topicId)}`,
    `sourceCount: ${Number(meta.sourceCount || 0)}`,
    "sourceBundles:",
    ...(meta.sourceBundles || []).map((bundle) => `  - ${yamlValue(bundle)}`),
    `humanReviewRequired: ${meta.humanReviewRequired ? "true" : "false"}`,
    `humanApproved: ${meta.humanApproved ? "true" : "false"}`,
    `automationManaged: ${meta.automationManaged ? "true" : "false"}`,
    "---",
  ];

  return `${lines.join("\n")}\n`;
};

export const renderBlogFile = ({ frontmatter, content }) =>
  `${renderFrontmatter(frontmatter)}\n${String(content).trim()}\n`;

export const createGenerationPrompt = ({ topic, sourceBundle }) => `
You are writing for UK political campaign professionals.

Audience:
- ${topicField(topic, "audience")}
- Operational hook: ${topicField(topic, "operationalHook", "operational_hook")}
- Search intent: ${topicField(topic, "searchIntent", "search_intent")}

Hard requirements:
- UK English only
- Plain-spoken, practical, authoritative tone
- No rhetorical question opener
- No definition-style opener
- No sales language
- No filler or throat-clearing
- Minimum 800 words, target 1200-2000
- Every factual claim must be followed by an inline markdown citation link to one of the supplied sources
- Use informative H2 headings
- Include at least one actionable takeaway per major section
- Include a specific, earned CTA
- End with a "## Sources" section listing every supplied source

Output JSON with:
- title
- slug
- description
- tags
- content

Topic:
${JSON.stringify(topic, null, 2)}

Sources:
${JSON.stringify(sourceBundle.sources, null, 2)}
`.trim();

const createClaudeReviewPrompt = ({ article, sourceBundle }) => `
Review this draft for publication on Political Solutions.

Return JSON with:
- summary
- factualRisks
- unsupportedClaims
- citationSufficiency
- toneAndQuality
- structure
- recommendation

Allowed recommendation values: PASS, REVISE, FAIL

Source metadata:
${JSON.stringify(sourceBundle.sources, null, 2)}

Draft frontmatter:
${JSON.stringify(article.frontmatter, null, 2)}

Draft content:
${article.content}
`.trim();

const callAnthropic = async ({ apiKey, model, prompt, maxTokens = 2200 }) => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${payload}`);
  }

  const payload = await response.json();
  const text = payload?.content?.map((item) => item.text || "").join("\n").trim();
  if (!text) {
    throw new Error("Anthropic response did not include text content.");
  }

  return text;
};

export const generateArticleDraft = async ({
  topic,
  sourceBundle,
  now = new Date(),
  anthropicApiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.BLOG_GENERATION_MODEL || process.env.CLAUDE_MODEL || "claude-3-7-sonnet-latest",
} = {}) => {
  const prompt = createGenerationPrompt({ topic, sourceBundle });
  if (!anthropicApiKey) {
    return {
      status: "handoff_required",
      prompt,
      model,
      reason: "ANTHROPIC_API_KEY is not configured for article generation.",
    };
  }

  const responseText = await callAnthropic({
    apiKey: anthropicApiKey,
    model,
    prompt,
    maxTokens: 3200,
  });

  const parsed = JSON.parse(responseText);
  const frontmatter = {
    title: parsed.title,
    slug: parsed.slug || slugify(topicField(topic, "slugSeed", "slug_seed")),
    description: parsed.description,
    date: todayIso(now),
    publishDate: "",
    author: "Political Solutions",
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    draft: true,
    canonical: "",
    reviewStatus: "drafted",
    claudeReviewStatus: "pending",
    topicId: topic.id,
    sourceCount: sourceBundle.sources.length,
    sourceBundles: [sourceBundle.topicId],
    humanReviewRequired: true,
    humanApproved: false,
    automationManaged: true,
  };

  return {
    status: "generated",
    frontmatter,
    content: String(parsed.content || "").trim(),
    prompt,
    model,
  };
};

export const runClaudeReview = async ({
  article,
  sourceBundle,
  anthropicApiKey = process.env.ANTHROPIC_API_KEY,
  model = process.env.CLAUDE_REVIEW_MODEL || process.env.CLAUDE_MODEL || "claude-3-7-sonnet-latest",
} = {}) => {
  const prompt = createClaudeReviewPrompt({ article, sourceBundle });
  if (!anthropicApiKey) {
    return {
      status: "handoff_required",
      prompt,
      model,
      reason: "ANTHROPIC_API_KEY is not configured for Claude review.",
    };
  }

  const responseText = await callAnthropic({
    apiKey: anthropicApiKey,
    model,
    prompt,
    maxTokens: 1800,
  });

  const parsed = JSON.parse(responseText);
  return {
    status: "reviewed",
    review: {
      summary: parsed.summary || "",
      factualRisks: Array.isArray(parsed.factualRisks) ? parsed.factualRisks : [],
      unsupportedClaims: Array.isArray(parsed.unsupportedClaims) ? parsed.unsupportedClaims : [],
      citationSufficiency: parsed.citationSufficiency || "",
      toneAndQuality: parsed.toneAndQuality || "",
      structure: parsed.structure || "",
      recommendation: parsed.recommendation || "REVISE",
      model,
      reviewedAt: new Date().toISOString(),
    },
    prompt,
    model,
  };
};

export const evaluatePublishEligibility = ({
  validation,
  claudeReview,
  humanReview,
  buildSucceeded = true,
  requireClaudeReview = BLOG_AUTOMATION_DEFAULTS.requireClaudeReview,
  requireHumanReview = BLOG_AUTOMATION_DEFAULTS.requireHumanReview,
} = {}) => {
  const blockers = [];

  if (!validation?.valid) {
    blockers.push("Validation checks did not pass.");
  }
  if (requireClaudeReview && claudeReview?.recommendation !== "PASS") {
    blockers.push("Claude review has not returned PASS.");
  }
  if (requireHumanReview && humanReview?.decision !== "Publish") {
    blockers.push("Human review has not approved publication.");
  }
  if (!buildSucceeded) {
    blockers.push("Build or test verification has not succeeded.");
  }

  return {
    publishable: blockers.length === 0,
    blockers,
  };
};

export const createReviewArtifactMarkdown = ({ topic, validation, claudeReview, handoffReason }) => {
  const lines = [
    `# Blog Review Artifact: ${topicField(topic, "titleSeed", "title_seed")}`,
    "",
    `- Topic ID: ${topic.id}`,
    `- Validation: ${validation.valid ? "PASS" : "FAIL"}`,
    `- Claude status: ${claudeReview?.recommendation || "PENDING"}`,
  ];

  if (handoffReason) {
    lines.push(`- Handoff reason: ${handoffReason}`);
  }

  if (validation.errors.length > 0) {
    lines.push("", "## Validation Errors", "", ...validation.errors.map((item) => `- ${item}`));
  }

  if (claudeReview) {
    lines.push(
      "",
      "## Claude Summary",
      "",
      claudeReview.summary || "No summary returned.",
      "",
      "## Factual Risks",
      "",
      ...(claudeReview.factualRisks || []).map((item) => `- ${item}`),
      "",
      "## Unsupported Claims",
      "",
      ...(claudeReview.unsupportedClaims || []).map((item) => `- ${item}`)
    );
  }

  return `${lines.join("\n")}\n`;
};

const updateTopicStatus = (payload, topicId, status, extra = {}) => ({
  ...payload,
  topics: payload.topics.map((topic) =>
    topic.id === topicId ? { ...topic, status, ...extra } : topic
  ),
});

const rewriteFrontmatterValue = (source, key, value) => {
  const serialized = typeof value === "boolean" ? (value ? "true" : "false") : `"${value}"`;
  const pattern = new RegExp(`^${key}:\\s*.*$`, "m");
  if (pattern.test(source)) {
    return source.replace(pattern, `${key}: ${serialized}`);
  }
  return source.replace(/^---\n/, `---\n${key}: ${serialized}\n`);
};

export const recordHumanReviewDecision = async ({
  rootDir = defaultRoot,
  slug,
  reviewer,
  decision,
  notes = "",
  now = new Date(),
} = {}) => {
  const paths = getAutomationPaths(rootDir);
  await ensureDir(paths.humanReviewsDir);

  const artifact = {
    slug,
    reviewer,
    decision,
    notes,
    reviewedAt: now.toISOString(),
  };

  await writeFile(
    path.join(paths.humanReviewsDir, `${slug}.json`),
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8"
  );

  const blogFile = findBlogFileBySlug(paths.blogDir, slug);
  if (blogFile) {
    let source = readFileSync(blogFile, "utf8");
    source = rewriteFrontmatterValue(source, "humanApproved", decision === "Publish");
    source = rewriteFrontmatterValue(
      source,
      "reviewStatus",
      decision === "Publish" ? "approved" : decision === "Revise" ? "drafted" : "failed"
    );
    await writeFile(blogFile, source, "utf8");
  }

  return artifact;
};

const findBlogFileBySlug = (blogDir, slug) => {
  for (const extension of [".mdx", ".md"]) {
    const directPath = path.join(blogDir, `${slug}${extension}`);
    if (existsSync(directPath)) {
      return directPath;
    }
  }

  if (!existsSync(blogDir)) {
    return null;
  }

  const fileNames = readdirSync(blogDir);
  for (const fileName of fileNames) {
    if (!fileName.endsWith(".md") && !fileName.endsWith(".mdx")) continue;
    const filePath = path.join(blogDir, fileName);
    const source = readFileSync(filePath, "utf8");
    if (new RegExp(`^slug:\\s*"${slug}"$`, "m").test(source)) {
      return filePath;
    }
  }

  return null;
};

export const publishBlogPost = async ({
  rootDir = defaultRoot,
  slug,
  now = new Date(),
  requireClaudeReview = BLOG_AUTOMATION_DEFAULTS.requireClaudeReview,
  requireHumanReview = BLOG_AUTOMATION_DEFAULTS.requireHumanReview,
} = {}) => {
  const paths = getAutomationPaths(rootDir);
  const blogFile = findBlogFileBySlug(paths.blogDir, slug);
  if (!blogFile) {
    throw new Error(`Could not find blog file for slug "${slug}".`);
  }

  const reviewPath = path.join(paths.reviewsDir, `${slug}.json`);
  const humanReviewPath = path.join(paths.humanReviewsDir, `${slug}.json`);
  const sourcePath = path.join(paths.sourcesDir, `${slug}.json`);

  const claudePayload = existsSync(reviewPath) ? readJson(reviewPath) : null;
  const humanPayload = existsSync(humanReviewPath) ? readJson(humanReviewPath) : null;
  const sourceBundle = existsSync(sourcePath) ? readJson(sourcePath) : null;
  const source = readFileSync(blogFile, "utf8");
  const parsed = parseBlogFrontmatter(source, blogFile);

  const validation = validateArticleContent({
    content: parsed.content,
    frontmatter: {
      ...parsed.meta,
      slug,
    },
    sourceBundle,
    existingPosts: getPublishedBlogPosts().filter((post) => post.slug !== slug),
  });

  const eligibility = evaluatePublishEligibility({
    validation,
    claudeReview: claudePayload?.review,
    humanReview: humanPayload,
    requireClaudeReview,
    requireHumanReview,
  });

  if (!eligibility.publishable) {
    throw new Error(`Post "${slug}" is not publishable: ${eligibility.blockers.join(" ")}`);
  }

  let updated = rewriteFrontmatterValue(source, "draft", false);
  updated = rewriteFrontmatterValue(updated, "publishDate", todayIso(now));
  updated = rewriteFrontmatterValue(updated, "reviewStatus", "published");
  updated = rewriteFrontmatterValue(updated, "claudeReviewStatus", "PASS");
  await writeFile(blogFile, updated, "utf8");

  const backlog = loadTopicBacklog(paths.topicsFile);
  const topicIdMatch = updated.match(/^topicId:\s*"(.+)"$/m);
  if (topicIdMatch?.[1]) {
    await saveTopicBacklog(
      paths.topicsFile,
      updateTopicStatus(backlog, topicIdMatch[1], "published", { publishedAt: todayIso(now) })
    );
  }

  return {
    slug,
    blogFile,
    publishedAt: todayIso(now),
  };
};

export const runScheduledBlogPipeline = async ({
  rootDir = defaultRoot,
  now = new Date(),
  autoPublish = BLOG_AUTOMATION_DEFAULTS.autoPublish,
  requireClaudeReview = BLOG_AUTOMATION_DEFAULTS.requireClaudeReview,
  requireHumanReview = BLOG_AUTOMATION_DEFAULTS.requireHumanReview,
  posts = getPublishedBlogPosts(),
  generateDraft = generateArticleDraft,
  reviewDraft = runClaudeReview,
} = {}) => {
  const paths = getAutomationPaths(rootDir);
  const backlog = loadTopicBacklog(paths.topicsFile);
  const cadence = getCadenceState({ now, posts });

  if (!cadence.due) {
    return {
      status: "not_due",
      cadence,
    };
  }

  const nextTopic = selectNextEligibleTopic({
    topics: backlog.topics,
    researchDir: paths.researchDir,
  });

  if (!nextTopic) {
    return {
      status: "no_research_ready_topic",
      cadence,
    };
  }

  const { topic, researchBundle, sourceValidation } = nextTopic;
  if (!sourceValidation.valid) {
    await ensureDir(paths.handoffsDir);
    const researchHandoffPath = path.join(paths.handoffsDir, `${topic.id}-research-blocker.md`);
    const researchMessage = [
      `# Research Blocker: ${topicField(topic, "titleSeed", "title_seed")}`,
      "",
      "The topic cannot move to generation because the source bundle is incomplete or invalid.",
      "",
      "## Errors",
      "",
      ...sourceValidation.errors.map((item) => `- ${item}`),
    ].join("\n");
    await writeFile(researchHandoffPath, `${researchMessage}\n`, "utf8");
    await saveTopicBacklog(
      paths.topicsFile,
      updateTopicStatus(backlog, topic.id, "researching", {
        researchArtifact: path.relative(rootDir, researchHandoffPath).replace(/\\/g, "/"),
      })
    );

    return {
      status: "research_blocked",
      topicId: topic.id,
      artifact: researchHandoffPath,
      cadence,
    };
  }

  const generation = await generateDraft({
    topic,
    sourceBundle: researchBundle,
    now,
  });

  if (generation.status !== "generated") {
    await ensureDir(paths.handoffsDir);
    const handoffPath = path.join(paths.handoffsDir, `${topic.id}-generation-request.md`);
    await writeFile(
      handoffPath,
      `# Generation Handoff: ${topicField(topic, "titleSeed", "title_seed")}\n\n${generation.reason}\n\n## Prompt\n\n\`\`\`\n${generation.prompt}\n\`\`\`\n`,
      "utf8"
    );
    await saveTopicBacklog(
      paths.topicsFile,
      updateTopicStatus(backlog, topic.id, "researching", {
        generationArtifact: path.relative(rootDir, handoffPath).replace(/\\/g, "/"),
      })
    );

    return {
      status: "generation_handoff_required",
      topicId: topic.id,
      artifact: handoffPath,
      cadence,
    };
  }

  const blogFileName = `${todayIso(now)}-${generation.frontmatter.slug}.mdx`;
  const blogFilePath = path.join(paths.blogDir, blogFileName);
  const validation = validateArticleContent({
    content: generation.content,
    frontmatter: generation.frontmatter,
    sourceBundle: researchBundle,
    existingPosts: posts,
  });

  if (!validation.valid) {
    await ensureDir(paths.reviewsDir);
    const failedReviewPath = path.join(paths.reviewsDir, `${generation.frontmatter.slug}.md`);
    await writeFile(
      failedReviewPath,
      createReviewArtifactMarkdown({
        topic,
        validation,
        handoffReason: "Generation output failed local validation before Claude review.",
      }),
      "utf8"
    );
    await saveTopicBacklog(paths.topicsFile, updateTopicStatus(backlog, topic.id, "failed"));

    return {
      status: "validation_failed",
      topicId: topic.id,
      artifact: failedReviewPath,
      errors: validation.errors,
      cadence,
    };
  }

  await ensureDir(paths.blogDir);
  await ensureDir(paths.sourcesDir);
  await ensureDir(paths.reviewsDir);

  await writeFile(
    blogFilePath,
    renderBlogFile({
      frontmatter: generation.frontmatter,
      content: generation.content,
    }),
    "utf8"
  );
  await writeFile(
    path.join(paths.sourcesDir, `${generation.frontmatter.slug}.json`),
    `${JSON.stringify(researchBundle, null, 2)}\n`,
    "utf8"
  );

  const article = {
    frontmatter: generation.frontmatter,
    content: generation.content,
  };
  const claudeResult = await reviewDraft({
    article,
    sourceBundle: researchBundle,
  });

  if (claudeResult.status === "reviewed") {
    const nextStatus = claudeResult.review.recommendation === "PASS" ? "human_review_required" : "failed";
    generation.frontmatter.reviewStatus = nextStatus;
    generation.frontmatter.claudeReviewStatus = claudeResult.review.recommendation;
    await writeFile(
      blogFilePath,
      renderBlogFile({
        frontmatter: generation.frontmatter,
        content: generation.content,
      }),
      "utf8"
    );

    const reviewPayload = {
      slug: generation.frontmatter.slug,
      topicId: topic.id,
      review: claudeResult.review,
    };
    await writeFile(
      path.join(paths.reviewsDir, `${generation.frontmatter.slug}.json`),
      `${JSON.stringify(reviewPayload, null, 2)}\n`,
      "utf8"
    );

    await saveTopicBacklog(
      paths.topicsFile,
      updateTopicStatus(backlog, topic.id, nextStatus, {
        draftSlug: generation.frontmatter.slug,
      })
    );

    const publishEligibility = evaluatePublishEligibility({
      validation,
      claudeReview: claudeResult.review,
      humanReview: null,
      requireClaudeReview,
      requireHumanReview,
    });

    return {
      status: "draft_created",
      topicId: topic.id,
      slug: generation.frontmatter.slug,
      reviewRecommendation: claudeResult.review.recommendation,
      publishEligibility,
      autoPublishAttempted: autoPublish,
      cadence,
    };
  }

  const reviewHandoffPath = path.join(paths.handoffsDir, `${generation.frontmatter.slug}-claude-review.md`);
  await ensureDir(paths.handoffsDir);
  generation.frontmatter.reviewStatus = "drafted";
  generation.frontmatter.claudeReviewStatus = "pending";
  await writeFile(
    blogFilePath,
    renderBlogFile({
      frontmatter: generation.frontmatter,
      content: generation.content,
    }),
    "utf8"
  );
  await writeFile(
    reviewHandoffPath,
    `# Claude Review Handoff: ${generation.frontmatter.title}\n\n${claudeResult.reason}\n\n## Prompt\n\n\`\`\`\n${claudeResult.prompt}\n\`\`\`\n`,
    "utf8"
  );
  await saveTopicBacklog(
    paths.topicsFile,
    updateTopicStatus(backlog, topic.id, "drafted", {
      draftSlug: generation.frontmatter.slug,
      claudeArtifact: path.relative(rootDir, reviewHandoffPath).replace(/\\/g, "/"),
    })
  );

  return {
    status: "claude_handoff_required",
    topicId: topic.id,
    slug: generation.frontmatter.slug,
    artifact: reviewHandoffPath,
    cadence,
  };
};
