warning: in the working copy of 'src/App.jsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/components/ProtectedRoute.jsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/lib/cognito.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/pages/Callback.jsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'src/pages/Login.jsx', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/src/App.jsx b/src/App.jsx[m
[1mindex 917a285..668a22b 100644[m
[1m--- a/src/App.jsx[m
[1m+++ b/src/App.jsx[m
[36m@@ -1,6 +1,6 @@[m
 import { useCallback, useEffect, useRef, useState } from "react";[m
 import { NavLink, Navigate, Route, Routes } from "react-router-dom";[m
[31m-import { getStoredTokens, startLogout } from "./lib/cognito.js";[m
[32m+[m[32mimport { clearStoredSession, getSession, startLogout } from "./lib/cognito.js";[m
 import Button from "./components/Button.jsx";[m
 import IdleWarning from "./components/IdleWarning.jsx";[m
 import ProtectedRoute from "./components/ProtectedRoute.jsx";[m
[36m@@ -48,7 +48,7 @@[m [mfunction TopNav({ authed, onLogout }) {[m
 }[m
 [m
 export default function App() {[m
[31m-  const [tokens, setTokens] = useState(() => getStoredTokens());[m
[32m+[m[32m  const [session, setSession] = useState(() => getSession());[m
   const [showIdleWarning, setShowIdleWarning] = useState(false);[m
   const [warningSecondsLeft, setWarningSecondsLeft] = useState(WARNING_SECONDS);[m
 [m
[36m@@ -56,10 +56,15 @@[m [mexport default function App() {[m
   const logoutTimeoutRef = useRef(null);[m
   const countdownIntervalRef = useRef(null);[m
 [m
[31m-  const authed = Boolean(tokens?.access_token);[m
[32m+[m[32m  const authed = session.isAuthed;[m
[32m+[m[32m  const tokens = authed ? session.tokens : null;[m
[32m+[m
[32m+[m[32m  const refreshSession = useCallback(() => {[m
[32m+[m[32m    setSession(getSession());[m
[32m+[m[32m  }, []);[m
 [m
   const handleLogout = useCallback(() => {[m
[31m-    setTokens(null);[m
[32m+[m[32m    setSession({ isAuthed: false, user: null, expiresAt: null, tokens: null, reason: null });[m
     startLogout();[m
   }, []);[m
 [m
[36m@@ -127,6 +132,32 @@[m [mexport default function App() {[m
     };[m
   }, [authed, clearTimers, resetIdleTimers]);[m
 [m
[32m+[m[32m  useEffect(() => {[m
[32m+[m[32m    if (session.reason === "expired") {[m
[32m+[m[32m      clearStoredSession();[m
[32m+[m[32m    }[m
[32m+[m[32m  }, [session.reason]);[m
[32m+[m
[32m+[m[32m  useEffect(() => {[m
[32m+[m[32m    refreshSession();[m
[32m+[m[32m    const intervalId = window.setInterval(refreshSession, 30000);[m
[32m+[m[32m    const handleFocus = () => refreshSession();[m
[32m+[m
[32m+[m[32m    window.addEventListener("focus", handleFocus);[m
[32m+[m
[32m+[m[32m    return () => {[m
[32m+[m[32m      clearInterval(intervalId);[m
[32m+[m[32m      window.removeEventListener("focus", handleFocus);[m
[32m+[m[32m    };[m
[32m+[m[32m  }, [refreshSession]);[m
[32m+[m
[32m+[m[32m  const handleAuthSuccess = useCallback([m
[32m+[m[32m    (newTokens) => {[m
[32m+[m[32m      setSession(getSession(newTokens));[m
[32m+[m[32m    },[m
[32m+[m[32m    [][m
[32m+[m[32m  );[m
[32m+[m
   return ([m
     <div className="app">[m
       <TopNav authed={authed} onLogout={handleLogout} />[m
[36m@@ -135,8 +166,8 @@[m [mexport default function App() {[m
           <Routes>[m
             <Route path="/" element={<Home />} />[m
             <Route path="/login" element={<Login authed={authed} />} />[m
[31m-            <Route path="/callback" element={<Callback onAuth={setTokens} />} />[m
[31m-            <Route element={<ProtectedRoute authed={authed} />}>[m
[32m+[m[32m            <Route path="/callback" element={<Callback onAuth={handleAuthSuccess} />} />[m
[32m+[m[32m            <Route element={<ProtectedRoute authed={authed} session={session} />}>[m
               <Route path="/portal/*" element={<Portal tokens={tokens} onLogout={handleLogout} />} />[m
             </Route>[m
             <Route path="*" element={<Navigate to="/" replace />} />[m
[1mdiff --git a/src/components/ProtectedRoute.jsx b/src/components/ProtectedRoute.jsx[m
[1mindex e88f872..b8569b4 100644[m
[1m--- a/src/components/ProtectedRoute.jsx[m
[1m+++ b/src/components/ProtectedRoute.jsx[m
[36m@@ -2,13 +2,18 @@[m [mimport { Navigate, Outlet, useLocation } from "react-router-dom";[m
 [m
 const returnKey = "cognito_post_login_redirect";[m
 [m
[31m-export default function ProtectedRoute({ authed }) {[m
[32m+[m[32mexport default function ProtectedRoute({ authed, session }) {[m
   const location = useLocation();[m
   const requestedPath = `${location.pathname}${location.search}`;[m
[32m+[m[32m  const sessionExpired = session?.reason === "expired";[m
 [m
   if (!authed) {[m
     sessionStorage.setItem(returnKey, requestedPath);[m
[31m-    return <Navigate to="/login" replace state={{ from: requestedPath }} />;[m
[32m+[m[32m    const state = { from: requestedPath };[m
[32m+[m[32m    if (sessionExpired) {[m
[32m+[m[32m      state.message = "Session expired, please sign in again.";[m
[32m+[m[32m    }[m
[32m+[m[32m    return <Navigate to="/login" replace state={state} />;[m
   }[m
 [m
   return <Outlet />;[m
[1mdiff --git a/src/lib/cognito.js b/src/lib/cognito.js[m
[1mindex 5fb1efc..70b6438 100644[m
[1m--- a/src/lib/cognito.js[m
[1m+++ b/src/lib/cognito.js[m
[36m@@ -6,6 +6,26 @@[m [mconst redirectKey = "cognito_post_login_redirect";[m
 [m
 const hasWindow = typeof window !== "undefined";[m
 [m
[32m+[m[32mfunction decodeJwtPayload(token) {[m
[32m+[m[32m  if (!token || typeof token !== "string") return null;[m
[32m+[m[32m  const parts = token.split(".");[m
[32m+[m[32m  if (parts.length < 2) return null;[m
[32m+[m
[32m+[m[32m  const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");[m
[32m+[m[32m  const padding = (4 - (normalized.length % 4)) % 4;[m
[32m+[m[32m  try {[m
[32m+[m[32m    const json = atob(normalized + "=".repeat(padding));[m
[32m+[m[32m    return JSON.parse(json);[m
[32m+[m[32m  } catch {[m
[32m+[m[32m    return null;[m
[32m+[m[32m  }[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mfunction getExpiryMs(payload) {[m
[32m+[m[32m  if (!payload?.exp) return null;[m
[32m+[m[32m  return payload.exp * 1000;[m
[32m+[m[32m}[m
[32m+[m
 function base64UrlEncode(bytes) {[m
   return btoa(String.fromCharCode(...bytes))[m
     .replace(/\+/g, "-")[m
[36m@@ -79,6 +99,40 @@[m [mexport function clearStoredSession() {[m
   sessionStorage.removeItem(redirectKey);[m
 }[m
 [m
[32m+[m[32mexport function isTokenValid(token) {[m
[32m+[m[32m  const payload = decodeJwtPayload(token);[m
[32m+[m[32m  const expiresAt = getExpiryMs(payload);[m
[32m+[m[32m  if (!expiresAt) return false;[m
[32m+[m[32m  return expiresAt > Date.now();[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32mexport function getSession(providedTokens) {[m
[32m+[m[32m  const tokens = providedTokens || getStoredTokens();[m
[32m+[m[32m  if (!tokens || !tokens.id_token || !tokens.access_token) {[m
[32m+[m[32m    return { isAuthed: false, user: null, expiresAt: null, tokens: null, reason: "missing" };[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const idPayload = decodeJwtPayload(tokens.id_token);[m
[32m+[m[32m  const accessPayload = decodeJwtPayload(tokens.access_token);[m
[32m+[m
[32m+[m[32m  const idExpired = !isTokenValid(tokens.id_token);[m
[32m+[m[32m  const accessExpired = !isTokenValid(tokens.access_token);[m
[32m+[m[32m  const expired = idExpired || accessExpired;[m
[32m+[m
[32m+[m[32m  const expiresAt = Math.min([m
[32m+[m[32m    getExpiryMs(idPayload) ?? Number.POSITIVE_INFINITY,[m
[32m+[m[32m    getExpiryMs(accessPayload) ?? Number.POSITIVE_INFINITY[m
[32m+[m[32m  );[m
[32m+[m
[32m+[m[32m  return {[m
[32m+[m[32m    isAuthed: !expired,[m
[32m+[m[32m    user: idPayload || null,[m
[32m+[m[32m    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,[m
[32m+[m[32m    tokens,[m
[32m+[m[32m    reason: expired ? "expired" : null,[m
[32m+[m[32m  };[m
[32m+[m[32m}[m
[32m+[m
 function buildAuthorizeUrl(codeChallenge) {[m
   const url = new URL("/oauth2/authorize", cognitoConfig.domain);[m
   url.searchParams.set("response_type", "code");[m
[1mdiff --git a/src/pages/Callback.jsx b/src/pages/Callback.jsx[m
[1mindex 862b9ee..05fa5eb 100644[m
[1m--- a/src/pages/Callback.jsx[m
[1m+++ b/src/pages/Callback.jsx[m
[36m@@ -1,6 +1,6 @@[m
 import { useEffect, useState } from "react";[m
 import { useLocation, useNavigate } from "react-router-dom";[m
[31m-import { clearStoredSession, exchangeCodeForTokens, consumePostLoginRedirect, getStoredTokens } from "../lib/cognito.js";[m
[32m+[m[32mimport { clearStoredSession, exchangeCodeForTokens, consumePostLoginRedirect, getSession } from "../lib/cognito.js";[m
 import Badge from "../components/Badge.jsx";[m
 import Card from "../components/Card.jsx";[m
 [m
[36m@@ -21,12 +21,17 @@[m [mexport default function Callback({ onAuth }) {[m
       return;[m
     }[m
 [m
[31m-    // If we already have tokens or no code, bounce straight to portal.[m
[31m-    if (getStoredTokens() || !code) {[m
[32m+[m[32m    const existingSession = getSession();[m
[32m+[m[32m    // If we already have a valid session or no code, bounce straight to portal.[m
[32m+[m[32m    if (existingSession.isAuthed || !code) {[m
       navigate(consumePostLoginRedirect("/portal"), { replace: true });[m
       return;[m
     }[m
 [m
[32m+[m[32m    if (existingSession.reason === "expired") {[m
[32m+[m[32m      clearStoredSession();[m
[32m+[m[32m    }[m
[32m+[m
     let cancelled = false;[m
     exchangeCodeForTokens(code)[m
       .then((tokens) => {[m
[1mdiff --git a/src/pages/Login.jsx b/src/pages/Login.jsx[m
[1mindex c488cde..79b4b28 100644[m
[1m--- a/src/pages/Login.jsx[m
[1m+++ b/src/pages/Login.jsx[m
[36m@@ -9,6 +9,7 @@[m [mexport default function Login({ authed }) {[m
   const [error, setError] = useState(null);[m
   const location = useLocation();[m
   const redirectedFrom = location.state?.from;[m
[32m+[m[32m  const redirectMessage = location.state?.message;[m
 [m
   const handleLogin = async () => {[m
     setError(null);[m
[36m@@ -36,7 +37,8 @@[m [mexport default function Login({ authed }) {[m
               {authed ? "Already signed in" : "Continue to sign in"}[m
             </Button>[m
             <p className="helper">Hosted by AWS Cognito with PKCE for security.</p>[m
[31m-            {redirectedFrom && <div className="status">Please sign in to continue.</div>}[m
[32m+[m[32m            {redirectedFrom && !redirectMessage && <div className="status">Please sign in to continue.</div>}[m
[32m+[m[32m            {redirectMessage && <div className="status">{redirectMessage}</div>}[m
             {error && <div className="status error">{error}</div>}[m
           </div>[m
         </Card>[m
