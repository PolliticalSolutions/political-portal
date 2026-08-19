const PUBLIC_STATIC_PATHS = new Set([
  "/",
  "/services",
  "/constituency-intelligence",
  "/services/election-support",
  "/enquire",
  "/subscribe",
  "/subscriptions",
  "/cart",
  "/checkout",
  "/checkout/confirmation",
  "/blog",
  "/privacy",
  "/terms",
  "/cookies",
]);

function withoutTrailingSlash(pathname) {
  if (pathname === "/") return pathname;
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function isPublicSitePath(pathname) {
  const normalizedPath = withoutTrailingSlash(pathname);

  return (
    PUBLIC_STATIC_PATHS.has(normalizedPath) ||
    /^\/blog\/[^/]+$/.test(normalizedPath)
  );
}
