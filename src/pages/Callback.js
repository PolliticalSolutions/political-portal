// src/pages/Callback.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { handleAuthCallbackIfPresent } from "../auth";

export default function Callback() {
  const nav = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const didHandle = await handleAuthCallbackIfPresent();
        if (didHandle) nav("/portal", { replace: true });
        else nav("/", { replace: true });
      } catch (e) {
        setError(String(e?.message || e));
      }
    })();
  }, [nav]);

  if (error) return <div style={{ padding: 24 }}>Auth error: {error}</div>;
  return <div style={{ padding: 24 }}>Signing you in…</div>;
}
