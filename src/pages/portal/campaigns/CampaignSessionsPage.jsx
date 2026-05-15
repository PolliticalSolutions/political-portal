import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import SessionCard from "../../../components/campaigns/SessionCard.jsx";
import { useCampaignAccess } from "../../../hooks/useCampaignAccess.js";
import { listSessionsForUser } from "../../../lib/campaignApi.js";
import { supabase } from "../../../lib/supabaseClient.js";
import "./campaigns.css";

const SessionMap = lazy(() => import("../../../components/campaigns/SessionMap.jsx"));

export default function CampaignSessionsPage() {
  const access = useCampaignAccess();
  const [sessions, setSessions] = useState([]);
  const [rsvpCounts, setRsvpCounts] = useState({});
  const [onsCodeBySession, setOnsCodeBySession] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("map"); // "map" | "list"

  useEffect(() => {
    if (access.loading) return;
    let cancelled = false;
    setLoading(true);
    listSessionsForUser(access.access || emptyAccess())
      .then(async (data) => {
        if (cancelled) return;
        setSessions(data);
        // RSVP counts in one round trip per page render.
        if (data.length > 0) {
          const { data: rows } = await supabase
            .from("session_rsvps")
            .select("session_id")
            .in("session_id", data.map((s) => s.id));
          const counts = {};
          for (const r of rows || []) counts[r.session_id] = (counts[r.session_id] || 0) + 1;
          if (!cancelled) setRsvpCounts(counts);
          // Constituency ons_codes for map pin placement.
          const { data: constituencies } = await supabase
            .from("constituencies")
            .select("id, ons_code")
            .in("id", Array.from(new Set(data.map((s) => s.constituency_id))));
          const map = {};
          for (const c of constituencies || []) map[c.id] = c.ons_code;
          if (!cancelled) setOnsCodeBySession(Object.fromEntries(data.map((s) => [s.id, map[s.constituency_id]])));
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [access.loading, access.access]);

  const sessionsWithOns = useMemo(
    () => sessions.map((s) => ({ ...s, constituency_ons_code: onsCodeBySession[s.id] || null })),
    [sessions, onsCodeBySession]
  );

  const totals = useMemo(() => {
    const upcoming = sessions.filter((s) => s.session_date >= new Date().toISOString().slice(0, 10) && s.status === "published").length;
    const totalRsvps = Object.values(rsvpCounts).reduce((a, b) => a + b, 0);
    return { upcoming, totalRsvps };
  }, [sessions, rsvpCounts]);

  const canCreate = access.access && (access.access.isAdmin || access.access.isCampaignManagerFor.size > 0);

  return (
    <div className="page stack campaigns-page">
      <Helmet>
        <title>Campaign sessions — Political Solutions</title>
      </Helmet>

      <header className="campaigns-header">
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--portal-text-primary)", letterSpacing: "-0.01em" }}>
            Campaign sessions
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
            Coordinate canvassing, leafleting, phone banking, and committee-room sessions across your region.
          </p>
        </div>
        {canCreate && (
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <Button as={Link} to="/portal/campaigns/bulk-upload" variant="secondary">
              Bulk upload
            </Button>
            <Button as={Link} to="/portal/campaigns/create">
              Create session
            </Button>
          </div>
        )}
      </header>

      <section className="campaigns-summary">
        <SummaryCard label="Upcoming sessions" value={totals.upcoming} />
        <SummaryCard label="Total RSVPs" value={totals.totalRsvps} />
        <SummaryCard label="Your access" value={accessSummary(access.access)} />
      </section>

      <div className="campaigns-view-toggle">
        <button
          type="button"
          className={view === "map" ? "is-active" : ""}
          onClick={() => setView("map")}
        >Map</button>
        <button
          type="button"
          className={view === "list" ? "is-active" : ""}
          onClick={() => setView("list")}
        >List</button>
      </div>

      {error && <p role="alert" style={{ color: "var(--portal-danger)" }}>{error}</p>}
      {loading && <p style={{ color: "var(--portal-text-muted)" }}>Loading…</p>}

      {!loading && sessions.length === 0 && (
        <EmptyState canCreate={canCreate} />
      )}

      {!loading && sessions.length > 0 && view === "map" && (
        <Suspense fallback={<p style={{ color: "var(--portal-text-muted)" }}>Loading map…</p>}>
          <SessionMap
            sessions={sessionsWithOns}
            onPinClick={(s) => { window.location.href = `/portal/campaigns/${s.id}`; }}
          />
        </Suspense>
      )}

      {!loading && sessions.length > 0 && view === "list" && (
        <div className="campaigns-grid">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} rsvpCount={rsvpCounts[s.id] || 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="campaigns-summary-card">
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--portal-text-secondary)" }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--portal-text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ canCreate }) {
  return (
    <div style={{
      background: "var(--portal-surface)",
      border: "1px solid var(--portal-border)",
      borderRadius: 4,
      padding: "var(--space-10)",
      textAlign: "center",
    }}>
      <h2 style={{ margin: 0, fontSize: "var(--text-xl)", color: "var(--portal-text-primary)" }}>
        No sessions in your area yet
      </h2>
      <p style={{ margin: "var(--space-3) 0 var(--space-5) 0", color: "var(--portal-text-secondary)" }}>
        {canCreate
          ? "Create your first session to start coordinating volunteers."
          : "When your association schedules campaign sessions they'll appear here."}
      </p>
      {canCreate && (
        <Button as={Link} to="/portal/campaigns/create">Create session</Button>
      )}
    </div>
  );
}

function accessSummary(access) {
  if (!access) return "—";
  if (access.isAdmin) return "Admin";
  if (access.isCampaignManagerFor.size > 0) return "Campaign manager";
  if (access.isCoordinatorFor.size > 0) return "Coordinator";
  if (access.regionalViewerOf.size > 0) return "Regional viewer";
  return "Member";
}

function emptyAccess() {
  return {
    isAdmin: false,
    isCampaignManagerFor: new Set(),
    isCoordinatorFor: new Set(),
    regionalViewerOf: new Set(),
    userRegions: new Set(),
  };
}
