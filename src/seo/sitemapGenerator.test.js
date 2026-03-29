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
    expect(xml).toContain(`<loc>${siteUrl}/blog/2026-02-25-campaign-data-operations-baseline</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/blog/2026-02-20-reducing-field-team-friction-better-handoffs</loc>`);
    expect(xml).not.toContain(`<loc>${siteUrl}/blog/2026-02-24-draft-post</loc>`);
  });
});
