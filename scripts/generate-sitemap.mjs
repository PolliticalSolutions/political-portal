import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SITE_URL = process.env.VITE_SITE_URL || "https://www.politicalsolutions.uk";
const DEFAULT_ROUTES = [
  "/",
  "/services",
  "/services/election-support",
  "/privacy",
  "/terms",
  "/cookies",
];

export const buildSitemapXml = ({ baseUrl = DEFAULT_SITE_URL, routes = DEFAULT_ROUTES } = {}) => {
  const lastmod = new Date().toISOString().split("T")[0];
  const urlset = routes
    .map((route) => {
      const loc = `${baseUrl}${route}`;
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
    })
    .join("\n");

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
