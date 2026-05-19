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
    title: "Campaign data services — marked registers, intelligence & operations support",
    description:
      "Marked register processing, constituency data insights, and campaign operations support for UK associations. Subscription platform access included. Get started today.",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/constituency-intelligence",
    title: "Constituency intelligence — council, by-election & electoral data for UK seats",
    description:
      "Current data on every Conservative-held and target seat: council composition, by-election results, and full electoral history. Built for UK associations and campaign managers.",
    changefreq: "monthly",
    priority: 0.8,
  },
  {
    path: "/services/election-support",
    title: "Campaigning, training & election support for UK associations",
    description:
      "Hands-on election support for campaign operations, data coordination, and delivery planning. UK-wide coverage, clear scope, and a separate chargeable engagement.",
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
    title: "Subscribe to the campaign data platform — Stripe checkout",
    description:
      "Select your association, choose card or invoice payment, and activate access to marked register processing, constituency intelligence, and the secure portal.",
    changefreq: "monthly",
    priority: 0.7,
  },
  {
    path: "/enquire",
    title: "Enquire about campaign data services — get a response within one working day",
    description:
      "Tell us what you need and which service you want to discuss. We review every enquiry and confirm the next step within one working day. No sales calls, no pressure.",
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
    title: "UK campaign operations blog — marked registers, data & delivery",
    description:
      "Practical guidance on marked register processing, constituency data workflows, and campaign delivery for UK political professionals. No generic commentary — just operational answers.",
    changefreq: "weekly",
    priority: 0.6,
  },
  {
    path: "/blog/:slug",
    title: "Blog post",
    description: "Article from Political Solutions.",
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

    if (!post) {
      return {
        ...defaultSeo,
        path: normalized,
        title: "Post not found",
        description: "This article is unavailable or has not been published.",
        noindex: true,
      };
    }

    return {
      path: normalized,
      title: post.meta.title,
      description: post.meta.description,
      canonical: post.meta.canonical || `${SITE_URL}${normalized}`,
      noindex: post.meta.draft,
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
