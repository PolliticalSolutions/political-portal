import { getRuntimeConfig } from "./config/runtimeConfig.js";

// Basic Cognito Hosted UI settings.
const runtimeConfig = getRuntimeConfig();

export const cognitoConfig = {
  domain: runtimeConfig.cognitoDomain,
  clientId: runtimeConfig.cognitoClientId,
  redirectUri: runtimeConfig.cognitoRedirectUri,
  logoutUri: runtimeConfig.cognitoLogoutUri,
  scope: "openid email profile",
};
