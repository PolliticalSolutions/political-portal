// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { render } from "../entry-server.jsx";
import { siteUrl } from "./seoRoutes.js";

describe("entry-server render", () => {
  it("renders HTML and head tags for SEO routes", async () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.example.test");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.test/callback");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");

    const { appHtml, headHtml } = await render("/");

    expect(appHtml).toBeTruthy();
    expect(headHtml).toContain("<title");
    expect(headHtml).toContain(siteUrl);
    expect(headHtml).toContain('rel="canonical"');
    expect(headHtml).toContain('property="og:title"');
    expect(headHtml).toContain('name="twitter:title"');

    vi.unstubAllEnvs();
  });
});
