import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";

const BLOG_CONTENT_DIR = path.resolve("content", "blog");
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeMeta = (meta, filePath) => {
  const title = typeof meta.title === "string" ? meta.title.trim() : "";
  const description = typeof meta.description === "string" ? meta.description.trim() : "";
  const date = typeof meta.date === "string" ? meta.date.trim() : "";

  if (!title) {
    throw new Error(`Blog post is missing required frontmatter field \"title\": ${filePath}`);
  }
  if (!description) {
    throw new Error(`Blog post is missing required frontmatter field \"description\": ${filePath}`);
  }
  if (!date) {
    throw new Error(`Blog post is missing required frontmatter field \"date\": ${filePath}`);
  }
  if (!DATE_PATTERN.test(date) || Number.isNaN(new Date(date).getTime())) {
    throw new Error(`Blog post has invalid date (expected YYYY-MM-DD): ${filePath}`);
  }

  const tagsRaw = Array.isArray(meta.tags) ? meta.tags : typeof meta.tags === "string" ? [meta.tags] : [];

  return {
    title,
    description,
    date,
    author: typeof meta.author === "string" && meta.author.trim() ? meta.author.trim() : "Political Solutions",
    tags: tagsRaw.map((tag) => String(tag).trim()).filter(Boolean),
    draft: Boolean(meta.draft),
    canonical: typeof meta.canonical === "string" ? meta.canonical.trim() : "",
  };
};

const parseFrontmatter = (source, filePath) => {
  const normalized = source.replace(/\r\n/g, "\n");
  const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!frontmatterMatch) {
    throw new Error(`Blog post is missing frontmatter block: ${filePath}`);
  }

  const frontmatter = load(frontmatterMatch[1]) || {};
  const content = normalized.slice(frontmatterMatch[0].length).trim();
  return { meta: normalizeMeta(frontmatter, filePath), content };
};

const readBlogPost = (filePath) => {
  const source = readFileSync(filePath, "utf8");
  const { meta, content } = parseFrontmatter(source, filePath);
  const slug = path.basename(filePath, ".md");
  return { slug, meta, content };
};

export const getAllBlogPostsIncludingDrafts = () => {
  if (!existsSync(BLOG_CONTENT_DIR)) {
    return [];
  }

  const files = readdirSync(BLOG_CONTENT_DIR)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort();

  return files
    .map((fileName) => readBlogPost(path.join(BLOG_CONTENT_DIR, fileName)))
    .sort((left, right) => new Date(right.meta.date).getTime() - new Date(left.meta.date).getTime());
};

export const getPublishedBlogPosts = () =>
  getAllBlogPostsIncludingDrafts().filter((post) => !post.meta.draft);