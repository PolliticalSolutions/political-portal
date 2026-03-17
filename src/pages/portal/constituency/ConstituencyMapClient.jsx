// Browser-only component. Never import this file statically — always via React.lazy().
// react-simple-maps uses browser APIs (SVG, ResizeObserver) and cannot run in Node/SSR.
// The GeoJSON is bundled directly to avoid an HTTP fetch (eliminates the Amplify redirect issue).
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
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

export default function ConstituencyMapClient({
  winnerColoursByOnsCode = {},
  currentStatusByOnsCode = {},
  onConstituencyClick,
}) {
  const navigate = useNavigate();
  const [mapError, setMapError] = useState(null);
  const [position, setPosition] = useState({ coordinates: [-2, 55.4], zoom: 1 });
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
        const fill = winnerColoursByOnsCode[onsCode] ?? "#94a3b8";
        const hasCurrentDifference = Boolean(currentStatusByOnsCode[onsCode]);

        return (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            fill={fill}
            stroke={hasCurrentDifference ? "#c89b4a" : "#ffffff"}
            strokeWidth={hasCurrentDifference ? 0.7 : 0.3}
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
    [winnerColoursByOnsCode, currentStatusByOnsCode]
  );

  if (mapError) {
    return <MapError reason={mapError} />;
  }

  return (
    <div className="portal-map-canvas">
      <div className="portal-map-controls" aria-label="Map zoom controls">
        <button
          type="button"
          className="button secondary button--small"
          onClick={() => setPosition((current) => ({ ...current, zoom: Math.min(current.zoom * 1.25, 8) }))}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="button secondary button--small"
          onClick={() => setPosition((current) => ({ ...current, zoom: Math.max(current.zoom / 1.25, 1) }))}
          aria-label="Zoom out"
        >
          -
        </button>
      </div>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ center: [-2, 55.4], scale: 1800 }}
        width={500}
        height={750}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <ZoomableGroup
          center={position.coordinates}
          zoom={position.zoom}
          onMoveEnd={(nextPosition) => {
            setPosition({
              coordinates: nextPosition.coordinates,
              zoom: nextPosition.zoom,
            });
          }}
        >
          <Geographies geography={geoData}>
            {handleGeographies}
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
