export const siteUrl = "https://politicalsolutions.uk";

export const seoRoutes = [
  {
    path: "/",
    title: "UK political operations platform",
    description:
      "UK political operations platform for marked register processing, data insights, and compliant campaign operations support. Secure portal subscriptions.",
    changefreq: "weekly",
    priority: 1.0,
  },
  {
    path: "/services",
    title: "Political operations services",
    description:
      "UK-wide political operations services: marked register processing, data insights, subscription platform access, training, and support. Election support available separately.",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/services/election-support",
    title: "Election and by-election support",
    description:
      "UK-wide election and by-election support for campaign operations, data coordination, and delivery planning. Separate chargeable service with clear scope.",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/subscriptions",
    title: "Portal subscriptions",
    description:
      "Subscriptions are managed through the secure Political Solutions Portal. Log in to view tiers and manage your account.",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/enquire",
    title: "Enquire about services",
    description:
      "Ask a question, request a demo, or clarify pricing for Political Solutions services.",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    path: "/privacy",
    title: "Privacy policy",
    description: "Read how Political Solutions Ltd handles data, privacy, and contact details.",
    changefreq: "yearly",
    priority: 0.3,
  },
  {
    path: "/terms",
    title: "Terms of use",
    description: "Terms of use for the Political Solutions Portal and related services.",
    changefreq: "yearly",
    priority: 0.3,
  },
  {
    path: "/cookies",
    title: "Cookie notice",
    description: "Cookie notice for the Political Solutions Portal, including essential storage information.",
    changefreq: "yearly",
    priority: 0.3,
  },
];

export const normalizePath = (path) => {
  if (!path) return "/";
  if (path === "/") return "/";
  return path.endsWith("/") ? path.slice(0, -1) : path;
};

export const defaultSeo = seoRoutes[0];

const noindexPrefixes = ["/portal"];
const noindexRoutes = new Set([
  "/login",
  "/signup",
  "/callback",
  "/cart",
  "/checkout",
  "/checkout/confirmation",
]);

export const getSeoForPath = (pathname) => {
  const normalized = normalizePath(pathname);
  const match = seoRoutes.find((route) => route.path === normalized);
  if (match) return match;

  const noindex =
    noindexRoutes.has(normalized) ||
    noindexPrefixes.some((prefix) => normalized.startsWith(prefix));

  return {
    ...defaultSeo,
    path: normalized,
    noindex,
  };
};
