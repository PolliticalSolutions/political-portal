import { describe, expect, it } from "vitest";
import { buildSitemapXml } from "../../scripts/generate-sitemap.mjs";
import { siteUrl } from "./seoRoutes.js";

describe("sitemap generator output", () => {
  it("emits sitemap URLs from seoRoutes and published blog posts", () => {
    const xml = buildSitemapXml({ baseUrl: siteUrl });

    expect(xml).toContain(`<loc>${siteUrl}/</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/services</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/subscriptions</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/blog</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/blog/2026-02-25-example-post-1</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/blog/2026-02-20-example-post-2</loc>`);
    expect(xml).not.toContain(`<loc>${siteUrl}/blog/2026-02-24-draft-post</loc>`);
  });
});
