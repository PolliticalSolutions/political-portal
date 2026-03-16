import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

// Place uk-constituencies.geojson in your public/ folder.
// The file must have features with a PCON24CD property matching your ons_code values.
const GEO_URL = "/uk-constituencies.geojson";

function toHexColor(hex) {
  if (!hex) return null;
  return hex.startsWith("#") ? hex : `#${hex}`;
}

function MapUnavailable({ reason }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: 400,
        background: "#f8fafc",
        border: "1px dashed #cbd5e1",
        borderRadius: 8,
        padding: 24,
        textAlign: "center",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 32 }}>🗺️</div>
      <p style={{ margin: 0, fontWeight: 600, color: "#374151" }}>Map could not be loaded</p>
      <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: 340 }}>
        {reason || (
          <>
            Add <code>uk-constituencies.geojson</code> to the <code>public/</code> folder with a{" "}
            <code>PCON24CD</code> property on each feature.
          </>
        )}
      </p>
    </div>
  );
}

export default function ConstituencyMap({ winnersByOnsCode = {}, onConstituencyClick }) {
  const navigate = useNavigate();

  // SSR guard: react-simple-maps uses browser APIs. Never render on the server.
  const [isMounted, setIsMounted] = useState(false);
  const [mapError, setMapError] = useState(null);
  const errorLoggedRef = useRef(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleClick = (onsCode) => {
    if (!onsCode) return;
    if (onConstituencyClick) {
      onConstituencyClick(onsCode);
    } else {
      navigate(`/portal/constituency/${onsCode}`);
    }
  };

  const handleGeographies = useCallback(
    ({ geographies, error, loading }) => {
      if (error) {
        if (!errorLoggedRef.current) {
          errorLoggedRef.current = true;
          console.error("[ConstituencyMap] Failed to load GeoJSON from", GEO_URL, error);
          setMapError(
            "Boundary file could not be fetched. Check that uk-constituencies.geojson is present in the public/ folder and is being served correctly."
          );
        }
        return null;
      }

      if (!loading && geographies.length === 0 && !errorLoggedRef.current) {
        errorLoggedRef.current = true;
        console.error(
          "[ConstituencyMap] GeoJSON loaded but no features found. URL:",
          GEO_URL,
          "— ensure features have a PCON24CD property."
        );
        setMapError(
          "Boundary file loaded but contained no features. Ensure the file uses PCON24CD as the constituency code property."
        );
        return null;
      }

      return geographies.map((geo) => {
        const onsCode = geo.properties.PCON24CD;
        const winner = winnersByOnsCode[onsCode];
        const fill = toHexColor(winner?.colour_hex) ?? "#94a3b8";

        return (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            fill={fill}
            stroke="#ffffff"
            strokeWidth={0.3}
            title={geo.properties.PCON24NM ?? onsCode}
            style={{
              default: { outline: "none" },
              hover: { outline: "none", opacity: 0.75, cursor: "pointer" },
              pressed: { outline: "none", opacity: 0.6 },
            }}
            onClick={() => handleClick(onsCode)}
          />
        );
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [winnersByOnsCode]
  );

  // SSR: return an empty placeholder that matches the map's rendered height
  if (!isMounted) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "500 / 750",
          background: "#f8fafc",
          borderRadius: 8,
        }}
      />
    );
  }

  if (mapError) {
    return <MapUnavailable reason={mapError} />;
  }

  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={{ center: [-2, 55.4], scale: 1800 }}
      width={500}
      height={750}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <Geographies geography={GEO_URL}>
        {handleGeographies}
      </Geographies>
    </ComposableMap>
  );
}
