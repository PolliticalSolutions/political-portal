// Browser-only. Always import via React.lazy() — react-simple-maps depends
// on browser APIs (SVG, ResizeObserver) and cannot run in Node/SSR.

import { useEffect, useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { getConstituencyCentroids } from "../../lib/geoUtils.js";
import { SESSION_TYPE_COLOURS } from "../../lib/campaignConfig.js";

export default function SessionMap({ sessions = [], onPinClick }) {
  const [geoData, setGeoData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/geo/uk-constituencies.geojson")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load map data (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setGeoData(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => { cancelled = true; };
  }, []);

  const centroids = useMemo(() => (geoData ? getConstituencyCentroids(geoData) : new Map()), [geoData]);

  // Map session → constituency_id → ons_code centroid.
  // The campaign_sessions table stores constituency_id (UUID), not ons_code,
  // so the parent page should pass an `onsCodeBySession` mapping. If not
  // provided, fall back to ignoring pins for sessions we cannot place.
  const constituencyById = useMemo(() => {
    const m = new Map();
    for (const s of sessions) {
      if (s.constituency_ons_code) m.set(s.id, s.constituency_ons_code.toUpperCase());
    }
    return m;
  }, [sessions]);

  if (error) {
    return (
      <div style={{
        height: 400,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--portal-surface-raised)",
        border: "1px dashed var(--portal-border-strong)",
        borderRadius: 4,
        color: "var(--portal-text-muted)",
      }}>
        Map data could not be loaded.
      </div>
    );
  }
  if (!geoData) {
    return (
      <div style={{
        height: 400,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--portal-text-muted)",
      }}>
        Loading map…
      </div>
    );
  }

  return (
    <div style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4, overflow: "hidden" }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 2400, center: [-2, 54.5] }}
        width={800}
        height={600}
        style={{ width: "100%", height: "auto", background: "var(--portal-bg)" }}
      >
        <ZoomableGroup zoom={1} maxZoom={6} minZoom={0.8}>
          <Geographies geography={geoData}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="var(--portal-surface-raised)"
                  stroke="var(--portal-border)"
                  strokeWidth={0.3}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "var(--portal-navy)" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {sessions.map((session) => {
            const code = constituencyById.get(session.id);
            const centroid = code ? centroids.get(code) : null;
            if (!centroid) return null;
            const colour = SESSION_TYPE_COLOURS[session.session_type] || "var(--portal-text-muted)";
            return (
              <Marker key={session.id} coordinates={centroid} onClick={() => onPinClick && onPinClick(session)}>
                <circle r={5} fill={colour} stroke="#FFFFFF" strokeWidth={1.5} style={{ cursor: "pointer" }} />
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
