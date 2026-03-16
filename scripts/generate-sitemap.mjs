import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBlogEffectiveDate } from "../src/blog/postDates.js";
import { seoRoutes, siteUrl } from "../src/seo/seoRoutes.js";
import { getPublishedBlogPosts } from "./blog-content.mjs";
import { getPublishedBlogRoutes } from "./blog-routes.mjs";

const DEFAULT_SITE_URL = process.env.VITE_SITE_URL || siteUrl;

const getDefaultRoutes = () => {
  const baseRoutes = seoRoutes.filter((route) => !route.noindex);
  const basePaths = new Set(baseRoutes.map((route) => route.path));
  const blogIndexRoute = baseRoutes.find((route) => route.path === "/blog") || {
    path: "/blog",
    changefreq: "weekly",
    priority: 0.6,
  };

  const publishedPosts = getPublishedBlogPosts();
  const publishedBlogRoutes = getPublishedBlogRoutes();
  const blogPostMap = new Map(publishedPosts.map((post) => [`/blog/${post.slug}`, post]));

  const blogRoutes = [];
  if (!basePaths.has("/blog")) {
    blogRoutes.push(blogIndexRoute);
  }

  for (const routePath of publishedBlogRoutes) {
    if (basePaths.has(routePath)) {
      continue;
    }
    const post = blogPostMap.get(routePath);
    blogRoutes.push({
      path: routePath,
      changefreq: "monthly",
      priority: 0.5,
      lastmod: post ? getBlogEffectiveDate(post.meta) : undefined,
    });
  }

  return [...baseRoutes, ...blogRoutes];
};

const DEFAULT_ROUTES = getDefaultRoutes();

const buildUrlEntry = (route, baseUrl, defaultLastmod) => {
  const loc = `${baseUrl}${route.path}`;
  const lines = ["  <url>", `    <loc>${loc}</loc>`];

  if (route.changefreq) {
    lines.push(`    <changefreq>${route.changefreq}</changefreq>`);
  }
  if (typeof route.priority === "number") {
    lines.push(`    <priority>${route.priority.toFixed(1)}</priority>`);
  }

  const lastmod = route.lastmod || defaultLastmod;
  lines.push(`    <lastmod>${lastmod}</lastmod>`, "  </url>");
  return lines.join("\n");
};

export const buildSitemapXml = ({ baseUrl = DEFAULT_SITE_URL, routes = DEFAULT_ROUTES } = {}) => {
  const defaultLastmod = new Date().toISOString().split("T")[0];
  const urlset = routes.map((route) => buildUrlEntry(route, baseUrl, defaultLastmod)).join("\n");

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
