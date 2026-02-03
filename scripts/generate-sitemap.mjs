import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seoRoutes, siteUrl } from "../src/seo/seoRoutes.js";

const DEFAULT_SITE_URL = process.env.VITE_SITE_URL || siteUrl;
const DEFAULT_ROUTES = seoRoutes.filter((route) => !route.noindex);

const buildUrlEntry = (route, baseUrl, lastmod) => {
  const loc = `${baseUrl}${route.path}`;
  const lines = [
    "  <url>",
    `    <loc>${loc}</loc>`,
  ];

  if (route.changefreq) {
    lines.push(`    <changefreq>${route.changefreq}</changefreq>`);
  }
  if (typeof route.priority === "number") {
    lines.push(`    <priority>${route.priority.toFixed(1)}</priority>`);
  }

  lines.push(`    <lastmod>${lastmod}</lastmod>`, "  </url>");
  return lines.join("\n");
};

export const buildSitemapXml = ({ baseUrl = DEFAULT_SITE_URL, routes = DEFAULT_ROUTES } = {}) => {
  const lastmod = new Date().toISOString().split("T")[0];
  const urlset = routes.map((route) => buildUrlEntry(route, baseUrl, lastmod)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlset}\n</urlset>\n`;
};

export const generateSitemap = async ({
  outDir = "dist",
  baseUrl = DEFAULT_SITE_URL,
  routes = DEFAULT_ROUTES,
} = {}) => {
  const xml = buildSitemapXml({ baseUrl, routes });
  const outputPath = resolve(outDir, "sitemap.xml");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, xml, "utf8");
  return { outputPath, xml };
};

const isCliRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isCliRun) {
  generateSitemap().catch((error) => {
    console.error("Failed to generate sitemap:", error);
    process.exitCode = 1;
  });
}
