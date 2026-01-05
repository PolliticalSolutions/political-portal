import { useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { clearStoredSession, getStoredTokens } from "./lib/cognito.js";
import Button from "./components/Button.jsx";
import Callback from "./pages/Callback.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Portal from "./pages/Portal.jsx";

function ProtectedRoute({ authed, children }) {
  const location = useLocation();
  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

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
        <NavLink className={navClass} to="/callback?code=TEST">
          Callback
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
  const [tokens, setTokens] = useState(() => getStoredTokens());
  const authed = Boolean(tokens?.access_token);

  const handleLogout = () => {
    clearStoredSession();
    setTokens(null);
  };

  return (
    <div className="app">
      <TopNav authed={authed} onLogout={handleLogout} />
      <main className="content">
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login authed={authed} />} />
            <Route path="/callback" element={<Callback onAuth={setTokens} />} />
            <Route
              path="/portal"
              element={
                <ProtectedRoute authed={authed}>
                  <Portal tokens={tokens} onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
