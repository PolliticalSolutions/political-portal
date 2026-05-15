// Compute polygon centroid using the shoelace formula.
// Handles Polygon AND MultiPolygon — essential because many UK constituencies
// have MultiPolygon geometries (Western Isles, Orkney/Shetland, Isle of Wight,
// Highland, Argyll & Bute, Ynys Môn). d3-geo is NOT installed; this is the
// substitute used by SessionMap.jsx for pin placement.

function ringCentroid(ring) {
  // ring: array of [lon, lat]; first and last point identical (closed ring)
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area *= 0.5;
  if (area === 0) return null;
  return { centroid: [cx / (6 * area), cy / (6 * area)], absArea: Math.abs(area) };
}

function polygonCentroid(polygon) {
  // polygon = [outerRing, ...holes]; outer ring is sufficient for pin placement
  if (!Array.isArray(polygon) || polygon.length === 0) return null;
  return ringCentroid(polygon[0]);
}

export function featureCentroid(feature) {
  const g = feature && feature.geometry;
  if (!g) return null;

  if (g.type === "Polygon") {
    const result = polygonCentroid(g.coordinates);
    return result ? result.centroid : null;
  }

  if (g.type === "MultiPolygon") {
    // Pick the largest sub-polygon by absolute ring area. Places the pin on
    // the dominant landmass — correct for islands+mainland features.
    let best = null;
    let bestAbsArea = 0;
    for (const poly of g.coordinates) {
      const result = polygonCentroid(poly);
      if (result && result.absArea > bestAbsArea) {
        bestAbsArea = result.absArea;
        best = result.centroid;
      }
    }
    return best;
  }

  if (typeof console !== "undefined" && console.warn) {
    const code = feature && feature.properties && feature.properties.PCON24CD;
    console.warn(`[geoUtils] unsupported geometry type '${g.type}' for feature ${code || "<unknown>"}`);
  }
  return null;
}

let _cache = null;

/**
 * Build (and cache) the constituency centroid map keyed by uppercase PCON24CD.
 *
 * @param {{features: Array<object>}} geoData
 * @returns {Map<string, [number, number]>}  ons_code → [lon, lat]
 */
export function getConstituencyCentroids(geoData) {
  if (_cache) return _cache;
  _cache = new Map();
  if (!geoData || !Array.isArray(geoData.features)) return _cache;

  let missing = 0;
  for (const feature of geoData.features) {
    const code = feature && feature.properties && feature.properties.PCON24CD;
    if (!code) continue;
    const centroid = featureCentroid(feature);
    if (centroid) {
      _cache.set(String(code).toUpperCase(), centroid);
    } else {
      missing += 1;
    }
  }
  if (missing > 0 && typeof console !== "undefined" && console.warn) {
    console.warn(`[geoUtils] ${missing} feature(s) produced no centroid — pins will be missing for these constituencies`);
  }
  return _cache;
}

/** Reset the centroid cache. Test-only. */
export function _resetCentroidCache() {
  _cache = null;
}
