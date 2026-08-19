const readEnv = (key) => {
  const viteValues = {
    VITE_COGNITO_DOMAIN: import.meta.env.VITE_COGNITO_DOMAIN,
    VITE_COGNITO_CLIENT_ID: import.meta.env.VITE_COGNITO_CLIENT_ID,
    VITE_COGNITO_REDIRECT_URI: import.meta.env.VITE_COGNITO_REDIRECT_URI,
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    VITE_ENQUIRY_API_URL: import.meta.env.VITE_ENQUIRY_API_URL,
  };
  const processValue =
    typeof process !== "undefined" && process.env ? process.env[key] : undefined;
  const value = typeof viteValues[key] === "string" ? viteValues[key] : processValue;
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
