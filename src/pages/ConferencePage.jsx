import { Component, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import lockup from "../assets/brand/ps-lockup-notag-light-outlined.svg";
import { createConferenceSession } from "../lib/conferenceApi.js";

export const CONFERENCE_KICKER = "Conservative Party Conference, Birmingham, 4 to 7 October 2026";

export function ConferenceContacts() {
  return (
    <address className="conference-contacts">
      <a href="tel:+447525167856">07525 167 856</a>
      <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>
      <a href="https://www.linkedin.com/in/paulstartin/">Paul on LinkedIn</a>
    </address>
  );
}

export class ConferenceFormBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.error("Conference form could not render."); }
  render() {
    return this.state.failed ? (
      <div role="alert" className="conference-status">
        <p>The form is temporarily unavailable. Please contact Paul directly.</p>
        <ConferenceContacts />
      </div>
    ) : this.props.children;
  }
}

export function ConferenceForm({ session }) {
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const successRef = useRef(null);
  const errorRef = useRef(null);
  useEffect(() => { setReady(true); }, []);

  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    const fields = {
      name: String(data.get("name") || "").trim(),
      organisation: String(data.get("organisation") || "").trim(),
      email: String(data.get("email") || "").trim(),
      message: String(data.get("message") || "").trim(),
      website: String(data.get("website") || ""),
      consent: data.get("consent") === "on",
      followupConsent: data.get("followupConsent") === "on",
    };
    if (!fields.name || !fields.email || !fields.consent) {
      setError("Please enter your name and email and confirm permission to handle your enquiry.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await session.submit(fields);
      setSent(true);
    } catch (failure) {
      setError(failure.message || "Your details could not be saved. Please try again or contact Paul below.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (sent) return (
    <div className="conference-status" role="status" tabIndex={-1} ref={successRef}>
      <h2>Thanks. I will come back to you.</h2>
      <ConferenceContacts />
    </div>
  );

  return (
    <form method="post" onSubmit={submit} className="conference-form" aria-labelledby="conference-form-title" aria-busy={busy || !ready}>
      <h2 id="conference-form-title">Leave me your details</h2>
      <noscript><p>Please enable JavaScript to use the form, or contact Paul using the details below.</p></noscript>
      <div className="conference-field">
        <label htmlFor="conference-name">Name</label>
        <input id="conference-name" name="name" autoComplete="name" required maxLength={100} />
      </div>
      <div className="conference-field">
        <label htmlFor="conference-organisation">Organisation <span>(optional)</span></label>
        <input id="conference-organisation" name="organisation" autoComplete="organization" maxLength={200} />
      </div>
      <div className="conference-field">
        <label htmlFor="conference-email">Email</label>
        <input id="conference-email" name="email" type="email" autoComplete="email" required maxLength={254} />
      </div>
      <div className="conference-field">
        <label htmlFor="conference-message">What are you working on? <span>(optional)</span></label>
        <textarea id="conference-message" name="message" rows={3} maxLength={2000} />
      </div>
      <div className="conference-trap" aria-hidden="true" inert>
        <label htmlFor="conference-website">Leave this field empty</label>
        <input id="conference-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="conference-check">
        <input type="checkbox" name="consent" required />
        <span>I consent to Political Solutions using my details, including any political affiliation I choose to share, to handle this enquiry and for Paul Startin to contact me about it. See the <Link to="/privacy#enquiries" reloadDocument target="_blank" rel="noopener">privacy notice (opens in a new tab)</Link>.</span>
      </label>
      <label className="conference-check">
        <input type="checkbox" name="followupConsent" />
        <span>Paul may also email me about relevant Political Solutions services and next conference season for up to 12 months. <span className="conference-optional">Optional. Withdraw at any time.</span></span>
      </label>
      <div aria-live="polite" aria-atomic="true">
        {error && <div className="conference-error" ref={errorRef} tabIndex={-1}><p>{error}</p><ConferenceContacts /></div>}
      </div>
      <button className="button conference-send" type="submit" disabled={busy || !ready}>{busy ? "Sending…" : "Send"}</button>
    </form>
  );
}

export default function ConferencePage({ kicker = CONFERENCE_KICKER }) {
  const [session] = useState(createConferenceSession);
  useEffect(() => {
    // Cookie-free visit counting is independent of rendering and submission.
    session.visit().catch(() => {});
  }, [session]);

  return (
    <article className="conference-page">
      <Link className="conference-lockup" to="/" reloadDocument aria-label="Political Solutions home">
        <img src={lockup} alt="Political Solutions" width="194" />
      </Link>
      <header className="conference-intro">
        {kicker && <p className="conference-kicker">{kicker}</p>}
        <h1>Paul Startin</h1>
        <p className="conference-standfirst">Political Solutions</p>
        <p>Tell me about your project and I will come back to you.</p>
      </header>
      <ConferenceFormBoundary><ConferenceForm session={session} /></ConferenceFormBoundary>
      <ConferenceContacts />
      <Link className="conference-more" to="/" reloadDocument>More about what we do</Link>
    </article>
  );
}
