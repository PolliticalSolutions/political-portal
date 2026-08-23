import { describe, expect, it } from "vitest";
import { seoRoutes } from "./seoRoutes.js";

describe("seoRoutes", () => {
  it("has unique paths and required fields", () => {
    const paths = seoRoutes.map((route) => route.path);
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(paths.length);

    seoRoutes.forEach((route) => {
      expect(route.path).toMatch(/^\/(.*)$/);
      if (route.path !== "/") {
        expect(route.path).not.toMatch(/\/$/);
      }
      expect(route.title).toBeTruthy();
      expect(route.description).toBeTruthy();
    });
  });

  it("uses the approved conversion-page metadata", () => {
    expect(seoRoutes.find((route) => route.path === "/enquire")).toMatchObject({
      title: "Campaign support and data enquiries",
      description:
        "Discuss campaign management, constituency intelligence, marked-register processing or practical campaign support with Political Solutions.",
    });
    expect(seoRoutes.find((route) => route.path === "/subscribe")).toMatchObject({
      title: "Annual association subscriptions",
      description:
        "Review annual Political Solutions association pricing, including VAT, and continue through Stripe Checkout or request an invoice.",
    });
  });

  it("uses the approved blog-index metadata", () => {
    expect(seoRoutes.find((route) => route.path === "/blog")).toMatchObject({
      title: "Campaign operations briefings",
      description:
        "Practical briefings on campaign planning, constituency evidence, marked-register work and operational delivery for Conservative campaign professionals.",
    });
  });
});
