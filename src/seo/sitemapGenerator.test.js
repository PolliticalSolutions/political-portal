import { describe, expect, it } from "vitest";
import { buildSitemapXml } from "../../scripts/generate-sitemap.mjs";
import { seoRoutes, siteUrl } from "./seoRoutes.js";

describe("sitemap generator output", () => {
  it("emits sitemap URLs from seoRoutes", () => {
    const xml = buildSitemapXml({ baseUrl: siteUrl, routes: seoRoutes });

    expect(xml).toContain(`<loc>${siteUrl}/</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/services</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/subscriptions</loc>`);
  });
});
