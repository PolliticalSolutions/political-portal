import { SITE_URL } from "./seoConfig.js";
import { getPostBySlug } from "../blog/blogLoader.js";

export const siteUrl = SITE_URL;

export const seoRoutes = [
  {
    path: "/",
    title: "Marked register processing & campaign data for UK political teams",
    description:
      "Political Solutions gives UK campaign teams fast marked register processing, constituency intelligence, and compliant data workflows — all in one secure portal.",
    changefreq: "weekly",
    priority: 1.0,
  },
  {
    path: "/services",
    title: "Data-led campaign management and consultancy",
    description:
      "Campaign management, strategy, candidate coaching and association support for Conservative associations and campaign teams.",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/constituency-intelligence",
    title: "Constituency intelligence for campaign planning",
    description:
      "Use election history, demographics, swing, vulnerability and party-specific threat analysis to inform planning for permitted constituencies.",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/services/election-support",
    title: "Data-led political campaign management",
    description:
      "Discuss campaign management, strategy, candidate coaching, association support and practical delivery with Political Solutions.",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/subscriptions",
    title: "Portal subscription plans — campaign data platform access",
    description:
      "Choose a subscription tier that fits your association or regional team. Includes marked register processing, constituency intelligence, and secure portal access.",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/subscribe",
    title: "Annual association subscriptions",
    description:
      "Review annual Political Solutions association pricing, including VAT, and continue through Stripe Checkout or request an invoice.",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/enquire",
    title: "Campaign support and data enquiries",
    description:
      "Discuss campaign management, constituency intelligence, marked-register processing or practical campaign support with Political Solutions.",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    path: "/campaign/volunteer",
    title: "Become a Conservative campaign volunteer — canvassing, leafleting & phone banks",
    description:
      "Sign up to be invited to Conservative campaign sessions in your area. Canvassing, leafleting, phone banks, and committee-room shifts — no commitment, just an email when help is needed.",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    path: "/blog",
    title: "Campaign operations briefings",
    description:
      "Practical briefings on campaign planning, constituency evidence, marked-register work and operational delivery for Conservative campaign professionals.",
    changefreq: "weekly",
    priority: 0.6,
  },
  {
    path: "/blog/:slug",
    title: "Campaign briefing",
    description: "Practical campaign operations guidance from Political Solutions.",
    noindex: true,
  },
  {
    path: "/privacy",
    title: "Privacy policy — how Political Solutions handles your data",
    description:
      "How Political Solutions Ltd collects, stores, and protects personal data. Includes contact details for data queries and your rights under UK GDPR.",
    changefreq: "yearly",
    priority: 0.3,
  },
  {
    path: "/terms",
    title: "Terms of use — Political Solutions portal & services",
    description:
      "Terms governing use of the Political Solutions Portal, subscription services, and associated tools. Read before accessing the platform.",
    changefreq: "yearly",
    priority: 0.3,
  },
  {
    path: "/cookies",
    title: "Cookie notice — Political Solutions portal",
    description:
      "What cookies Political Solutions sets, why, and how to manage them. Covers essential storage used by the secure portal and authentication flow.",
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
  "/campaign/rsvp",
  "/campaign/unsubscribe",
]);

export const getSeoForPath = (pathname) => {
  const normalized = normalizePath(pathname);
  const match = seoRoutes.find((route) => route.path === normalized);
  if (match) return match;

  if (normalized.startsWith("/blog/")) {
    const slug = normalized.slice("/blog/".length);
    const post = getPostBySlug(slug, { includeDrafts: true });

    if (!post || post.meta.draft) {
      return {
        ...defaultSeo,
        path: normalized,
        title: "Briefing unavailable",
        description:
          "This Political Solutions campaign briefing is unavailable or has not been published.",
        noindex: true,
      };
    }

    return {
      path: normalized,
      title: post.meta.title,
      description: post.meta.description,
      canonical: post.meta.canonical || `${SITE_URL}${normalized}`,
      noindex: false,
    };
  }

  const noindex =
    noindexRoutes.has(normalized) ||
    noindexPrefixes.some((prefix) => normalized.startsWith(prefix));

  return {
    ...defaultSeo,
    path: normalized,
    noindex,
  };
};
