import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearStoredSession, getStoredTokens, refreshTokens, startLogout } from "./lib/cognito.js";
import { clearMeCache } from "./lib/uploadApi.js";
import { useCart } from "./cart/cartStore.jsx";
import { getSession } from "./auth/session.js";
import CookieNotice from "./components/CookieNotice.jsx";
import IdleWarning from "./components/IdleWarning.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Callback from "./pages/Callback.jsx";
import Cart from "./pages/Cart.jsx";
import CartEntry from "./pages/CartEntry.jsx";
import Checkout from "./pages/Checkout.jsx";
import CheckoutEntry from "./pages/CheckoutEntry.jsx";
import CheckoutConfirmation from "./pages/CheckoutConfirmation.jsx";
import CheckoutConfirmationEntry from "./pages/CheckoutConfirmationEntry.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
// Public pages — lazy split so Supabase and heavy deps only load when needed
const BlogIndexPage = lazy(() => import("./pages/BlogIndexPage.jsx"));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage.jsx"));
const ConstituencyIntelligence = lazy(() => import("./pages/ConstituencyIntelligence.jsx"));
const EnquirePage = lazy(() => import("./pages/EnquirePage.jsx"));
const ServiceSupport = lazy(() => import("./pages/ServiceSupport.jsx"));
const Services = lazy(() => import("./pages/Services.jsx"));
const Subscribe = lazy(() => import("./pages/Subscribe.jsx"));
const PortalLayout = lazy(() => import("./pages/portal/PortalLayout.jsx"));
const PortalNotFound = lazy(() => import("./pages/portal/PortalNotFound.jsx"));
const Subscriptions = lazy(() => import("./pages/Subscriptions.jsx"));
const PricingRules = lazy(() => import("./pages/portal/PricingRules.jsx"));
const Uploads = lazy(() => import("./pages/portal/Uploads.jsx"));
const Dashboard = lazy(() => import("./pages/portal/Dashboard.jsx"));
const Integrations = lazy(() => import("./pages/portal/Integrations.jsx"));
const Quotes = lazy(() => import("./pages/portal/Quotes.jsx"));
const QuoteDetail = lazy(() => import("./pages/portal/QuoteDetail.jsx"));
const ManualReviewPage = lazy(() => import("./pages/portal/admin/ManualReviewPage.jsx"));
const PermissionsPage = lazy(() => import("./pages/portal/admin/PermissionsPage.jsx"));
const AssociationsPage = lazy(() => import("./pages/portal/admin/AssociationsPage.jsx"));
const ElectionsPage = lazy(() => import("./pages/portal/admin/ElectionsPage.jsx"));
const SystemHealthPage = lazy(() => import("./pages/portal/admin/SystemHealthPage.jsx"));
const CRMApp = lazy(() => import("./pages/portal/crm/CRMApp.jsx"));
const DataSourcesPage = lazy(() => import("./pages/portal/DataSourcesPage.jsx"));
const ConstituencyIndex = lazy(() => import("./pages/portal/constituency/ConstituencyIndex.jsx"));
const ConstituencyDetail = lazy(() => import("./pages/portal/constituency/ConstituencyDetail.jsx"));
const VulnerabilityDashboard = lazy(() => import("./pages/portal/constituency/VulnerabilityDashboard.jsx"));
const ReformThreatIndex = lazy(() => import("./pages/portal/constituency/ReformThreatIndex.jsx"));
const AlertsPage = lazy(() => import("./pages/portal/alerts/AlertsPage.jsx"));
const ByElectionRiskDashboard = lazy(() => import("./pages/portal/alerts/ByElectionRiskDashboard.jsx"));
const LocalGovIndex = lazy(() => import("./pages/portal/local-government/LocalGovIndex.jsx"));
const LocalGovDetail = lazy(() => import("./pages/portal/local-government/LocalGovDetail.jsx"));
const LGRTrackerPage = lazy(() => import("./pages/portal/local-government/LGRTrackerPage.jsx"));
const ByElectionWatchPage = lazy(() => import("./pages/portal/analytics/ByElectionWatchPage.jsx"));
const CorrelationsPage = lazy(() => import("./pages/portal/analytics/CorrelationsPage.jsx"));
const ModelPerformancePage = lazy(() => import("./pages/portal/analytics/ModelPerformancePage.jsx"));
const TargetSeatsPage = lazy(() => import("./pages/portal/constituency/TargetSeatsPage.jsx"));
const LibDemThreatPage = lazy(() => import("./pages/portal/constituency/LibDemThreatPage.jsx"));
const GreenThreatPage = lazy(() => import("./pages/portal/constituency/GreenThreatPage.jsx"));
const ScenarioPage = lazy(() => import("./pages/portal/analytics/ScenarioPage.jsx"));
const MPPersona = lazy(() => import("./pages/portal/MPPersona.jsx"));
const CampaignSessionsPage = lazy(() => import("./pages/portal/campaigns/CampaignSessionsPage.jsx"));
const SessionDetailPage = lazy(() => import("./pages/portal/campaigns/SessionDetailPage.jsx"));
const SessionCreatePage = lazy(() => import("./pages/portal/campaigns/SessionCreatePage.jsx"));
const SessionEditPage = lazy(() => import("./pages/portal/campaigns/SessionEditPage.jsx"));
const BulkUploadPage = lazy(() => import("./pages/portal/campaigns/BulkUploadPage.jsx"));
const SessionAttendancePage = lazy(() => import("./pages/portal/campaigns/SessionAttendancePage.jsx"));
const SessionRegisterPage = lazy(() => import("./pages/portal/campaigns/SessionRegisterPage.jsx"));
const CandidateActivityPage = lazy(() => import("./pages/portal/campaigns/CandidateActivityPage.jsx"));
const VolunteerListPage = lazy(() => import("./pages/portal/campaigns/VolunteerListPage.jsx"));
const VolunteerDetailPage = lazy(() => import("./pages/portal/campaigns/VolunteerDetailPage.jsx"));
const VolunteerSignUpPage = lazy(() => import("./pages/VolunteerSignUpPage.jsx"));
const VolunteerRsvpPage = lazy(() => import("./pages/VolunteerRsvpPage.jsx"));
const VolunteerUnsubscribePage = lazy(() => import("./pages/VolunteerUnsubscribePage.jsx"));
import Session from "./pages/Session.jsx";
import SignUp from "./pages/SignUp.jsx";
import Verify from "./pages/Verify.jsx";
const CookiesPage = lazy(() => import("./pages/legal/CookiesPage.jsx"));
const PrivacyPage = lazy(() => import("./pages/legal/PrivacyPage.jsx"));
const TermsPage = lazy(() => import("./pages/legal/TermsPage.jsx"));
import brandLogo from "./assets/brand/political-solutions-logo.webp";
import RouteSeo from "./seo/RouteSeo.jsx";
import { usePageTracking, _devGaId } from "./lib/analytics.js";

function GaDebugBadge() {
  if (!import.meta.env.DEV) return null;
  const active = Boolean(_devGaId);
  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 9999,
        padding: "4px 10px",
        borderRadius: 4,
        fontSize: 12,
        fontFamily: "monospace",
        background: active ? "#166534" : "#991b1b",
        color: "#fff",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {active ? `GA: active (${_devGaId})` : "GA: missing ID"}
    </div>
  );
}

const WARNING_DELAY_MS = 8 * 60 * 60 * 1000; // 8 hours before showing the warning
const WARNING_WINDOW_MS = 60 * 1000; // 1 minute countdown before auto-logout
const WARNING_SECONDS = WARNING_WINDOW_MS / 1000;

function NavLinkButton({ to, onClick, variant = "ghost", children, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        ["navLink", `navLink--${variant}`, isActive ? "active" : ""].filter(Boolean).join(" ")
      }
    >
      {children}
    </NavLink>
  );
}

function TopNav({ authed, onLogout, cartCount }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`topbar${scrolled ? " topbar--scrolled" : ""}`}>
      <div className="container topbar-inner">
        <Link className="brand" to="/" onClick={closeMenu}>
          <img
            className="brand-logo"
            src={brandLogo}
            alt="Political Solutions"
            width={48}
            height={48}
            loading="eager"
          />
          <div className="brand-text">
            <div className="brand-name">Political Solutions</div>
            <div className="muted brand-tagline">
              UK Political Operations Platform
            </div>
          </div>
        </Link>
        <button
          type="button"
          className="nav-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="site-nav"
        >
          Menu
        </button>
        <div id="site-nav" className={`nav-panel${menuOpen ? " open" : ""}`}>
          <nav className="nav">
            <NavLinkButton to="/services" onClick={closeMenu}>
              Services
            </NavLinkButton>
            <NavLinkButton to="/enquire" onClick={closeMenu} end>
              Contact
            </NavLinkButton>
            <NavLinkButton to="/blog" onClick={closeMenu} end>
              Blog
            </NavLinkButton>
          </nav>
          <div className="nav-cta">
            <NavLinkButton to="/login" variant="emphasis" onClick={closeMenu} end>
              Client login
            </NavLinkButton>
            {authed && (
              <NavLinkButton to="/portal" onClick={closeMenu}>
                Portal
              </NavLinkButton>
            )}
            {cartCount > 0 && (
              <NavLinkButton to="/cart" onClick={closeMenu}>
                Cart
                <span className="nav-badge">{cartCount}</span>
              </NavLinkButton>
            )}
            {authed && (
              <button type="button" className="navLink navLink--ghost" onClick={onLogout}>
                Log out
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
    },
  },
});

export default function App() {
  usePageTracking();
  const { items } = useCart();
  // Start with empty session to match server-rendered HTML (no sessionStorage on server).
  // Populate from sessionStorage after hydration to avoid React error #418.
  const [session, setSession] = useState({ isAuthed: false, user: null, expiresAt: null, tokens: null, reason: null });
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState(WARNING_SECONDS);

  const warningTimeoutRef = useRef(null);
  const logoutTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const authed = session.isAuthed;
  const tokens = authed ? session.tokens : null;

  // Hydrate session from localStorage after the initial render matches the server.
  // If tokens are expired but a refresh_token exists, silently refresh before giving up.
  useEffect(() => {
    async function hydrate() {
      const s = getSession();
      if (s.isAuthed) {
        setSession(s);
        return;
      }
      const stored = getStoredTokens();
      if (stored?.refresh_token) {
        const refreshed = await refreshTokens();
        if (refreshed) {
          setSession(getSession());
          return;
        }
      }
      setSession(s);
    }
    hydrate();
  }, []);

  const refreshSession = useCallback(() => {
    setSession(getSession());
  }, []);

  const handleClearSession = useCallback(() => {
    clearStoredSession();
    setSession({ isAuthed: false, user: null, expiresAt: null, tokens: null, reason: "cleared" });
  }, []);

  const handleLogout = useCallback(() => {
    clearMeCache();
    setSession({ isAuthed: false, user: null, expiresAt: null, tokens: null, reason: null });
    startLogout();
  }, []);

  const clearTimers = useCallback(() => {
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (logoutTimeoutRef.current) {
      clearTimeout(logoutTimeoutRef.current);
      logoutTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const startWarning = useCallback(() => {
    setShowIdleWarning(true);
    setWarningSecondsLeft(WARNING_SECONDS);

    logoutTimeoutRef.current = window.setTimeout(handleLogout, WARNING_WINDOW_MS);
    countdownIntervalRef.current = window.setInterval(() => {
      setWarningSecondsLeft((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0 && countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        return next;
      });
    }, 1000);
  }, [handleLogout]);

  const resetIdleTimers = useCallback(() => {
    clearTimers();
    setShowIdleWarning(false);
    setWarningSecondsLeft(WARNING_SECONDS);

    if (!authed) return;

    warningTimeoutRef.current = window.setTimeout(startWarning, WARNING_DELAY_MS);
  }, [authed, clearTimers, startWarning]);

  useEffect(() => {
    if (!authed) {
      clearTimers();
      setShowIdleWarning(false);
      return undefined;
    }

    resetIdleTimers();

    const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    const handleActivity = () => resetIdleTimers();

    activityEvents.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));

    return () => {
      activityEvents.forEach((event) =>
        window.removeEventListener(event, handleActivity, { passive: true })
      );
      clearTimers();
    };
  }, [authed, clearTimers, resetIdleTimers]);

  useEffect(() => {
    if (session.reason === "expired") {
      clearStoredSession({ preserveRedirect: true });
    }
  }, [session.reason]);

  useEffect(() => {
    refreshSession();
    const intervalId = window.setInterval(refreshSession, 30000);
    const handleFocus = () => refreshSession();

    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshSession]);

  const handleAuthSuccess = useCallback(
    () => {
      setSession(getSession());
    },
    []
  );

  return (
    <QueryClientProvider client={queryClient}>
    <div className="app">
      <TopNav authed={authed} onLogout={handleLogout} cartCount={items.length} />
      <main className="content">
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login authed={authed} />} />
            <Route path="/callback" element={<Callback onAuth={handleAuthSuccess} />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/enquire" element={<Suspense fallback={null}><EnquirePage /></Suspense>} />
            <Route path="/blog" element={<Suspense fallback={null}><BlogIndexPage /></Suspense>} />
            <Route path="/blog/:slug" element={<Suspense fallback={null}><BlogPostPage /></Suspense>} />
            <Route path="/cart" element={<CartEntry authed={authed} />} />
            <Route path="/checkout" element={<CheckoutEntry authed={authed} />} />
            <Route
              path="/checkout/confirmation"
              element={<CheckoutConfirmationEntry authed={authed} />}
            />
            <Route path="/subscribe" element={<Suspense fallback={null}><Subscribe /></Suspense>} />
            <Route path="/subscriptions" element={<Navigate to="/subscribe" replace />} />
            <Route path="/services" element={<Suspense fallback={null}><Services /></Suspense>} />
            <Route path="/constituency-intelligence" element={<Suspense fallback={null}><ConstituencyIntelligence /></Suspense>} />
            <Route path="/services/election-support" element={<Suspense fallback={null}><ServiceSupport /></Suspense>} />
            <Route path="/privacy" element={<Suspense fallback={null}><PrivacyPage /></Suspense>} />
            <Route path="/terms" element={<Suspense fallback={null}><TermsPage /></Suspense>} />
            <Route path="/cookies" element={<Suspense fallback={null}><CookiesPage /></Suspense>} />
            <Route path="/campaign/volunteer" element={<Suspense fallback={null}><VolunteerSignUpPage /></Suspense>} />
            <Route path="/campaign/rsvp" element={<Suspense fallback={null}><VolunteerRsvpPage /></Suspense>} />
            <Route path="/campaign/unsubscribe" element={<Suspense fallback={null}><VolunteerUnsubscribePage /></Suspense>} />
            <Route element={<ProtectedRoute authed={authed} session={session} />}>
              <Route path="/portal" element={<Suspense fallback={<div className="app-shell"><p className="muted" style={{padding:"2rem"}}>Loading…</p></div>}><PortalLayout /></Suspense>}>
                <Route index element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><Dashboard /></Suspense>} />
                <Route
                  path="session"
                  element={<Session session={session} onClear={handleClearSession} />}
                />
                <Route path="pricing" element={<Navigate to="/portal/subscriptions" replace />} />
                <Route path="pricing-rules" element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><PricingRules /></Suspense>} />
                <Route path="subscriptions" element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><Subscriptions /></Suspense>} />
                <Route path="cart" element={<Cart basePath="/portal" />} />
                <Route path="checkout" element={<Checkout basePath="/portal" />} />
                <Route
                  path="checkout/confirmation"
                  element={<CheckoutConfirmation basePath="/portal" />}
                />
                <Route path="settings/integrations" element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><Integrations /></Suspense>} />
                <Route path="uploads" element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><Uploads /></Suspense>} />
                <Route path="ops/quotes" element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><Quotes /></Suspense>} />
                <Route path="ops/quotes/:ref" element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><QuoteDetail /></Suspense>} />
                <Route path="admin/manual-review" element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><ManualReviewPage /></Suspense>} />
                <Route path="admin/users" element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><PermissionsPage /></Suspense>} />
                <Route path="admin/permissions" element={<Navigate to="/portal/admin/users" replace />} />
                <Route path="admin/associations" element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><AssociationsPage /></Suspense>} />
                <Route path="admin/elections" element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><ElectionsPage /></Suspense>} />
                <Route path="admin/system-health" element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><SystemHealthPage /></Suspense>} />
                <Route path="admin/crm/*" element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><CRMApp /></Suspense>} />
                <Route path="data-sources" element={<Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}><DataSourcesPage /></Suspense>} />
                <Route
                  path="constituency"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <ConstituencyIndex />
                    </Suspense>
                  }
                />
                <Route
                  path="constituency/:onsCode"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <ConstituencyDetail />
                    </Suspense>
                  }
                />
                <Route
                  path="constituency/vulnerability"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <VulnerabilityDashboard />
                    </Suspense>
                  }
                />
                <Route
                  path="constituency/reform-threat"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <ReformThreatIndex />
                    </Suspense>
                  }
                />
                <Route
                  path="constituency/target-seats"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <TargetSeatsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="constituency/libdem-threat"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <LibDemThreatPage />
                    </Suspense>
                  }
                />
                <Route
                  path="constituency/green-threat"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <GreenThreatPage />
                    </Suspense>
                  }
                />
                <Route
                  path="alerts"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <AlertsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="alerts/by-election-risk"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <ByElectionRiskDashboard />
                    </Suspense>
                  }
                />
                <Route
                  path="analytics/by-election-watch"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <ByElectionWatchPage />
                    </Suspense>
                  }
                />
                <Route
                  path="analytics/correlations"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <CorrelationsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="analytics/model-performance"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <ModelPerformancePage />
                    </Suspense>
                  }
                />
                <Route
                  path="analytics/scenario"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <ScenarioPage />
                    </Suspense>
                  }
                />
                <Route
                  path="local-government"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <LocalGovIndex />
                    </Suspense>
                  }
                />
                <Route
                  path="local-government/:gssCode"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <LocalGovDetail />
                    </Suspense>
                  }
                />
                <Route
                  path="local-government/lgr"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <LGRTrackerPage />
                    </Suspense>
                  }
                />
                <Route
                  path="mp-persona"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <MPPersona />
                    </Suspense>
                  }
                />
                <Route
                  path="campaigns"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <CampaignSessionsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="campaigns/create"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <SessionCreatePage />
                    </Suspense>
                  }
                />
                <Route
                  path="campaigns/bulk-upload"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <BulkUploadPage />
                    </Suspense>
                  }
                />
                <Route
                  path="campaigns/:sessionId"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <SessionDetailPage />
                    </Suspense>
                  }
                />
                <Route
                  path="campaigns/:sessionId/edit"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <SessionEditPage />
                    </Suspense>
                  }
                />
                <Route
                  path="campaigns/:sessionId/attendance"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <SessionAttendancePage />
                    </Suspense>
                  }
                />
                <Route
                  path="campaigns/:sessionId/register"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <SessionRegisterPage />
                    </Suspense>
                  }
                />
                <Route
                  path="campaigns/activity"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <CandidateActivityPage />
                    </Suspense>
                  }
                />
                <Route
                  path="campaigns/volunteers"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <VolunteerListPage />
                    </Suspense>
                  }
                />
                <Route
                  path="campaigns/volunteers/:volunteerId"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <VolunteerDetailPage />
                    </Suspense>
                  }
                />
                <Route path="*" element={<Suspense fallback={null}><PortalNotFound /></Suspense>} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <RouteSeo />
        </div>
      </main>
      {showIdleWarning && (
        <IdleWarning
          secondsLeft={warningSecondsLeft}
          onStay={resetIdleTimers}
          onLogout={handleLogout}
        />
      )}
      <CookieNotice />
      <GaDebugBadge />
    </div>
    </QueryClientProvider>
  );
}
