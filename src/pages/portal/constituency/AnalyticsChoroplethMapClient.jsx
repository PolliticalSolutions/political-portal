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
    <div className="portal-placeholder-panel">
      <p className="portal-placeholder-panel__title">Map could not be loaded</p>
      <p className="portal-placeholder-panel__body">{reason}</p>
    </div>
  );
}

export default function AnalyticsChoroplethMapClient({
  seatsByOnsCode = {},
  defaultFill = "#e2e8f0",
  defaultStroke = "#ffffff",
  ariaLabel = "Analytics map",
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
      return;
    }
    navigate(`/portal/constituency/${onsCode}`);
  };

  const handleGeographies = useCallback(
    ({ geographies, error, loading }) => {
      if (error) {
        if (!errorLoggedRef.current) {
          errorLoggedRef.current = true;
          setMapError("Boundary data could not be processed.");
        }
        return null;
      }

      if (!loading && geographies.length === 0 && !errorLoggedRef.current) {
        errorLoggedRef.current = true;
        setMapError("Boundary data loaded but contained no features.");
        return null;
      }

      return geographies.map((geo) => {
        const onsCode = (geo.properties.PCON24CD || "").toUpperCase();
        const seat = seatsByOnsCode[onsCode];
        const fill = toHexColor(seat?.fill) || defaultFill;
        const stroke = toHexColor(seat?.stroke) || defaultStroke;
        const strokeWidth = seat?.strokeWidth ?? 0.35;
        const titleText = seat?.title || geo.properties.PCON24NM || onsCode;

        return (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            stroke={stroke}
            strokeWidth={strokeWidth}
            title={titleText}
            style={{
              default: { outline: "none", fill },
              hover: {
                outline: "none",
                fill,
                opacity: seat ? 0.9 : 0.82,
                cursor: seat ? "pointer" : "default",
              },
              pressed: { outline: "none", fill, opacity: 0.75 },
            }}
            onClick={() => handleClick(onsCode)}
          />
        );
      });
    },
    [defaultFill, defaultStroke, onConstituencyClick, seatsByOnsCode]
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
        aria-label={ariaLabel}
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
          <Geographies geography={geoData}>{handleGeographies}</Geographies>
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
