import { Helmet } from "react-helmet-async";
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from "./seoConfig.js";
import { buildOrganisationSchema, buildWebsiteSchema } from "./structuredData.js";

const normalizePath = (path) => {
  if (!path || path === "/") return "/";
  return path.endsWith("/") ? path.slice(0, -1) : path;
};

const normalizeJsonLd = (jsonLd) => {
  if (!jsonLd) {
    return [buildOrganisationSchema(), buildWebsiteSchema()];
  }
  return Array.isArray(jsonLd) ? jsonLd : [jsonLd];
};

export default function Seo({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  canonical,
  robots,
  noindex = false,
  jsonLd,
}) {
  const normalizedPath = normalizePath(path);
  const canonicalUrl = canonical || `${SITE_URL}${normalizedPath}`;
  const finalTitle = title || SITE_NAME;
  const robotsValue = noindex ? "noindex, nofollow" : robots;
  const jsonLdEntries = normalizeJsonLd(jsonLd);

  return (
    <Helmet>
      <title>{finalTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:title" content={finalTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={finalTitle} />
      <meta name="twitter:description" content={description} />
      {robotsValue && <meta name="robots" content={robotsValue} />}
      {jsonLdEntries.map((entry) => (
        <script key={entry["@type"] || JSON.stringify(entry)} type="application/ld+json">
          {JSON.stringify(entry)}
        </script>
      ))}
    </Helmet>
  );
}
