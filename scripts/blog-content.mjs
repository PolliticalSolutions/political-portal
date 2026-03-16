import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { getFileSlug, parseBlogFrontmatter } from "../src/blog/frontmatter.js";
import { getBlogEffectiveDate } from "../src/blog/postDates.js";

const BLOG_CONTENT_DIR = path.resolve("content", "blog");

const readBlogPost = (filePath) => {
  const source = readFileSync(filePath, "utf8");
  const { meta, content } = parseBlogFrontmatter(source, filePath);
  const slug = meta.slug || getFileSlug(filePath);
  return { slug, meta, content };
};

export const getAllBlogPostsIncludingDrafts = () => {
  if (!existsSync(BLOG_CONTENT_DIR)) {
    return [];
  }

  const files = readdirSync(BLOG_CONTENT_DIR)
    .filter((fileName) => fileName.endsWith(".md") || fileName.endsWith(".mdx"))
    .sort();

  return files
    .map((fileName) => readBlogPost(path.join(BLOG_CONTENT_DIR, fileName)))
    .sort(
      (left, right) =>
        new Date(getBlogEffectiveDate(right.meta)).getTime() -
        new Date(getBlogEffectiveDate(left.meta)).getTime()
    );
};

export const getPublishedBlogPosts = () =>
  getAllBlogPostsIncludingDrafts().filter((post) => !post.meta.draft);
