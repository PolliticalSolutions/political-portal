import { describe, expect, it } from "vitest";
import { buildSitemapXml } from "../../scripts/generate-sitemap.mjs";

describe("sitemap generator", () => {
  it("includes core public routes and excludes subscriptions entry", () => {
    const xml = buildSitemapXml({ baseUrl: "https://www.politicalsolutions.uk" });

    expect(xml).toContain("<loc>https://www.politicalsolutions.uk/</loc>");
    expect(xml).toContain("<loc>https://www.politicalsolutions.uk/services</loc>");
    expect(xml).toContain("<loc>https://www.politicalsolutions.uk/services/election-support</loc>");
    expect(xml).toContain("<loc>https://www.politicalsolutions.uk/privacy</loc>");
    expect(xml).toContain("<loc>https://www.politicalsolutions.uk/terms</loc>");
    expect(xml).toContain("<loc>https://www.politicalsolutions.uk/cookies</loc>");
    expect(xml).not.toContain("<loc>https://www.politicalsolutions.uk/subscriptions</loc>");
  });
});
