// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { render } from "../entry-server.jsx";

describe("portal SSR render", () => {
  it("renders /portal/pricing without throwing", async () => {
    vi.stubEnv("VITE_COGNITO_DOMAIN", "https://auth.example.test");
    vi.stubEnv("VITE_COGNITO_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_COGNITO_REDIRECT_URI", "https://example.test/callback");
    vi.stubEnv("VITE_ENQUIRY_API_URL", "https://api.example.test");

    await expect(render("/portal/pricing")).resolves.toMatchObject({
      appHtml: expect.any(String),
      headHtml: expect.any(String),
    });

    const result = await render("/portal/pricing");
    expect(result.headHtml).toContain('name="robots"');
    expect(result.headHtml).toMatch(/noindex,\s*nofollow/);

    vi.unstubAllEnvs();
  });
});
