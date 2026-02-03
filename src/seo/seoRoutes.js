export const siteUrl = "https://politicalsolutions.uk";

export const seoRoutes = [
  {
    path: "/",
    title: "Political Solutions | UK Political Operations Platform",
    description:
      "Political Solutions helps UK organisations plan, campaign, and manage political operations with confidence.",
    changefreq: "weekly",
    priority: 1.0,
  },
  {
    path: "/services",
    title: "Services | Political Solutions",
    description:
      "Explore Political Solutions services for political operations, compliance support, and strategic delivery.",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/services/election-support",
    title: "Election Support | Political Solutions",
    description:
      "Election support services for UK campaigns covering planning, compliance, and delivery.",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/subscriptions",
    title: "Pricing | Political Solutions",
    description:
      "Transparent pricing for Political Solutions subscriptions and services.",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/enquire",
    title: "Enquire | Political Solutions",
    description:
      "Contact Political Solutions to discuss your political operations requirements.",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    path: "/privacy",
    title: "Privacy Policy | Political Solutions",
    description: "Read the Political Solutions privacy policy.",
    changefreq: "yearly",
    priority: 0.3,
  },
  {
    path: "/terms",
    title: "Terms of Service | Political Solutions",
    description: "Review the Political Solutions terms of service.",
    changefreq: "yearly",
    priority: 0.3,
  },
  {
    path: "/cookies",
    title: "Cookie Policy | Political Solutions",
    description: "Learn how Political Solutions uses cookies.",
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
