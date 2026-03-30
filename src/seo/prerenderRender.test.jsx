// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { render } from "../entry-server.jsx";
import { siteUrl } from "./seoRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const injectHead = (html, headHtml) => html.replace("</head>", `${headHtml}</head>`);
const injectApp = (html, appHtml) =>
  html.replace(/<div id="root">[\s\S]*?<\/div>/, `<div id="root">${appHtml}</div>`);

describe("entry-server render", () => {
  it("renders route-specific head tags for SEO routes", async () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.example.test");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.test/callback");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");

    const home = await render("/");
    const services = await render("/services");
    const electionSupport = await render("/services/election-support");

    expect(home.appHtml).toBeTruthy();
    expect(services.appHtml).toBeTruthy();
    expect(electionSupport.appHtml).toBeTruthy();

    expect(home.headHtml).toContain("Political Solutions | UK political operations platform");
    expect(services.headHtml).toContain(
      "Political Solutions | Political operations services"
    );
    expect(electionSupport.headHtml).toContain(
      "Political Solutions | Campaigning, Training &amp; Election Support"
    );
    expect(services.headHtml).toContain(`rel="canonical" href="${siteUrl}/services"`);
    expect(electionSupport.headHtml).toContain(
      `rel="canonical" href="${siteUrl}/services/election-support"`
    );
    expect(services.headHtml).not.toContain(`href="${siteUrl}/services/election-support"`);
    expect(services.headHtml).toContain(`property="og:url" content="${siteUrl}/services"`);
    expect(electionSupport.headHtml).toContain(
      `property="og:url" content="${siteUrl}/services/election-support"`
    );
    expect(services.headHtml).not.toBe(home.headHtml);

    vi.unstubAllEnvs();
  });

  it("renders prerender HTML with route-specific canonical, title, and description", async () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.example.test");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.test/callback");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");

    const template = await readFile(path.join(repoRoot, "index.html"), "utf8");
    const { appHtml, headHtml } = await render("/services");
    const finalHtml = injectApp(injectHead(template, headHtml), appHtml);

    expect(finalHtml).toContain("Political Solutions | Political operations services");
    expect(finalHtml).toContain(
      `rel="canonical" href="${siteUrl}/services"`
    );
    expect(finalHtml).toContain(
      'name="description" content="UK-wide political operations services: marked register processing, data insights, subscription platform access, training, and support. Election support available separately."'
    );
    expect(finalHtml.match(/<title\b/g)?.length ?? 0).toBe(1);
    expect(finalHtml).not.toContain("<title>Political Solutions | UK political operations platform</title>");

    vi.unstubAllEnvs();
  });

  it("renders /subscriptions as indexable", async () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.example.test");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.test/callback");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");

    const subscriptions = await render("/subscriptions");
    expect(subscriptions.headHtml).toContain('name="robots" content="index,follow"');
    expect(subscriptions.headHtml).toContain("Political Solutions | Portal subscriptions");

    vi.unstubAllEnvs();
  });

  it("renders blog post SEO with a single title and post metadata", async () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.example.test");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.test/callback");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");

    const template = await readFile(path.join(repoRoot, "index.html"), "utf8");
    const { appHtml, headHtml } = await render("/blog/2026-02-25-campaign-data-operations-baseline");
    const finalHtml = injectApp(injectHead(template, headHtml), appHtml);

    expect(finalHtml).toContain("Political Solutions | Building a campaign data operations baseline");
    expect(finalHtml).toContain(
      'name="description" content="How local campaign teams can reduce operational risk with a disciplined data baseline before peak election periods."'
    );
    expect(finalHtml).toContain(
      `rel="canonical" href="${siteUrl}/blog/2026-02-25-campaign-data-operations-baseline"`
    );
    expect(finalHtml.match(/<title\b/g)?.length ?? 0).toBe(1);

    vi.unstubAllEnvs();
  });

  it("honors canonical override for blog posts", async () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.example.test");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.test/callback");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");

    const post = await render("/blog/2026-02-20-reducing-field-team-friction-better-handoffs");
    expect(post.headHtml).toContain('rel="canonical" href="https://example.com/original-post"');
    expect(post.headHtml).toContain(
      'property="og:url" content="https://example.com/original-post"'
    );

    vi.unstubAllEnvs();
  });

  it("marks draft blog posts as noindex", async () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.example.test");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.test/callback");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");

    const draftPost = await render("/blog/2026-02-24-draft-post");
    expect(draftPost.headHtml).toContain('name="robots" content="noindex, nofollow"');

    vi.unstubAllEnvs();
  });

  it("emits BlogPosting JSON-LD for blog posts using canonical URL", async () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.example.test");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.test/callback");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");

    const post = await render("/blog/2026-02-20-reducing-field-team-friction-better-handoffs");
    expect(post.headHtml).toContain('"@type":"BlogPosting"');
    expect(post.headHtml).toContain('"headline":"Reducing field-team friction with better handoffs"');
    expect(post.headHtml).toContain('"datePublished":"2026-02-20"');
    expect(post.headHtml).toContain('"mainEntityOfPage":"https://example.com/original-post"');

    vi.unstubAllEnvs();
  });

  it("renders blog posts in SSR when comments env vars are present", async () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.example.test");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.test/callback");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");
    vi.stubEnv("VITE_GISCUS_ENABLED", "true");
    vi.stubEnv("VITE_GISCUS_REPO", "org/repo");
    vi.stubEnv("VITE_GISCUS_REPO_ID", "repo-id");
    vi.stubEnv("VITE_GISCUS_CATEGORY", "General");
    vi.stubEnv("VITE_GISCUS_CATEGORY_ID", "category-id");

    const post = await render("/blog/2026-02-25-campaign-data-operations-baseline");
    expect(post.appHtml).toContain("Build a resilient campaign data baseline");
    expect(post.appHtml).not.toContain("blog-giscus");

    vi.unstubAllEnvs();
  });

});
