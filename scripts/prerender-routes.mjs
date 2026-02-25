import { getSeoForPath, seoRoutes } from "../src/seo/seoRoutes.js";
import { getPublishedBlogRoutes } from "./blog-routes.mjs";

export const getPrerenderRoutes = () => {
  const routeCandidates = [
    ...seoRoutes.filter((route) => !route.path.includes(":")).map((route) => route.path),
    "/blog",
    ...getPublishedBlogRoutes(),
  ];

  const uniqueRoutes = [];
  const seen = new Set();

  for (const routePath of routeCandidates) {
    if (!routePath || seen.has(routePath)) continue;
    seen.add(routePath);

    if (routePath.startsWith("/blog/")) {
      uniqueRoutes.push(routePath);
      continue;
    }

    if (getSeoForPath(routePath).noindex) {
      continue;
    }

    uniqueRoutes.push(routePath);
  }

  return uniqueRoutes;
};
