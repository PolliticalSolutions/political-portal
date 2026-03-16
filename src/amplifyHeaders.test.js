import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const getCustomHeaders = async () => {
  const contents = await readFile(path.join(repoRoot, "customHttp.yml"), "utf8");
  const config = load(contents);
  return config?.customHeaders ?? [];
};

const findHeaderPattern = (headers, pattern) =>
  headers.find((entry) => entry.pattern === pattern);

const toHeaderMap = (entry) =>
  Object.fromEntries(
    (entry?.headers ?? []).map((header) => [header.key, header.value]),
  );

describe("Amplify customHeaders", () => {
  it("defines security headers for all paths", async () => {
    const customHeaders = await getCustomHeaders();
    expect(customHeaders.length).toBeGreaterThan(0);

    const entry = findHeaderPattern(customHeaders, "**/*");
    expect(entry).toBeTruthy();

    const headerMap = toHeaderMap(entry);
    expect(headerMap["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(headerMap["Strict-Transport-Security"]).toContain("includeSubDomains");
    expect(headerMap["X-Content-Type-Options"]).toBe("nosniff");
    expect(headerMap["X-Frame-Options"]).toBe("DENY");
    expect(headerMap["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headerMap["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
    expect(headerMap["Content-Security-Policy-Report-Only"]).toContain(
      "default-src 'self';",
    );
    expect(headerMap["Content-Security-Policy-Report-Only"]).toContain(
      "frame-ancestors 'none';",
    );
    expect(headerMap["Content-Security-Policy-Report-Only"]).toContain(
      "connect-src 'self' https://rn06rrhtfe.execute-api.eu-west-2.amazonaws.com https://*.amazoncognito.com https://*.auth.eu-west-2.amazoncognito.com;",
    );
  });

  it("sets cache headers for HTML, assets, and SEO files", async () => {
    const customHeaders = await getCustomHeaders();

    const indexHeaders = toHeaderMap(
      findHeaderPattern(customHeaders, "index.html"),
    );
    expect(indexHeaders["Cache-Control"]).toBe(
      "public, max-age=0, s-maxage=600, must-revalidate",
    );

    const assetHeaders = toHeaderMap(
      findHeaderPattern(customHeaders, "assets/*"),
    );
    expect(assetHeaders["Cache-Control"]).toBe(
      "public, max-age=31536000, immutable",
    );

    const robotsHeaders = toHeaderMap(
      findHeaderPattern(customHeaders, "robots.txt"),
    );
    expect(robotsHeaders["Cache-Control"]).toBe("public, max-age=3600");

    const sourcemapHeaders = toHeaderMap(
      findHeaderPattern(customHeaders, "**/*.map"),
    );
    expect(sourcemapHeaders["Cache-Control"]).toBe(
      "no-store, max-age=0, must-revalidate",
    );

    const sitemapHeaders = toHeaderMap(
      findHeaderPattern(customHeaders, "sitemap.xml"),
    );
    expect(sitemapHeaders["Cache-Control"]).toBe("public, max-age=3600");
  });
});
