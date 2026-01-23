import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { clearStoredSession, startLogout } from "./lib/cognito.js";
import { useCart } from "./cart/cartStore.jsx";
import { getSession } from "./auth/session.js";
import Button from "./components/Button.jsx";
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
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Pricing from "./pages/Pricing.jsx";
import Subscriptions from "./pages/Subscriptions.jsx";
import SubscriptionsEntry from "./pages/SubscriptionsEntry.jsx";
import Services from "./pages/Services.jsx";
import ServiceSupport from "./pages/ServiceSupport.jsx";
import PortalLayout from "./pages/portal/PortalLayout.jsx";
import PortalNotFound from "./pages/portal/PortalNotFound.jsx";
import PricingRules from "./pages/portal/PricingRules.jsx";
import Dashboard from "./pages/portal/Dashboard.jsx";
import Integrations from "./pages/portal/Integrations.jsx";
import Quotes from "./pages/portal/Quotes.jsx";
import QuoteDetail from "./pages/portal/QuoteDetail.jsx";
import Session from "./pages/Session.jsx";
import SignUp from "./pages/SignUp.jsx";
import CookiesPage from "./pages/legal/CookiesPage.jsx";
import PrivacyPage from "./pages/legal/PrivacyPage.jsx";
import TermsPage from "./pages/legal/TermsPage.jsx";

const WARNING_DELAY_MS = 4 * 60 * 1000; // 4 minutes before showing the warning
const WARNING_WINDOW_MS = 60 * 1000; // 1 minute countdown before auto-logout
const WARNING_SECONDS = WARNING_WINDOW_MS / 1000;

function TopNav({ authed, onLogout, cartCount }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navClass = ({ isActive }) => (isActive ? "navLink active" : "navLink");

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <div style={{ fontWeight: 800 }}>Political Solutions</div>
            <div className="muted" style={{ fontSize: 13 }}>
              UK political operations platform
            </div>
          </div>
        </div>
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
            <NavLink className={navClass} to="/services" onClick={() => setMenuOpen(false)}>
              Services
            </NavLink>
            <NavLink className={navClass} to="/#how-it-works" onClick={() => setMenuOpen(false)}>
              How it works
            </NavLink>
            <NavLink className={navClass} to="/subscriptions" onClick={() => setMenuOpen(false)}>
              Pricing
            </NavLink>
            <NavLink className={navClass} to="/#resources" onClick={() => setMenuOpen(false)}>
              Resources
            </NavLink>
            <NavLink className={navClass} to="/#contact" onClick={() => setMenuOpen(false)}>
              Contact
            </NavLink>
          </nav>
          <div className="nav-cta">
            <Button as={NavLink} to="/login" variant="secondary" onClick={() => setMenuOpen(false)}>
              Client login
            </Button>
            <Button as={NavLink} to="/portal" variant="ghost" onClick={() => setMenuOpen(false)}>
              Portal
            </Button>
            {cartCount > 0 && (
              <NavLink className={navClass} to="/cart" onClick={() => setMenuOpen(false)}>
                Cart
                <span className="nav-badge">{cartCount}</span>
              </NavLink>
            )}
            {authed && (
              <Button variant="ghost" onClick={onLogout}>
                Log out
              </Button>
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
                <Route path="pricing" element={<Pricing />} />
                <Route path="pricing-rules" element={<PricingRules />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="cart" element={<Cart basePath="/portal" />} />
                <Route path="checkout" element={<Checkout basePath="/portal" />} />
                <Route
                  path="checkout/confirmation"
                  element={<CheckoutConfirmation basePath="/portal" />}
                />
                <Route path="settings/integrations" element={<Integrations />} />
                <Route path="ops/quotes" element={<Quotes />} />
                <Route path="ops/quotes/:ref" element={<QuoteDetail />} />
                <Route path="*" element={<PortalNotFound />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
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
