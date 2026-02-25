// @vitest-environment node
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRssXml, generateRss } from "./generate-rss.mjs";
import { siteUrl } from "../src/seo/seoRoutes.js";

describe("RSS generator", () => {
  it("builds RSS with published posts only and canonical override links", () => {
    const xml = buildRssXml({ baseUrl: siteUrl });

    expect(xml).toContain("<title>Political Solutions Blog</title>");
    expect(xml).toContain(`<link>${siteUrl}/blog</link>`);
    expect(xml).toContain("<title>Building a campaign data operations baseline</title>");
    expect(xml).toContain("<title>Reducing field-team friction with better handoffs</title>");
    expect(xml).not.toContain("Internal draft: volunteer rota quality checks");
    expect(xml).toContain(`<link>${siteUrl}/blog/2026-02-25-example-post-1</link>`);
    expect(xml).toContain("<link>https://example.com/original-post</link>");
  });

  it("writes rss.xml to the output directory", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "ps-rss-test-"));
    const { outputPath } = await generateRss({ outDir, baseUrl: siteUrl });

    const written = await readFile(outputPath, "utf8");
    expect(outputPath.endsWith(`${path.sep}rss.xml`)).toBe(true);
    expect(written).toContain("<rss version=\"2.0\">");
    expect(written).toContain("Building a campaign data operations baseline");
    expect(written).not.toContain("Internal draft: volunteer rota quality checks");
  });
});