import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const GA_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID || "";
const IS_DEV = import.meta.env.DEV;

let _initialised = false;

function loadGtag(id) {
  if (typeof document === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", id, { send_page_view: false });

  const script = document.createElement("script");
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  script.async = true;
  document.head.appendChild(script);
}

function initAnalytics() {
  if (_initialised || !GA_ID) return;
  _initialised = true;
  // eslint-disable-next-line no-console
  if (IS_DEV) console.log("[GA4] Initialising with measurement ID:", GA_ID);
  loadGtag(GA_ID);
}

function trackPageView(path) {
  if (!GA_ID || typeof window === "undefined" || typeof window.gtag !== "function") return;
  // eslint-disable-next-line no-console
  if (IS_DEV) console.log("[GA4] pageview fired:", path);
  window.gtag("event", "page_view", { page_path: path });
}

export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (!_initialised) return;
    trackPageView(location.pathname);
  }, [location]);
}

/** GA_ID exposed for the dev debug badge — do not use in production logic. */
export const _devGaId = IS_DEV ? GA_ID : null;
