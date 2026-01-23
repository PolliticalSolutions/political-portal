const redirectKey = "ps_post_auth_redirect_v1";

export function isSafeInternalPath(path) {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("://")) return false;
  return true;
}

export function setPostAuthRedirect(path) {
  if (typeof sessionStorage === "undefined") return;
  if (isSafeInternalPath(path)) {
    sessionStorage.setItem(redirectKey, path);
  }
}

export function consumePostAuthRedirect(fallback = "/portal") {
  if (typeof sessionStorage === "undefined") return fallback;
  const stored = sessionStorage.getItem(redirectKey);
  if (stored) {
    sessionStorage.removeItem(redirectKey);
  }
  return isSafeInternalPath(stored) ? stored : fallback;
}
