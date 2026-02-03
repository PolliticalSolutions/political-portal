const readEnv = (key) => {
  const source =
    typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : process.env;
  const value = source ? source[key] : undefined;
  if (typeof value !== "string") return "";
  return value.trim();
};

export const getMissingEnvKeys = () => {
  const missing = [];
  const requiredKeys = [
    "VITE_COGNITO_DOMAIN",
    "VITE_COGNITO_CLIENT_ID",
    "VITE_COGNITO_REDIRECT_URI",
  ];

  requiredKeys.forEach((key) => {
    if (!readEnv(key)) {
      missing.push(key);
    }
  });

  const hasApiBase =
    Boolean(readEnv("VITE_API_BASE_URL")) || Boolean(readEnv("VITE_ENQUIRY_API_URL"));
  if (!hasApiBase) {
    missing.push("VITE_API_BASE_URL");
    missing.push("VITE_ENQUIRY_API_URL");
  }

  return missing;
};

export const validateEnv = () => {
  const missing = getMissingEnvKeys();
  if (missing.length > 0) {
    const error = new Error(`Missing required environment variables: ${missing.join(", ")}`);
    error.missingKeys = missing;
    throw error;
  }
};
