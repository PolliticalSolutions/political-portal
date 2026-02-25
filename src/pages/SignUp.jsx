import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import associations from "../data/associations.json";
import { calculateFederationPricing } from "../portal/pricing/federationPricing.js";
import { startSignUp } from "../lib/cognito.js";
import { isSafeInternalPath, setPostAuthRedirect } from "../utils/postAuthRedirect.js";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function SignUp() {
  const [error, setError] = useState(null);
  const [searchParams] = useSearchParams();
  const association = searchParams.get("association") ?? "";
  const countParam = Number(searchParams.get("count") ?? 0);
  const queryString = searchParams.toString();
  const enquireLink = queryString ? `/enquire?${queryString}` : "/enquire";
  const returnToParam = searchParams.get("returnTo") ?? "";
  const storedReturnTo =
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem("ps_post_auth_redirect_v1") : "";
  const safeStoredReturnTo = isSafeInternalPath(storedReturnTo) ? storedReturnTo : "";
  const safeReturnTo = isSafeInternalPath(returnToParam) ? returnToParam : "";
  const loginLink = safeReturnTo ? `/login?${new URLSearchParams({ returnTo: safeReturnTo })}` : "/login";

  const constituencies = useMemo(() => {
    if (!association) return [];
    return associations.byAssociation[association] ?? [];
  }, [association]);

  const constituencyCount = constituencies.length || countParam;
  const pricing = association && constituencyCount ? calculateFederationPricing(constituencyCount) : null;

  useEffect(() => {
    if (!association && !constituencyCount) return;
    const payload = {
      association,
      constituencyCount,
      constituencies,
      query: queryString,
      storedAt: new Date().toISOString(),
    };
    sessionStorage.setItem("ps_signup_context_v1", JSON.stringify(payload));
  }, [association, constituencyCount, constituencies, queryString]);

  useEffect(() => {
    if (safeReturnTo) {
      setPostAuthRedirect(safeReturnTo);
    }
  }, [safeReturnTo]);

  const handleCreateAccount = async () => {
    setError(null);
    try {
      await startSignUp("/portal");
    } catch (err) {
      setError(err.message || "Sign-up failed to start.");
    }
  };

  return (
    <div className="page">
      <section className="section">
        <div className="container centered">
          <Card>
            <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Create account</h1>
            {association || constituencyCount ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Pricing context captured</div>
                  {constituencyCount ? (
                    <div className="muted" style={{ marginTop: 4 }}>
                      {constituencyCount} constituenc{constituencyCount === 1 ? "y" : "ies"}
                    </div>
                  ) : null}
                </div>
                {pricing && (
                  <div style={{ marginBottom: 16 }}>
                    <div>Total (ex VAT): {gbp.format(pricing.netTotal)}</div>
                    <div>VAT (20%): {gbp.format(pricing.vatTotal)}</div>
                    <div>Total (inc VAT): {gbp.format(pricing.grossTotal)}</div>
                  </div>
                )}
              </>
            ) : null}
            <div className="stack" style={{ marginTop: 16 }}>
              <Button variant="primary" onClick={handleCreateAccount}>
                Create account
              </Button>
              <Button as={Link} to={enquireLink} variant="ghost">
                Prefer to ask a question first?
              </Button>
              <Button as={Link} to={loginLink} variant="ghost">
                Already have an account? Sign in
              </Button>
              {error && <div className="status error">{error}</div>}
            </div>
          </Card>
        </div>
      </section>
      <Footer />
    </div>
  );
}
