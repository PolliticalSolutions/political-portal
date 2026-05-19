import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useCampaignAccess } from "../../../hooks/useCampaignAccess.js";
import { supabase } from "../../../lib/supabaseClient.js";
import { getCandidateActivity } from "../../../lib/campaignApi.js";
import { SESSION_TYPE_LABELS, SESSION_TYPE_ORDER } from "../../../lib/campaignConfig.js";
import "./campaigns.css";

export default function CandidateActivityPage() {
  const access = useCampaignAccess();
  const [individuals, setIndividuals] = useState([]);
  const [activities, setActivities] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (access.loading) return;
    if (!access.access || !access.access.isAdmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    // Aggregate distinct cognito_subs that have ever RSVP'd.
    supabase
      .from("session_rsvps")
      .select("cognito_sub, display_name, user_email, attendance_status")
      .then(async ({ data }) => {
        if (cancelled) return;
        const map = new Map();
        for (const r of data || []) {
          if (!map.has(r.cognito_sub)) {
            map.set(r.cognito_sub, { sub: r.cognito_sub, displayName: r.display_name, email: r.user_email });
          }
        }
        const list = Array.from(map.values()).sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
        setIndividuals(list);

        // Fetch activity per individual in parallel.
        const results = await Promise.all(list.map((p) => getCandidateActivity(p.sub).then((a) => [p.sub, a])));
        if (cancelled) return;
        const byId = {};
        for (const [sub, activity] of results) byId[sub] = activity;
        setActivities(byId);
        setLoading(false);
      })
      .then(undefined, (err) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [access.loading, access.access]);

  if (access.loading || loading) return <div className="page stack"><p style={{ color: "var(--portal-text-muted)" }}>Loading…</p></div>;
  if (!access.access || !access.access.isAdmin) {
    return <div className="page stack"><p>This view is admin-only.</p></div>;
  }
  if (error) return <div className="page stack"><p role="alert" style={{ color: "var(--portal-danger)" }}>{error}</p></div>;

  const filtered = search
    ? individuals.filter((p) =>
        (p.displayName || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.email || "").toLowerCase().includes(search.toLowerCase())
      )
    : individuals;

  return (
    <div className="page stack campaigns-page">
      <Helmet><title>Candidate activity — Political Solutions</title></Helmet>
      <p style={{ margin: 0 }}>
        <Link to="/portal/campaigns" style={{ color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
          ← All sessions
        </Link>
      </p>

      <header>
        <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--portal-text-primary)", letterSpacing: "-0.01em" }}>
          Candidate activity
        </h1>
        <p style={{ margin: "4px 0 0 0", color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
          Aggregated campaign activity across portal users, including total sessions attended, breakdown by type,
          and associations/regions where each individual has been active. Feeds CCHQ candidate assessment.
        </p>
      </header>

      <div className="campaigns-form-row" style={{ maxWidth: 360 }}>
        <label htmlFor="activity-search">Search</label>
        <input
          id="activity-search"
          type="search"
          placeholder="Name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "var(--portal-text-muted)" }}>No matching activity yet.</p>
      ) : (
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4 }}>
          <thead>
            <tr>
              <th align="left">Person</th>
              <th align="left">Total attended</th>
              {SESSION_TYPE_ORDER.map((t) => <th key={t} align="left">{SESSION_TYPE_LABELS[t]}</th>)}
              <th align="left">Created</th>
              <th align="left">Regions</th>
              <th align="left">Most recent</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const a = activities[p.sub] || { totalAttended: 0, byType: {}, regions: [], lastAt: null, sessionsCreated: 0 };
              return (
                <tr key={p.sub}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.displayName || "Unnamed"}</div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--portal-text-muted)" }}>{p.email}</div>
                  </td>
                  <td>{a.totalAttended}</td>
                  {SESSION_TYPE_ORDER.map((t) => <td key={t}>{a.byType[t] || 0}</td>)}
                  <td>{a.sessionsCreated}</td>
                  <td>{a.regions.join(", ") || "—"}</td>
                  <td>{a.lastAt ? new Date(a.lastAt).toLocaleDateString("en-GB") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
