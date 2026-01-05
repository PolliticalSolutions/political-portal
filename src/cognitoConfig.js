// Basic Cognito Hosted UI settings. Replace placeholders with your actual values.
export const cognitoConfig = {
  domain: "https://eu-west-2rlruaqyij.auth.eu-west-2.amazoncognito.com",
  clientId: "6c0l6a3fntgqj2n7rfjcuss61l",
  redirectUri: "https://www.politicalsolutions.uk/callback", // change to http://localhost:5173/callback for local dev
  scope: "openid email profile",
};
