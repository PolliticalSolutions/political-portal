const authConfig = {
  domain: "https://eu-west-2rlruaqyij.auth.eu-west-2.amazoncognito.com",
  clientId: "7urromj42jc77viclhle0e2gkf",
  redirectUri: window.location.origin,
  responseType: "code",
  scope: "openid profile email phone"
};

export default authConfig;
