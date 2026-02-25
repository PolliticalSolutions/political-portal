import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { siteUrl } from "../src/seo/seoRoutes.js";
import { getPublishedBlogPosts } from "./blog-content.mjs";

const DEFAULT_SITE_URL = process.env.VITE_SITE_URL || siteUrl;

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const toItemLink = (post, baseUrl) => post.meta.canonical || `${baseUrl}/blog/${post.slug}`;

export const buildRssXml = ({ baseUrl = DEFAULT_SITE_URL, posts = getPublishedBlogPosts() } = {}) => {
  const channelTitle = "Political Solutions Blog";
  const channelLink = `${baseUrl}/blog`;
  const channelDescription =
    "Operational insights on campaign delivery, political data workflows, and execution best practice.";

  const items = posts
    .map((post) => {
      const link = toItemLink(post, baseUrl);
      return [
        "  <item>",
        `    <title>${escapeXml(post.meta.title)}</title>`,
        `    <link>${escapeXml(link)}</link>`,
        `    <guid>${escapeXml(link)}</guid>`,
        `    <pubDate>${new Date(post.meta.date).toUTCString()}</pubDate>`,
        `    <description>${escapeXml(post.meta.description)}</description>`,
        "  </item>",
      ].join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n  <title>${escapeXml(channelTitle)}</title>\n  <link>${escapeXml(channelLink)}</link>\n  <description>${escapeXml(channelDescription)}</description>\n${items}\n</channel>\n</rss>\n`;
};

export const generateRss = async ({ outDir = "dist", baseUrl = DEFAULT_SITE_URL, posts } = {}) => {
  const xml = buildRssXml({ baseUrl, posts: posts || getPublishedBlogPosts() });
  const outputPath = resolve(outDir, "rss.xml");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, xml, "utf8");
  return { outputPath, xml };
};

const isCliRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isCliRun) {
  generateRss().catch((error) => {
    console.error("Failed to generate RSS:", error);
    process.exitCode = 1;
  });
}