import { getFileSlug, parseBlogFrontmatter } from "./frontmatter.js";
import { getBlogEffectiveDate } from "./postDates.js";

/**
 * @typedef {Object} BlogPostMeta
 * @property {string} title
 * @property {string} slug
 * @property {string} description
 * @property {string} date
 * @property {string} publishDate
 * @property {string} author
 * @property {string[]} tags
 * @property {boolean} draft
 * @property {string} canonical
 * @property {string} reviewStatus
 * @property {string} claudeReviewStatus
 * @property {string} topicId
 * @property {number} sourceCount
 * @property {string[]} sourceBundles
 * @property {boolean} humanReviewRequired
 * @property {boolean} humanApproved
 * @property {boolean} automationManaged
 *
 * @typedef {Object} BlogPost
 * @property {string} slug
 * @property {BlogPostMeta} meta
 * @property {string} content
 */

let BLOG_POST_MODULES = {};

try {
  BLOG_POST_MODULES = import.meta.glob(["../../content/blog/*.md", "../../content/blog/*.mdx"], {
    eager: true,
    query: "?raw",
    import: "default",
  });
} catch {
  BLOG_POST_MODULES = {};
}

/** @returns {BlogPost[]} */
const loadPosts = () =>
  Object.entries(BLOG_POST_MODULES)
    .map(([filePath, source]) => {
      const { meta, content } = parseBlogFrontmatter(String(source), filePath);
      return {
        slug: meta.slug || getFileSlug(filePath),
        meta,
        content,
      };
    })
    .sort(
      (left, right) =>
        new Date(getBlogEffectiveDate(right.meta)).getTime() -
        new Date(getBlogEffectiveDate(left.meta)).getTime()
    );

/** @returns {BlogPost[]} */
export const getAllPostsIncludingDrafts = () => loadPosts();

/** @returns {BlogPost[]} */
export const getAllPosts = () => loadPosts().filter((post) => !post.meta.draft);

/**
 * @param {string} slug
 * @param {{ includeDrafts?: boolean }} [options]
 * @returns {BlogPost | null}
 */
export const getPostBySlug = (slug, { includeDrafts = false } = {}) => {
  const posts = includeDrafts ? getAllPostsIncludingDrafts() : getAllPosts();
  return posts.find((post) => post.slug === slug) || null;
};
