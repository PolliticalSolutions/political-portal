// Browser-only component. Never import this file statically — always via React.lazy().
// react-simple-maps uses browser APIs (SVG, ResizeObserver) and cannot run in Node/SSR.
// GeoJSON is fetched from /geo/uk-constituencies.geojson (public static asset, immutable cache).
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { resolvePartyColour, toHexColor } from "../../../utils/partyColours.js";

function blendHexWithWhite(hex, blend = 0.3) {
  const normalized = toHexColor(hex);
  if (!normalized || !/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return "#94a3b8";
  }

  const red = parseInt(normalized.slice(1, 3), 16);
  const green = parseInt(normalized.slice(3, 5), 16);
  const blue = parseInt(normalized.slice(5, 7), 16);

  const mix = (channel) => Math.round(channel + (255 - channel) * blend);

  return `#${[mix(red), mix(green), mix(blue)]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
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
  winnersByOnsCode = {},
  currentStatusByOnsCode = {},
  onConstituencyClick,
}) {
  const navigate = useNavigate();
  const [geoData, setGeoData] = useState(null);
  const [mapError, setMapError] = useState(null);
  const [position, setPosition] = useState({ coordinates: [-2, 55.4], zoom: 1 });

  useEffect(() => {
    fetch("/geo/uk-constituencies.geojson")
      .then((res) => res.json())
      .then((data) => setGeoData(data));
  }, []);
  const errorLoggedRef = useRef(false);
  const fillLoggedRef = useRef(false);

  console.log(
    "[ConstituencyMapClient] Winners prop received:",
    Object.entries(winnersByOnsCode)
      .slice(0, 3)
      .map(([onsCode, party]) => ({
        ons_code: onsCode,
        party_short_name: party?.short_name ?? party?.name ?? null,
        colour_hex: party?.colour_hex ?? null,
      }))
  );

  const winnerColoursByOnsCode = Object.fromEntries(
    Object.entries(winnersByOnsCode).map(([onsCode, party]) => {
      return [onsCode.toUpperCase(), resolvePartyColour(party)];
    })
  );

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
        const onsCode = (geo.properties.PCON24CD || "").toUpperCase();
        const baseColour = winnerColoursByOnsCode[onsCode] || "#94a3b8";
        const fill = blendHexWithWhite(baseColour, 0.35);
        const hasCurrentDifference = Boolean(currentStatusByOnsCode[onsCode]);

        if (!fillLoggedRef.current && onsCode) {
          fillLoggedRef.current = true;
          console.log("[ConstituencyMapClient] First geography fill applied:", {
            ons_code: onsCode,
            base_colour: baseColour,
            fill,
          });
        }

        return (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            stroke={hasCurrentDifference ? "#c89b4a" : "#ffffff"}
            strokeWidth={hasCurrentDifference ? 0.7 : 0.3}
            title={geo.properties.PCON24NM ?? onsCode}
            style={{
              default: { outline: "none", fill },
              hover: { outline: "none", fill, opacity: 0.78, cursor: "pointer" },
              pressed: { outline: "none", fill, opacity: 0.62 },
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
          className="portal-map-control-button"
          onClick={() => setPosition((current) => ({ ...current, zoom: Math.min(current.zoom * 1.25, 8) }))}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="portal-map-control-button"
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
          {geoData && (
            <Geographies geography={geoData}>
              {handleGeographies}
            </Geographies>
          )}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
