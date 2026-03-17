// Browser-only component. Never import this file statically — always via React.lazy().
// react-simple-maps uses browser APIs (SVG, ResizeObserver) and cannot run in Node/SSR.
// The GeoJSON is bundled directly to avoid an HTTP fetch (eliminates the Amplify redirect issue).
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import geoData from "/src/data/uk-constituencies.geojson";

function toHexColor(hex) {
  if (!hex) return null;
  return hex.startsWith("#") ? hex : `#${hex}`;
}

function MapError({ reason }) {
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
      <p style={{ margin: 0, fontWeight: 600, color: "#374151" }}>Map could not be loaded</p>
      <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: 340 }}>{reason}</p>
    </div>
  );
}

export default function ConstituencyMapClient({ winnersByOnsCode = {}, onConstituencyClick }) {
  const navigate = useNavigate();
  const [mapError, setMapError] = useState(null);
  const errorLoggedRef = useRef(false);

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
          console.error("[ConstituencyMapClient] Geographies render error:", error);
          setMapError("Boundary data could not be processed.");
        }
        return null;
      }

      if (!loading && geographies.length === 0 && !errorLoggedRef.current) {
        errorLoggedRef.current = true;
        console.error("[ConstituencyMapClient] GeoJSON loaded but no features found — check PCON24CD property.");
        setMapError("Boundary data loaded but contained no features.");
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

  if (mapError) {
    return <MapError reason={mapError} />;
  }

  return (
    <ComposableMap
      // Mercator centred on UK. scale 1800 + center [-2, 55.4] fits
      // England, Wales, Scotland and NI within a 500×750 viewport.
      projection="geoMercator"
      projectionConfig={{ center: [-2, 55.4], scale: 1800 }}
      width={500}
      height={750}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <Geographies geography={geoData}>
        {handleGeographies}
      </Geographies>
    </ComposableMap>
  );
}
