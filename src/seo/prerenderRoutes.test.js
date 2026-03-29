import { describe, expect, it } from "vitest";
import { getPrerenderRoutes } from "../../scripts/prerender-routes.mjs";

describe("prerender routes", () => {
  it("includes blog index and published blog posts while excluding drafts", () => {
    const routes = getPrerenderRoutes();

    expect(routes).toContain("/blog");
    expect(routes).toContain("/blog/2026-02-25-campaign-data-operations-baseline");
    expect(routes).toContain("/blog/2026-02-20-reducing-field-team-friction-better-handoffs");
    expect(routes).not.toContain("/blog/2026-02-24-draft-post");
  });
});