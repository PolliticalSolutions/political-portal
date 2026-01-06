import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { clearStoredSession, startLogout } from "./lib/cognito.js";
import { getSession } from "./auth/session.js";
import Button from "./components/Button.jsx";
import IdleWarning from "./components/IdleWarning.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Callback from "./pages/Callback.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Portal from "./pages/Portal.jsx";
import Pricing from "./pages/Pricing.jsx";
import Session from "./pages/Session.jsx";

const WARNING_DELAY_MS = 4 * 60 * 1000; // 4 minutes before showing the warning
const WARNING_WINDOW_MS = 60 * 1000; // 1 minute countdown before auto-logout
const WARNING_SECONDS = WARNING_WINDOW_MS / 1000;

function TopNav({ authed, onLogout }) {
  const navClass = ({ isActive }) => (isActive ? "navLink active" : "navLink");

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <div style={{ fontWeight: 800 }}>Political Solutions</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Operations & insight portal
          </div>
        </div>
      </div>
      <nav className="nav">
        <NavLink className={navClass} to="/">
          Home
        </NavLink>
        <NavLink className={navClass} to="/login">
          Login
        </NavLink>
        <NavLink className={navClass} to="/portal">
          Portal
        </NavLink>
        {authed && (
          <Button variant="ghost" onClick={onLogout}>
            Logout
          </Button>
        )}
      </nav>
    </header>
  );
}

export default function App() {
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
      clearStoredSession();
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
      <TopNav authed={authed} onLogout={handleLogout} />
      <main className="content">
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login authed={authed} />} />
            <Route path="/callback" element={<Callback onAuth={handleAuthSuccess} />} />
            <Route element={<ProtectedRoute authed={authed} session={session} />}>
              <Route
                path="/portal/session"
                element={<Session session={session} onClear={handleClearSession} />}
              />
              <Route path="/portal/pricing" element={<Pricing />} />
              <Route path="/portal/*" element={<Portal tokens={tokens} onLogout={handleLogout} />} />
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
    </div>
  );
}
