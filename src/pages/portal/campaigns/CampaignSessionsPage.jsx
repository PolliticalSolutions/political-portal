import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import SessionCard from "../../../components/campaigns/SessionCard.jsx";
import SessionFilterBar, { readFiltersFromParams } from "../../../components/campaigns/SessionFilterBar.jsx";
import { useCampaignAccess } from "../../../hooks/useCampaignAccess.js";
import { listSessionsForUser } from "../../../lib/campaignApi.js";
import { supabase } from "../../../lib/supabaseClient.js";
import "./campaigns.css";

const SessionMap = lazy(() => import("../../../components/campaigns/SessionMap.jsx"));
const SessionCalendar = lazy(() => import("../../../components/campaigns/SessionCalendar.jsx"));

export default function CampaignSessionsPage() {
  const access = useCampaignAccess();
  const [sessions, setSessions] = useState([]);
  const [rsvpCounts, setRsvpCounts] = useState({});
  const [onsCodeBySession, setOnsCodeBySession] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [listView, setListView] = useState("list"); // "list" | "calendar"
  const [searchParams] = useSearchParams();

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

  // Apply URL-param-driven filters before handing off to map / list / calendar.
  const filteredSessions = useMemo(() => {
    const f = readFiltersFromParams(searchParams);
    const constituencySet = new Set(f.constituency.map((c) => c.toUpperCase()));
    const typeSet = new Set(f.type);
    const contextSet = new Set(f.context);

    return sessionsWithOns.filter((s) => {
      if (constituencySet.size > 0) {
        const code = (s.constituency_ons_code || "").toUpperCase();
        if (!constituencySet.has(code)) return false;
      }
      if (typeSet.size > 0) {
        const types = Array.isArray(s.session_types) ? s.session_types : [];
        if (!types.some((t) => typeSet.has(t))) return false;
      }
      if (contextSet.size > 0) {
        if (!contextSet.has(s.campaign_context)) return false;
      }
      return true;
    });
  }, [sessionsWithOns, searchParams]);

  const totals = useMemo(() => {
    const upcoming = sessions.filter((s) => s.session_date >= new Date().toISOString().slice(0, 10) && s.status === "published").length;
    const totalRsvps = Object.values(rsvpCounts).reduce((a, b) => a + b, 0);
    return { upcoming, totalRsvps };
  }, [sessions, rsvpCounts]);

  // Regions for the constituency filter dropdown (admin → all; others → their accessible regions).
  const filterRegions = useMemo(() => {
    if (!access.access) return [];
    if (access.access.isAdmin) return undefined; // undefined → no region filter (all 650)
    return Array.from(access.access.userRegions);
  }, [access.access]);

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

      {error && <p role="alert" style={{ color: "var(--portal-danger)" }}>{error}</p>}
      {loading && <p style={{ color: "var(--portal-text-muted)" }}>Loading…</p>}

      {!loading && sessions.length === 0 && (
        <EmptyState canCreate={canCreate} />
      )}

      {!loading && sessions.length > 0 && (
        <>
          <SessionFilterBar regions={filterRegions} />

          <div className="campaigns-map-wrap">
            <Suspense fallback={<p style={{ color: "var(--portal-text-muted)" }}>Loading map…</p>}>
              <SessionMap
                sessions={filteredSessions}
                onPinClick={(s) => { window.location.href = `/portal/campaigns/${s.id}`; }}
              />
            </Suspense>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "var(--space-3)" }}>
            <h2 style={{ margin: 0, fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--portal-text-primary)" }}>
              {filteredSessions.length === sessions.length
                ? `All sessions (${sessions.length})`
                : `${filteredSessions.length} of ${sessions.length} sessions`}
            </h2>
            <div className="campaigns-view-toggle">
              <button type="button" className={listView === "list" ? "is-active" : ""} onClick={() => setListView("list")}>List</button>
              <button type="button" className={listView === "calendar" ? "is-active" : ""} onClick={() => setListView("calendar")}>Calendar</button>
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--portal-text-muted)", background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4 }}>
              No sessions match your current filters.
            </div>
          ) : listView === "calendar" ? (
            <Suspense fallback={<p style={{ color: "var(--portal-text-muted)" }}>Loading calendar…</p>}>
              <SessionCalendar sessions={filteredSessions} />
            </Suspense>
          ) : (
            <div className="campaigns-grid">
              {filteredSessions.map((s) => (
                <SessionCard key={s.id} session={s} rsvpCount={rsvpCounts[s.id] || 0} />
              ))}
            </div>
          )}
        </>
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
