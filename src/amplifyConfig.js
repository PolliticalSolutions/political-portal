const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: "eu-west-2_rLrUAqYiJ",
      userPoolClientId: "7urromj42jc77vichle0e2gkf",
      loginWith: {
        oauth: {
          domain: "eu-west-2rlruaqyij.auth.eu-west-2.amazoncognito.com", 
          scopes: ["openid", "email", "profile"],
          redirectSignIn: [
            "http://localhost:3000/",
            "https://www.politicalsolutions.uk/"
          ],
          redirectSignOut: [
            "http://localhost:3000/",
            "https://www.politicalsolutions.uk/"
          ],
          responseType: "code"
        }
      }
    }
  }
};

export default amplifyConfig;
