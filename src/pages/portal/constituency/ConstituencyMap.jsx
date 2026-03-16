import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

// Place uk-constituencies.geojson in your public/ folder.
// The file must have features with a PCON24CD property matching your ons_code values.
// ONS boundary files: https://geoportal.statistics.gov.uk
const GEO_URL = "/uk-constituencies.geojson";

function toHexColor(hex) {
  if (!hex) return null;
  return hex.startsWith("#") ? hex : `#${hex}`;
}

function MapUnavailable() {
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
      <p style={{ margin: 0, fontWeight: 600, color: "#374151" }}>Map boundary file not found</p>
      <p className="muted" style={{ margin: 0, fontSize: 13, maxWidth: 340 }}>
        Add <code>uk-constituencies.geojson</code> to the <code>public/</code> folder.
        Download the PCON 2024 boundary file from the ONS Open Geography Portal and ensure each
        feature has a <code>PCON24CD</code> property matching your <code>ons_code</code> values.
      </p>
    </div>
  );
}

export default function ConstituencyMap({ winnersByOnsCode = {}, onConstituencyClick }) {
  const navigate = useNavigate();
  // null = unknown, true = available, false = missing
  const [geoAvailable, setGeoAvailable] = useState(null);

  useEffect(() => {
    fetch(GEO_URL, { method: "HEAD" })
      .then((r) => setGeoAvailable(r.ok))
      .catch(() => setGeoAvailable(false));
  }, []);

  const handleClick = (onsCode) => {
    if (!onsCode) return;
    if (onConstituencyClick) {
      onConstituencyClick(onsCode);
    } else {
      navigate(`/portal/constituency/${onsCode}`);
    }
  };

  if (geoAvailable === false) {
    return <MapUnavailable />;
  }

  if (geoAvailable === null) {
    return (
      <div
        style={{
          height: 400,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          borderRadius: 8,
        }}
      >
        <p className="muted">Loading map...</p>
      </div>
    );
  }

  return (
    <ComposableMap
      // Mercator centred on UK. Scale 1800 + center [-2, 55.4] fits
      // England, Wales, Scotland and NI within a 500×750 viewport.
      projection="geoMercator"
      projectionConfig={{ center: [-2, 55.4], scale: 1800 }}
      width={500}
      height={750}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies.map((geo) => {
            const onsCode = geo.properties.PCON24CD;
            const winner = winnersByOnsCode[onsCode];
            // Use a clearly visible mid-grey for constituencies with no matched winner,
            // so the map is never a blank white box even if party colours are absent.
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
          })
        }
      </Geographies>
    </ComposableMap>
  );
}
