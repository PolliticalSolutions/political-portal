import { useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { clearStoredSession, getStoredTokens } from "./lib/cognito.js";
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
    <nav className="nav">
      <div>Political Portal</div>
      <div className="navLinks">
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
          <button type="button" className="navLink" onClick={onLogout}>
            Logout
          </button>
        )}
      </div>
    </nav>
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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login authed={authed} />} />
          <Route path="/callback" element={<Callback onAuth={setTokens} />} />
          <Route
            path="/portal"
            element={
              <ProtectedRoute authed={authed}>
                <Portal tokens={tokens} />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
