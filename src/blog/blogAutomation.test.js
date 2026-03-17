import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BLOG_AUTOMATION_DEFAULTS,
  evaluatePublishEligibility,
  getCadenceState,
  loadTopicBacklog,
  runScheduledBlogPipeline,
  selectNextEligibleTopic,
  validateArticleContent,
} from "../../scripts/blog-automation.mjs";

const tempDirs = [];

const createTempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-automation-"));
  tempDirs.push(root);
  fs.mkdirSync(path.join(root, "content", "blog"), { recursive: true });
  fs.mkdirSync(path.join(root, "content", "blog-automation", "research"), { recursive: true });
  return root;
};

const makeSourceBundle = (topicId, url = "https://www.electoralcommission.org.uk/guidance") => ({
  topicId,
  sources: [
    {
      id: "ec-guidance",
      title: "Electoral Commission guidance",
      publisher: "Electoral Commission",
      url,
    },
  ],
});

const makeTopic = (overrides = {}) => ({
  id: "test-topic",
  title_seed: "How to run a usable campaign data review",
  slug_seed: "how-to-run-a-usable-campaign-data-review",
  category: "Data hygiene and campaign process",
  target_keyword: "campaign data review",
  search_intent: "Campaign team wants a practical data review routine.",
  priority: 10,
  status: "queued",
  notes: "Test topic",
  source_requirements: ["Electoral Commission guidance"],
  evergreen: true,
  operational_hook: "Gives teams a repeatable review routine.",
  audience: "Campaign manager",
  ...overrides,
});

const writeTopicsFile = (root, topics) => {
  const topicsFile = path.join(root, "content", "blog-automation", "topics.json");
  fs.writeFileSync(
    topicsFile,
    `${JSON.stringify(
      {
        backlog_version: 1,
        workflow_defaults: {
          auto_publish: false,
          require_claude_review: true,
          require_human_review: true,
          cadence_days: 3,
        },
        topics,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return topicsFile;
};

const buildValidArticle = (url = "https://www.electoralcommission.org.uk/guidance") => {
  const paragraph = `Campaign teams lose time when they treat review work as an annual panic rather than a weekly operating rhythm, and official guidance on disciplined record handling backs that up [Electoral Commission guidance](${url}). You should run the same checks in the same order each week so the team can spot drift early, assign ownership quickly, and avoid discovering on polling week that one volunteer's spreadsheet has become the unofficial master record [Electoral Commission guidance](${url}). A disciplined review routine also makes handovers easier because the next organiser can see what changed, what failed, and what still needs attention instead of trying to reconstruct the story from memory [Electoral Commission guidance](${url}).`;

  return [
    paragraph,
    "## Check the live voter universe",
    paragraph,
    paragraph,
    paragraph,
    paragraph,
    "## Fix import mistakes before they spread",
    paragraph,
    paragraph,
    paragraph,
    paragraph,
    "## Turn findings into a work list",
    paragraph,
    paragraph,
    paragraph,
    paragraph,
    "## Sources",
    `- [Electoral Commission guidance](${url})`,
  ].join("\n\n");
};

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("blog automation", () => {
  it("calculates due-date cadence correctly", () => {
    const posts = [{ meta: { date: "2026-03-10", publishDate: "2026-03-10" } }];
    expect(getCadenceState({ posts, now: new Date("2026-03-12T09:00:00Z") }).due).toBe(false);
    expect(getCadenceState({ posts, now: new Date("2026-03-13T09:00:00Z") }).due).toBe(true);
  });

  it("selects the next eligible topic with a research bundle", () => {
    const root = createTempRoot();
    const topic = makeTopic();
    writeTopicsFile(root, [topic]);
    fs.writeFileSync(
      path.join(root, "content", "blog-automation", "research", `${topic.id}.json`),
      `${JSON.stringify(makeSourceBundle(topic.id), null, 2)}\n`,
      "utf8"
    );

    const backlog = loadTopicBacklog(path.join(root, "content", "blog-automation", "topics.json"));
    const selected = selectNextEligibleTopic({
      topics: backlog.topics,
      researchDir: path.join(root, "content", "blog-automation", "research"),
    });

    expect(selected?.topic.id).toBe(topic.id);
    expect(selected?.sourceValidation.valid).toBe(true);
  });

  it("fails validation for duplicate slugs, weak openers, and missing citations", () => {
    const result = validateArticleContent({
      content: "A marked register is a document that tells you who voted.\n\n## Sources",
      frontmatter: {
        title: "Existing title",
        slug: "existing-slug",
        description: "Test description",
        date: "2026-03-16",
      },
      sourceBundle: makeSourceBundle("test-topic"),
      existingPosts: [{ slug: "existing-slug", meta: { title: "Existing title" } }],
      minimumWordCount: BLOG_AUTOMATION_DEFAULTS.minimumWordCount,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("Title duplicates");
    expect(result.errors.join(" ")).toContain("Slug duplicates");
    expect(result.errors.join(" ")).toContain("rhetorical question or definition-style");
    expect(result.errors.join(" ")).toContain("no inline citations");
  });

  it("calculates publish eligibility gates", () => {
    const blocked = evaluatePublishEligibility({
      validation: { valid: true },
      claudeReview: { recommendation: "REVISE" },
      humanReview: { decision: "Publish" },
    });
    expect(blocked.publishable).toBe(false);
    expect(blocked.blockers.join(" ")).toContain("Claude review");

    const allowed = evaluatePublishEligibility({
      validation: { valid: true },
      claudeReview: { recommendation: "PASS" },
      humanReview: { decision: "Publish" },
    });
    expect(allowed.publishable).toBe(true);
  });

  it("creates a review-mode draft and stores source and review artifacts", async () => {
    const root = createTempRoot();
    const topic = makeTopic();
    writeTopicsFile(root, [topic]);
    fs.writeFileSync(
      path.join(root, "content", "blog-automation", "research", `${topic.id}.json`),
      `${JSON.stringify(makeSourceBundle(topic.id), null, 2)}\n`,
      "utf8"
    );

    const result = await runScheduledBlogPipeline({
      rootDir: root,
      now: new Date("2026-03-16T10:00:00Z"),
      posts: [],
      generateDraft: async ({ topic: inputTopic, sourceBundle }) => ({
        status: "generated",
        frontmatter: {
          title: inputTopic.title_seed,
          slug: "usable-campaign-data-review",
          description: "A disciplined weekly data review routine for local teams.",
          date: "2026-03-16",
          publishDate: "",
          author: "Political Solutions",
          tags: ["campaign operations", "data hygiene"],
          draft: true,
          canonical: "",
          reviewStatus: "drafted",
          claudeReviewStatus: "pending",
          topicId: inputTopic.id,
          sourceCount: sourceBundle.sources.length,
          sourceBundles: [sourceBundle.topicId],
          humanReviewRequired: true,
          humanApproved: false,
          automationManaged: true,
        },
        content: buildValidArticle(sourceBundle.sources[0].url),
      }),
      reviewDraft: async () => ({
        status: "reviewed",
        review: {
          summary: "The draft is tightly sourced and operationally useful.",
          factualRisks: [],
          unsupportedClaims: [],
          citationSufficiency: "Sufficient",
          toneAndQuality: "Plain-spoken and practical",
          structure: "Strong",
          recommendation: "PASS",
          model: "test-model",
          reviewedAt: "2026-03-16T10:00:00Z",
        },
      }),
    });

    expect(result.status).toBe("draft_created");
    expect(result.reviewRecommendation).toBe("PASS");
    expect(fs.existsSync(path.join(root, "content", "blog", "2026-03-16-usable-campaign-data-review.mdx"))).toBe(true);
    expect(fs.existsSync(path.join(root, "content", "blog-automation", "sources", "usable-campaign-data-review.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "content", "blog-automation", "reviews", "usable-campaign-data-review.json"))).toBe(true);

    const backlog = loadTopicBacklog(path.join(root, "content", "blog-automation", "topics.json"));
    expect(backlog.topics[0].status).toBe("human_review_required");
  });

  it("blocks publication when Claude review does not pass", async () => {
    const root = createTempRoot();
    const topic = makeTopic();
    writeTopicsFile(root, [topic]);
    fs.writeFileSync(
      path.join(root, "content", "blog-automation", "research", `${topic.id}.json`),
      `${JSON.stringify(makeSourceBundle(topic.id), null, 2)}\n`,
      "utf8"
    );

    const result = await runScheduledBlogPipeline({
      rootDir: root,
      now: new Date("2026-03-16T10:00:00Z"),
      posts: [],
      generateDraft: async ({ topic: inputTopic, sourceBundle }) => ({
        status: "generated",
        frontmatter: {
          title: inputTopic.title_seed,
          slug: "claude-revise-case",
          description: "A disciplined weekly data review routine for local teams.",
          date: "2026-03-16",
          publishDate: "",
          author: "Political Solutions",
          tags: ["campaign operations"],
          draft: true,
          canonical: "",
          reviewStatus: "drafted",
          claudeReviewStatus: "pending",
          topicId: inputTopic.id,
          sourceCount: sourceBundle.sources.length,
          sourceBundles: [sourceBundle.topicId],
          humanReviewRequired: true,
          humanApproved: false,
          automationManaged: true,
        },
        content: buildValidArticle(sourceBundle.sources[0].url),
      }),
      reviewDraft: async () => ({
        status: "reviewed",
        review: {
          summary: "The sourcing is incomplete.",
          factualRisks: ["One paragraph overstates certainty."],
          unsupportedClaims: ["A recommendation is too broad."],
          citationSufficiency: "Needs work",
          toneAndQuality: "Usable but overstated",
          structure: "Acceptable",
          recommendation: "REVISE",
          model: "test-model",
          reviewedAt: "2026-03-16T10:00:00Z",
        },
      }),
    });

    expect(result.publishEligibility.publishable).toBe(false);

    const backlog = loadTopicBacklog(path.join(root, "content", "blog-automation", "topics.json"));
    expect(backlog.topics[0].status).toBe("failed");
  });
});
