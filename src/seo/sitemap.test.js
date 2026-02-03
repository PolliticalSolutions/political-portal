import { describe, expect, it } from "vitest";
import { buildSitemapXml } from "../../scripts/generate-sitemap.mjs";
import { siteUrl } from "./seoRoutes.js";

describe("sitemap generator", () => {
  it("includes core public routes and excludes private routes", () => {
    const xml = buildSitemapXml({ baseUrl: siteUrl });

    expect(xml).toContain(`<loc>${siteUrl}/</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/services</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/services/election-support</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/subscriptions</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/privacy</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/terms</loc>`);
    expect(xml).toContain(`<loc>${siteUrl}/cookies</loc>`);
    expect(xml).not.toContain(`<loc>${siteUrl}/portal</loc>`);
    expect(xml).not.toContain(`<loc>${siteUrl}/login</loc>`);
  });
});
