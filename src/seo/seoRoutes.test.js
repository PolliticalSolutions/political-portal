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
});
