import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import { unsubscribeVolunteer } from "../lib/volunteerApi.js";

export default function VolunteerUnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState({ loading: true, ok: false, expired: false, error: "" });

  useEffect(() => {
    if (!token) {
      setState({ loading: false, ok: false, expired: false, error: "This link is missing the token. Please use the link from your email." });
      return;
    }
    unsubscribeVolunteer(token)
      .then((result) => {
        if (result && result.expired) setState({ loading: false, ok: false, expired: true, error: "" });
        else setState({ loading: false, ok: Boolean(result && result.ok), expired: false, error: "" });
      })
      .catch((err) => setState({ loading: false, ok: false, expired: false, error: err.message || "Unsubscribe failed." }));
  }, [token]);

  return (
    <>
      <Helmet><title>Unsubscribe — Political Solutions</title></Helmet>
      <div className="container" style={{ padding: "var(--space-12) 0", maxWidth: 640 }}>
        <Card>
          {state.loading && <p style={{ margin: 0, color: "var(--color-text-muted)" }}>Updating your preferences…</p>}

          {state.ok && (
            <div>
              <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", color: "var(--color-navy)", letterSpacing: "-0.01em" }}>
                You've been unsubscribed
              </h1>
              <p style={{ marginTop: "var(--space-4)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                You will no longer receive campaign session emails. You can sign up again any time at{" "}
                <a href="/campaign/volunteer" style={{ color: "var(--color-navy)", fontWeight: 600 }}>
                  politicalsolutions.uk/campaign/volunteer
                </a>.
              </p>
            </div>
          )}

          {state.expired && (
            <div>
              <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", color: "var(--color-navy)" }}>Link expired</h1>
              <p style={{ marginTop: "var(--space-4)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                This unsubscribe link has expired. Open a recent campaign email and try the link there, or get in touch at{" "}
                <a href="mailto:campaigns@politicalsolutions.uk" style={{ color: "var(--color-navy)", fontWeight: 600 }}>
                  campaigns@politicalsolutions.uk
                </a>.
              </p>
            </div>
          )}

          {state.error && (
            <div>
              <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", color: "var(--color-navy)" }}>We couldn't process that link</h1>
              <p style={{ marginTop: "var(--space-4)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{state.error}</p>
            </div>
          )}
        </Card>
      </div>
      <Footer />
    </>
  );
}
