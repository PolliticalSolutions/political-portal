import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import { cognitoConfig } from "../cognitoConfig.js";

const failureMessage =
  "Verification failed. The link may have expired. Please contact admin@politicalsolutions.uk";

async function confirmSignUp({ username, code }) {
  if (!cognitoConfig.clientId) {
    throw new Error("Missing Cognito client ID.");
  }
  const response = await fetch("https://cognito-idp.eu-west-2.amazonaws.com/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.ConfirmSignUp",
    },
    body: JSON.stringify({
      ClientId: cognitoConfig.clientId,
      Username: username,
      ConfirmationCode: code,
    }),
  });
  if (!response.ok) {
    throw new Error("Verification failed.");
  }
}

export default function Verify() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const code =
      searchParams.get("code") ||
      searchParams.get("confirmation_code") ||
      searchParams.get("confirmationCode") ||
      "";
    const username =
      searchParams.get("username") ||
      searchParams.get("user_name") ||
      searchParams.get("email") ||
      "";

    async function verifyEmail() {
      try {
        if (!code || !username) throw new Error("Missing verification parameters.");
        await confirmSignUp({ username, code });
        if (!cancelled) navigate("/login?verified=true", { replace: true });
      } catch {
        if (!cancelled) setError(failureMessage);
      }
    }

    verifyEmail();
    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <div className="page">
      <section className="section">
        <div className="container centered">
          <Card>
            <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Verify email</h1>
            {error ? (
              <div className="status error">{error}</div>
            ) : (
              <div className="status">Verifying your email address...</div>
            )}
          </Card>
        </div>
      </section>
      <Footer />
    </div>
  );
}
