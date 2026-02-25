/**
 * @typedef {Object} BlogPostMeta
 * @property {string} title
 * @property {string} description
 * @property {string} date
 * @property {string} author
 * @property {string[]} tags
 * @property {boolean} draft
 * @property {string} canonical
 *
 * @typedef {Object} BlogPost
 * @property {string} slug
 * @property {BlogPostMeta} meta
 * @property {string} content
 */

let BLOG_POST_MODULES = {};

try {
  BLOG_POST_MODULES = import.meta.glob("../../content/blog/*.md", {
    eager: true,
    query: "?raw",
    import: "default",
  });
} catch {
  BLOG_POST_MODULES = {};
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const stripQuotes = (value) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const parseInlineArray = (value) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return [stripQuotes(trimmed)].filter(Boolean);
  }

  const items = trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => stripQuotes(item))
    .filter(Boolean);

  return items;
};

const parseFrontmatter = (source, sourcePath) => {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    throw new Error(`Blog post is missing frontmatter block: ${sourcePath}`);
  }

  const normalized = source.replace(/\r\n/g, "\n");
  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    throw new Error(`Blog post has an unterminated frontmatter block: ${sourcePath}`);
  }

  const frontmatterText = normalized.slice(4, endIndex);
  const content = normalized.slice(endIndex + 5).trim();
  const lines = frontmatterText.split("\n");

  /** @type {Record<string, unknown>} */
  const data = {};

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;

    const keyMatch = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (!keyMatch) {
      throw new Error(`Invalid frontmatter line in ${sourcePath}: ${line}`);
    }

    const [, key, rawValue] = keyMatch;

    if (rawValue === "") {
      const listValues = [];
      let cursor = i + 1;
      while (cursor < lines.length) {
        const listMatch = lines[cursor].match(/^\s*-\s*(.+)$/);
        if (!listMatch) break;
        listValues.push(stripQuotes(listMatch[1]));
        cursor += 1;
      }
      data[key] = listValues;
      i = cursor - 1;
      continue;
    }

    const value = rawValue.trim();
    if (value === "true" || value === "false") {
      data[key] = value === "true";
      continue;
    }

    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = parseInlineArray(value);
      continue;
    }

    data[key] = stripQuotes(value);
  }

  const title = typeof data.title === "string" ? data.title.trim() : "";
  const description = typeof data.description === "string" ? data.description.trim() : "";
  const date = typeof data.date === "string" ? data.date.trim() : "";

  if (!title) {
    throw new Error(`Blog post is missing required frontmatter field \"title\": ${sourcePath}`);
  }
  if (!description) {
    throw new Error(
      `Blog post is missing required frontmatter field \"description\": ${sourcePath}`
    );
  }
  if (!date) {
    throw new Error(`Blog post is missing required frontmatter field \"date\": ${sourcePath}`);
  }
  if (!DATE_PATTERN.test(date) || Number.isNaN(new Date(date).getTime())) {
    throw new Error(`Blog post has invalid date (expected YYYY-MM-DD): ${sourcePath}`);
  }

  const tagsRaw = Array.isArray(data.tags) ? data.tags : typeof data.tags === "string" ? [data.tags] : [];
  const tags = tagsRaw
    .map((tag) => String(tag).trim())
    .filter(Boolean);

  /** @type {BlogPostMeta} */
  const meta = {
    title,
    description,
    date,
    author: typeof data.author === "string" && data.author.trim() ? data.author.trim() : "Political Solutions",
    tags,
    draft: Boolean(data.draft),
    canonical: typeof data.canonical === "string" ? data.canonical.trim() : "",
  };

  return { meta, content };
};

const toSlug = (filePath) => {
  const fileName = filePath.split("/").pop() || "";
  return fileName.replace(/\.md$/, "");
};

/** @returns {BlogPost[]} */
const loadPosts = () =>
  Object.entries(BLOG_POST_MODULES)
    .map(([filePath, source]) => {
      const { meta, content } = parseFrontmatter(String(source), filePath);
      return {
        slug: toSlug(filePath),
        meta,
        content,
      };
    })
    .sort((left, right) => new Date(right.meta.date).getTime() - new Date(left.meta.date).getTime());

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
