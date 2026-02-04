import { getSiteUrl } from "../config/runtimeConfig.js";

const normalizeSiteUrl = (siteUrl) => {
  try {
    const parsed = new URL(siteUrl);
    if (parsed.hostname === "www.politicalsolutions.uk") {
      parsed.hostname = "politicalsolutions.uk";
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "https://politicalsolutions.uk";
  }
};

export const SITE_URL = normalizeSiteUrl(getSiteUrl());
export const SITE_NAME = "Political Solutions";
export const SITE_LEGAL_NAME = "Political Solutions Ltd";
export const DEFAULT_DESCRIPTION =
  "UK political operations platform for marked register processing, data insights, and compliant campaign operations support.";
export const CONTACT_EMAIL = "paul@politicalsolutions.uk";
export const LOGO_PATH = "/logo512.png";
