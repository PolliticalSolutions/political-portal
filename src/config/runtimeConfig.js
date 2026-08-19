const readEnv = (viteValue, processKey) => {
  const processValue =
    typeof process !== "undefined" && process.env ? process.env[processKey] : undefined;
  const value = typeof viteValue === "string" ? viteValue : processValue;
  if (typeof value !== "string") return "";
  return value.trim();
};

const normalizeBaseUrl = (value) => {
  if (!value) return "";
  return value.replace(/\/+$/, "");
};

const normalizeSiteUrl = (value) => {
  const trimmed = normalizeBaseUrl(value);
  return trimmed || "https://politicalsolutions.uk";
};

export const getRuntimeConfig = () => {
  const siteUrl = normalizeSiteUrl(readEnv(import.meta.env?.VITE_SITE_URL, "VITE_SITE_URL"));
  const apiBaseUrl = normalizeBaseUrl(
    readEnv(import.meta.env?.VITE_API_BASE_URL, "VITE_API_BASE_URL") ||
      readEnv(import.meta.env?.VITE_ENQUIRY_API_URL, "VITE_ENQUIRY_API_URL")
  );
  return {
    siteUrl,
    apiBaseUrl,
    enquiryApiUrl: normalizeBaseUrl(
      readEnv(import.meta.env?.VITE_ENQUIRY_API_URL, "VITE_ENQUIRY_API_URL")
    ),
    apiBaseUrlExplicit: normalizeBaseUrl(
      readEnv(import.meta.env?.VITE_API_BASE_URL, "VITE_API_BASE_URL")
    ),
    uploadApiBaseUrl: normalizeBaseUrl(
      readEnv(import.meta.env?.VITE_UPLOAD_API_URL, "VITE_UPLOAD_API_URL")
    ),
    personaApiUrl: normalizeBaseUrl(
      readEnv(import.meta.env?.VITE_PERSONA_API_URL, "VITE_PERSONA_API_URL")
    ),
    stripePublishableKey: readEnv(
      import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY,
      "VITE_STRIPE_PUBLISHABLE_KEY"
    ),
    stripeApiBaseUrl: normalizeBaseUrl(
      readEnv(import.meta.env?.VITE_STRIPE_API_URL, "VITE_STRIPE_API_URL")
    ),
    cognitoDomain: readEnv(import.meta.env?.VITE_COGNITO_DOMAIN, "VITE_COGNITO_DOMAIN"),
    cognitoClientId: readEnv(
      import.meta.env?.VITE_COGNITO_CLIENT_ID,
      "VITE_COGNITO_CLIENT_ID"
    ),
    cognitoRedirectUri: readEnv(
      import.meta.env?.VITE_COGNITO_REDIRECT_URI,
      "VITE_COGNITO_REDIRECT_URI"
    ),
    cognitoLogoutUri: readEnv(
      import.meta.env?.VITE_COGNITO_LOGOUT_URI,
      "VITE_COGNITO_LOGOUT_URI"
    ),
    supabaseUrl: readEnv(import.meta.env?.VITE_SUPABASE_URL, "VITE_SUPABASE_URL"),
    supabaseAnonKey: readEnv(
      import.meta.env?.VITE_SUPABASE_ANON_KEY,
      "VITE_SUPABASE_ANON_KEY"
    ),
    ga4MeasurementId: readEnv(
      import.meta.env?.VITE_GA4_MEASUREMENT_ID,
      "VITE_GA4_MEASUREMENT_ID"
    ),
  };
};

export const getSiteUrl = () => getRuntimeConfig().siteUrl;
export const getApiBaseUrl = () => getRuntimeConfig().apiBaseUrl;
