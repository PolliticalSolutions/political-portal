const readEnv = (key) => {
  const source =
    typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : process.env;
  const value = source ? source[key] : undefined;
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
  const siteUrl = normalizeSiteUrl(readEnv("VITE_SITE_URL"));
  const apiBaseUrl = normalizeBaseUrl(
    readEnv("VITE_API_BASE_URL") || readEnv("VITE_ENQUIRY_API_URL")
  );
  return {
    siteUrl,
    apiBaseUrl,
    enquiryApiUrl: normalizeBaseUrl(readEnv("VITE_ENQUIRY_API_URL")),
    apiBaseUrlExplicit: normalizeBaseUrl(readEnv("VITE_API_BASE_URL")),
    uploadApiBaseUrl: normalizeBaseUrl(readEnv("VITE_UPLOAD_API_URL")),
    cognitoDomain: readEnv("VITE_COGNITO_DOMAIN"),
    cognitoClientId: readEnv("VITE_COGNITO_CLIENT_ID"),
    cognitoRedirectUri: readEnv("VITE_COGNITO_REDIRECT_URI"),
    cognitoLogoutUri: readEnv("VITE_COGNITO_LOGOUT_URI"),
    supabaseUrl: readEnv("VITE_SUPABASE_URL"),
    supabaseAnonKey: readEnv("VITE_SUPABASE_ANON_KEY"),
    supabaseServiceKey: readEnv("VITE_SUPABASE_SERVICE_KEY"),
  };
};

export const getSiteUrl = () => getRuntimeConfig().siteUrl;
export const getApiBaseUrl = () => getRuntimeConfig().apiBaseUrl;
