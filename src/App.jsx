import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { clearStoredSession, startLogout } from "./lib/cognito.js";
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
import EnquirePage from "./pages/EnquirePage.jsx";
import BlogIndexPage from "./pages/BlogIndexPage.jsx";
import BlogPostPage from "./pages/BlogPostPage.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Subscriptions from "./pages/Subscriptions.jsx";
import SubscriptionsEntry from "./pages/SubscriptionsEntry.jsx";
import Services from "./pages/Services.jsx";
import ServiceSupport from "./pages/ServiceSupport.jsx";
import PortalLayout from "./pages/portal/PortalLayout.jsx";
import PortalNotFound from "./pages/portal/PortalNotFound.jsx";
import PricingRules from "./pages/portal/PricingRules.jsx";
import Uploads from "./pages/portal/Uploads.jsx";
import Dashboard from "./pages/portal/Dashboard.jsx";
import Integrations from "./pages/portal/Integrations.jsx";
import Quotes from "./pages/portal/Quotes.jsx";
import QuoteDetail from "./pages/portal/QuoteDetail.jsx";
import ManualReviewPage from "./pages/portal/admin/ManualReviewPage.jsx";
const ConstituencyIndex = lazy(() => import("./pages/portal/constituency/ConstituencyIndex.jsx"));
const ConstituencyDetail = lazy(() => import("./pages/portal/constituency/ConstituencyDetail.jsx"));
const VulnerabilityDashboard = lazy(() => import("./pages/portal/constituency/VulnerabilityDashboard.jsx"));
const ReformThreatIndex = lazy(() => import("./pages/portal/constituency/ReformThreatIndex.jsx"));
const AlertsPage = lazy(() => import("./pages/portal/alerts/AlertsPage.jsx"));
const LocalGovIndex = lazy(() => import("./pages/portal/local-government/LocalGovIndex.jsx"));
const LocalGovDetail = lazy(() => import("./pages/portal/local-government/LocalGovDetail.jsx"));
const ByElectionWatchPage = lazy(() => import("./pages/portal/analytics/ByElectionWatchPage.jsx"));
const CorrelationsPage = lazy(() => import("./pages/portal/analytics/CorrelationsPage.jsx"));
const ModelPerformancePage = lazy(() => import("./pages/portal/analytics/ModelPerformancePage.jsx"));
const TargetSeatsPage = lazy(() => import("./pages/portal/constituency/TargetSeatsPage.jsx"));
import Session from "./pages/Session.jsx";
import SignUp from "./pages/SignUp.jsx";
import CookiesPage from "./pages/legal/CookiesPage.jsx";
import PrivacyPage from "./pages/legal/PrivacyPage.jsx";
import TermsPage from "./pages/legal/TermsPage.jsx";
import brandLogo from "./assets/brand/political-solutions-logo.png";
import RouteSeo from "./seo/RouteSeo.jsx";

const WARNING_DELAY_MS = 4 * 60 * 1000; // 4 minutes before showing the warning
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
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link className="brand" to="/" onClick={closeMenu}>
          <img
            className="brand-logo"
            src={brandLogo}
            alt="Political Solutions"
            width={96}
            height={96}
            loading="eager"
          />
          <div>
            <div style={{ fontWeight: 800 }}>Political Solutions</div>
            <div className="muted" style={{ fontSize: 13 }}>
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

export default function App() {
  const { items } = useCart();
  const [session, setSession] = useState(() => getSession());
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [warningSecondsLeft, setWarningSecondsLeft] = useState(WARNING_SECONDS);

  const warningTimeoutRef = useRef(null);
  const logoutTimeoutRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const authed = session.isAuthed;
  const tokens = authed ? session.tokens : null;

  const refreshSession = useCallback(() => {
    setSession(getSession());
  }, []);

  const handleClearSession = useCallback(() => {
    clearStoredSession();
    setSession({ isAuthed: false, user: null, expiresAt: null, tokens: null, reason: "cleared" });
  }, []);

  const handleLogout = useCallback(() => {
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
    <div className="app">
      <TopNav authed={authed} onLogout={handleLogout} cartCount={items.length} />
      <main className="content">
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login authed={authed} />} />
            <Route path="/callback" element={<Callback onAuth={handleAuthSuccess} />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/enquire" element={<EnquirePage />} />
            <Route path="/blog" element={<BlogIndexPage />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />
            <Route path="/cart" element={<CartEntry authed={authed} />} />
            <Route path="/checkout" element={<CheckoutEntry authed={authed} />} />
            <Route
              path="/checkout/confirmation"
              element={<CheckoutConfirmationEntry authed={authed} />}
            />
            <Route path="/subscriptions" element={<SubscriptionsEntry authed={authed} />} />
            <Route path="/services" element={<Services />} />
            <Route path="/services/election-support" element={<ServiceSupport />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/cookies" element={<CookiesPage />} />
            <Route element={<ProtectedRoute authed={authed} session={session} />}>
              <Route path="/portal" element={<PortalLayout />}>
                <Route index element={<Dashboard />} />
                <Route
                  path="session"
                  element={<Session session={session} onClear={handleClearSession} />}
                />
                <Route path="pricing" element={<Navigate to="/portal/subscriptions" replace />} />
                <Route path="pricing-rules" element={<PricingRules />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="cart" element={<Cart basePath="/portal" />} />
                <Route path="checkout" element={<Checkout basePath="/portal" />} />
                <Route
                  path="checkout/confirmation"
                  element={<CheckoutConfirmation basePath="/portal" />}
                />
                <Route path="settings/integrations" element={<Integrations />} />
                <Route path="uploads" element={<Uploads />} />
                <Route path="ops/quotes" element={<Quotes />} />
                <Route path="ops/quotes/:ref" element={<QuoteDetail />} />
                <Route path="admin/manual-review" element={<ManualReviewPage />} />
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
                  path="alerts"
                  element={
                    <Suspense fallback={<div className="page stack"><p className="muted">Loading…</p></div>}>
                      <AlertsPage />
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
                <Route path="*" element={<PortalNotFound />} />
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
    </div>
  );
}
