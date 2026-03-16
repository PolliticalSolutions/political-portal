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

  return trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => stripQuotes(item))
    .filter(Boolean);
};

const parseValue = (rawValue) => {
  const value = rawValue.trim();

  if (value === "true" || value === "false") {
    return value === "true";
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    return parseInlineArray(value);
  }

  return stripQuotes(value);
};

export const parseBlogFrontmatter = (source, sourcePath) => {
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

    data[key] = parseValue(rawValue);
  }

  const title = typeof data.title === "string" ? data.title.trim() : "";
  const description = typeof data.description === "string" ? data.description.trim() : "";
  const date = typeof data.date === "string" ? data.date.trim() : "";

  if (!title) {
    throw new Error(`Blog post is missing required frontmatter field "title": ${sourcePath}`);
  }
  if (!description) {
    throw new Error(`Blog post is missing required frontmatter field "description": ${sourcePath}`);
  }
  if (!date) {
    throw new Error(`Blog post is missing required frontmatter field "date": ${sourcePath}`);
  }
  if (!DATE_PATTERN.test(date) || Number.isNaN(new Date(date).getTime())) {
    throw new Error(`Blog post has invalid date (expected YYYY-MM-DD): ${sourcePath}`);
  }

  const tagsRaw = Array.isArray(data.tags) ? data.tags : typeof data.tags === "string" ? [data.tags] : [];
  const sourceBundlesRaw = Array.isArray(data.sourceBundles)
    ? data.sourceBundles
    : typeof data.sourceBundles === "string"
      ? [data.sourceBundles]
      : [];

  const meta = {
    title,
    slug: typeof data.slug === "string" ? data.slug.trim() : "",
    description,
    date,
    publishDate: typeof data.publishDate === "string" ? data.publishDate.trim() : "",
    author: typeof data.author === "string" && data.author.trim() ? data.author.trim() : "Political Solutions",
    tags: tagsRaw.map((tag) => String(tag).trim()).filter(Boolean),
    draft: Boolean(data.draft),
    canonical: typeof data.canonical === "string" ? data.canonical.trim() : "",
    reviewStatus: typeof data.reviewStatus === "string" ? data.reviewStatus.trim() : "",
    claudeReviewStatus:
      typeof data.claudeReviewStatus === "string" ? data.claudeReviewStatus.trim() : "",
    topicId: typeof data.topicId === "string" ? data.topicId.trim() : "",
    sourceCount: typeof data.sourceCount === "number" ? data.sourceCount : 0,
    sourceBundles: sourceBundlesRaw.map((item) => String(item).trim()).filter(Boolean),
    humanReviewRequired: Boolean(data.humanReviewRequired),
    humanApproved: Boolean(data.humanApproved),
    automationManaged: Boolean(data.automationManaged),
  };

  return { meta, content };
};

export const getFileSlug = (filePath) => {
  const fileName = filePath.split("/").pop()?.split("\\").pop() || "";
  return fileName.replace(/\.(md|mdx)$/, "");
};
