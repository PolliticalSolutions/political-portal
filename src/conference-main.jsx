import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import ConferenceShell from "./publicSite/ConferenceShell.jsx";
import "./index.css";
import "./public-site.css";
import "./pages/ConferencePage.css";

// Direct QR visits load no portal, authentication, Supabase client or analytics SDK.
const element = <React.StrictMode><BrowserRouter><ConferenceShell /></BrowserRouter></React.StrictMode>;
const root = document.getElementById("root");
if (root.hasChildNodes()) hydrateRoot(root, element);
else createRoot(root).render(element);
