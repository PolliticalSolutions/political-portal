import { useEffect, useMemo } from "react";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from "./seoConfig.js";

const normalisePath = (path) => {
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
};

const buildUrl = (path) => `${SITE_URL}${normalisePath(path)}`;

const upsertMeta = ({ name, property, content }) => {
  if (!content) return;
  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement("meta");
    if (name) tag.setAttribute("name", name);
    if (property) tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
};

const upsertLink = ({ rel, href }) => {
  if (!href) return;
  let tag = document.head.querySelector(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", rel);
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
};

const replaceJsonLd = (items) => {
  document.head.querySelectorAll('script[data-seo="jsonld"]').forEach((tag) => tag.remove());
  if (!items?.length) return;
  items.forEach((entry, index) => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-seo", "jsonld");
    script.setAttribute("data-seo-index", String(index));
    script.textContent = JSON.stringify(entry);
    document.head.appendChild(script);
  });
};

export default function Seo({
  title,
  description,
  path = "",
  robots = "index,follow",
  ogType = "website",
  jsonLd = [],
}) {
  const resolvedDescription = description || DEFAULT_DESCRIPTION;
  const canonicalUrl = useMemo(() => buildUrl(path), [path]);

  useEffect(() => {
    const resolvedTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
    document.title = resolvedTitle;

    upsertMeta({ name: "description", content: resolvedDescription });
    upsertMeta({ name: "robots", content: robots });

    upsertMeta({ property: "og:title", content: resolvedTitle });
    upsertMeta({ property: "og:description", content: resolvedDescription });
    upsertMeta({ property: "og:url", content: canonicalUrl });
    upsertMeta({ property: "og:type", content: ogType });
    upsertMeta({ property: "og:site_name", content: SITE_NAME });

    upsertMeta({ name: "twitter:card", content: "summary" });
    upsertMeta({ name: "twitter:title", content: resolvedTitle });
    upsertMeta({ name: "twitter:description", content: resolvedDescription });

    upsertLink({ rel: "canonical", href: canonicalUrl });
    replaceJsonLd(jsonLd);
  }, [canonicalUrl, jsonLd, ogType, resolvedDescription, robots, title]);

  return null;
}
