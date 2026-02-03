// @vitest-environment node
import { describe, expect, it } from "vitest";
import { render } from "../entry-server.jsx";
import { siteUrl } from "./seoRoutes.js";

describe("entry-server render", () => {
  it("renders HTML and head tags for SEO routes", async () => {
    const { appHtml, headHtml } = await render("/");

    expect(appHtml).toBeTruthy();
    expect(headHtml).toContain("<title");
    expect(headHtml).toContain(siteUrl);
    expect(headHtml).toContain('rel="canonical"');
    expect(headHtml).toContain('property="og:title"');
    expect(headHtml).toContain('name="twitter:title"');
  });
});
