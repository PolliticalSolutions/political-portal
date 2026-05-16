import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import Card from "../components/Card.jsx";
import Footer from "../components/Footer.jsx";
import { submitVolunteerRsvp } from "../lib/volunteerApi.js";
import { SESSION_TYPE_LABELS } from "../lib/campaignConfig.js";

function formatDateLong(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function formatTime(t) { return t ? t.slice(0, 5) : ""; }

export default function VolunteerRsvpPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState({ loading: true, result: null, error: "" });

  useEffect(() => {
    if (!token) {
      setState({ loading: false, result: null, error: "This link is missing the token. Please use the link from your email." });
      return;
    }
    submitVolunteerRsvp(token)
      .then((result) => setState({ loading: false, result, error: "" }))
      .catch((err) => setState({ loading: false, result: null, error: err.message || "We couldn't process this link." }));
  }, [token]);

  return (
    <>
      <Helmet><title>Confirm your RSVP — Political Solutions</title></Helmet>
      <div className="container" style={{ padding: "var(--space-12) 0", maxWidth: 640 }}>
        <Card>
          {state.loading && <p style={{ margin: 0, color: "var(--color-text-muted)" }}>Confirming your RSVP…</p>}
          {state.error && <ResultMessage title="We couldn't confirm this link" body={state.error} />}
          {state.result && state.result.expired && <ResultMessage title="This link has expired" body="Visit politicalsolutions.uk/campaign/volunteer to see the latest sessions." />}
          {state.result && state.result.cancelled && <ResultMessage title="Session cancelled" body="This session has been cancelled. Look out for the next weekly email." />}
          {state.result && state.result.sessionFull && state.result.session && (
            <ResultMessage title="Session full" body={`The ${state.result.session.title} session is now full. Watch out for similar sessions in your next weekly email.`} />
          )}
          {state.result && state.result.alreadyRsvpd && state.result.session && (
            <ResultMessage title="You're already registered" body={`We already have you down for ${state.result.session.title}. See you on ${formatDateLong(state.result.session.session_date)}.`} />
          )}
          {state.result && state.result.ok && !state.result.alreadyRsvpd && !state.result.sessionFull && !state.result.cancelled && state.result.session && (
            <SuccessRsvp session={state.result.session} />
          )}
        </Card>
      </div>
      <Footer />
    </>
  );
}

function SuccessRsvp({ session }) {
  return (
    <div>
      <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", color: "var(--color-navy)", letterSpacing: "-0.01em" }}>
        You're in. See you there.
      </h1>
      <p style={{ marginTop: "var(--space-4)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
        We've confirmed your RSVP for the {((Array.isArray(session.session_types) && SESSION_TYPE_LABELS[session.session_types[0]]) || "campaign").toLowerCase()} session below.
      </p>
      <div style={{ marginTop: "var(--space-5)", padding: "var(--space-4)", border: "1px solid var(--color-border)", borderRadius: 4 }}>
        <div style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--color-navy)" }}>{session.title}</div>
        <div style={{ marginTop: 6, color: "var(--color-text-secondary)", lineHeight: 1.6, fontSize: "var(--text-sm)" }}>
          {formatDateLong(session.session_date)} at {formatTime(session.start_time)}<br />
          {session.venue_name && <><strong>{session.venue_name}</strong><br /></>}
          {session.street_address}
          {session.postcode && <><br />{session.postcode}</>}
          <br />
          Contact: {session.contact_name}
        </div>
      </div>
    </div>
  );
}

function ResultMessage({ title, body }) {
  return (
    <div>
      <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", color: "var(--color-navy)", letterSpacing: "-0.01em" }}>{title}</h1>
      <p style={{ marginTop: "var(--space-4)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}
