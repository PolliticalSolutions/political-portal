import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("robots.txt", () => {
  it("disallows portal and callback routes", () => {
    const filePath = resolve(process.cwd(), "public", "robots.txt");
    const content = readFileSync(filePath, "utf8");

    expect(content).toContain("Disallow: /portal");
    expect(content).toContain("Disallow: /callback");
  });
});
